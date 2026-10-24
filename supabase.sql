-- ============================================================
-- TrailNote · Supabase 只读分享
-- ------------------------------------------------------------
-- 用法：Supabase Dashboard → SQL Editor → 粘贴整个文件 → Run
--
-- 设计取舍：
--   * 不开放 shared_trips 表的直接读写权限。anon key 是公开的，
--     如果允许 select，任何人拿到 anon key 就能把你分享过的行程全列出来。
--   * 只暴露三个 RPC，靠「公开 token + 独立 edit key」区分读和写：
--       - token     在分享链接里，谁拿到谁能看
--       - edit_key  只留在你自己的设备上，用来更新/删除
--   * edit_key 存的是 bcrypt 哈希，数据库被拖走也反推不出明文。
--
-- 注意：Supabase 把 pgcrypto 装在 extensions schema 里，所以下面的函数
-- 都写了 set search_path = public, extensions。少写 extensions 会报
-- "function gen_salt(unknown) does not exist"。
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 表
-- ------------------------------------------------------------
create table if not exists public.shared_trips (
  token         text primary key,
  edit_key_hash text not null,
  payload       jsonb not null,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.shared_trips enable row level security;

-- 关键：收回 anon / authenticated 的表权限，只走 RPC
revoke all on public.shared_trips from anon, authenticated;
grant all on public.shared_trips to service_role;

-- ------------------------------------------------------------
-- 发布 / 更新
-- ------------------------------------------------------------
create or replace function public.publish_shared_trip(
  p_token     text,
  p_edit_key  text,
  p_payload   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.shared_trips;
begin
  if p_token is null or length(p_token) < 12 then
    raise exception '分享码无效';
  end if;
  if p_edit_key is null or length(p_edit_key) < 12 then
    raise exception '编辑密钥无效';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception '内容为空';
  end if;
  -- 兜底：单个分享不超过 2MB，防止误传大文件
  if length(p_payload::text) > 2 * 1024 * 1024 then
    raise exception '内容过大（超过 2MB）';
  end if;

  select * into v_row from public.shared_trips where token = p_token;

  if found then
    if v_row.edit_key_hash <> crypt(p_edit_key, v_row.edit_key_hash) then
      raise exception '没有修改这个分享的权限';
    end if;
    update public.shared_trips
       set payload    = p_payload,
           version    = version + 1,
           updated_at = now()
     where token = p_token
     returning * into v_row;
  else
    insert into public.shared_trips (token, edit_key_hash, payload)
    values (p_token, crypt(p_edit_key, gen_salt('bf')), p_payload)
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'version',    v_row.version,
    'updated_at', v_row.updated_at
  );
end;
$$;

-- ------------------------------------------------------------
-- 读取（凭 token，任何人可调）
-- ------------------------------------------------------------
create or replace function public.get_shared_trip(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.shared_trips;
begin
  if p_token is null or length(p_token) < 12 then
    return null;
  end if;

  select * into v_row from public.shared_trips where token = p_token;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'payload',    v_row.payload,
    'version',    v_row.version,
    'updated_at', v_row.updated_at
  );
end;
$$;

-- ------------------------------------------------------------
-- 停止分享
-- ------------------------------------------------------------
create or replace function public.revoke_shared_trip(
  p_token    text,
  p_edit_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.shared_trips;
begin
  select * into v_row from public.shared_trips where token = p_token;
  if not found then
    return false;
  end if;
  if v_row.edit_key_hash <> crypt(p_edit_key, v_row.edit_key_hash) then
    raise exception '没有删除这个分享的权限';
  end if;

  delete from public.shared_trips where token = p_token;
  return true;
end;
$$;

-- ------------------------------------------------------------
-- 授权：只允许调用这三个函数，不允许碰表
-- ------------------------------------------------------------
revoke all on function public.publish_shared_trip(text, text, jsonb) from public;
revoke all on function public.get_shared_trip(text) from public;
revoke all on function public.revoke_shared_trip(text, text) from public;

grant execute on function public.publish_shared_trip(text, text, jsonb) to anon, authenticated;
grant execute on function public.get_shared_trip(text) to anon, authenticated;
grant execute on function public.revoke_shared_trip(text, text) to anon, authenticated;
