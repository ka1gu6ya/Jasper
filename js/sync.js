/* ============================================================
   sync.js — 只读分享（Supabase）
   ------------------------------------------------------------
   只做一件事：把一趟行程发布成一个只读快照，别人凭链接查看。
   真正的实时协作需要「成员 + 每账号鉴权」，那是下一步。

   安全模型：
     公开 token（在链接里）  → 能看
     edit key（只在本机）    → 能更新 / 能删除
     两者都通过 RPC 校验，前端拿不到表，也列不出别人的分享。
   ============================================================ */

import { getSupabaseConfig, isSyncConfigured } from './config.js';

const CACHE_PREFIX = 'trailnote.shared.';
const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 去掉 l/o/0/1 之类易混字符

export function randomKey(len = 22) {
  const bytes = new Uint8Array(len);
  if (globalThis.crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
}

/* ---------------- 错误翻译 ---------------- */

/** 把 Postgres / PostgREST 的原始报错翻成「下一步该干嘛」 */
function friendlyError(raw, status) {
  const m = String(raw || '');
  if (/gen_salt|crypt\(/i.test(m)) {
    return '数据库缺少 pgcrypto：请重新运行一遍 supabase.sql（新版已修正 search_path）';
  }
  if (/Could not find the function|PGRST202|does not exist.*function/i.test(m)) {
    return '数据库里还没有这几个函数：请先在 SQL Editor 里运行 supabase.sql';
  }
  if (/permission denied/i.test(m)) {
    return '权限不足：supabase.sql 里的 grant 语句可能没跑完';
  }
  if (/JWT|apikey|Invalid API key/i.test(m) || status === 401) {
    return 'anon key 不对：检查 js/config.js 里的 url 和 anonKey 是否属于同一个项目';
  }
  if (/row-level security|42501/i.test(m)) {
    return '被行级安全策略挡住了：确认 supabase.sql 已完整执行';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) {
    return '连不上 Supabase：检查网络，或 config.js 里的 url 是否正确';
  }
  return m || `请求失败（HTTP ${status}）`;
}

/* ---------------- RPC ---------------- */

export async function rpc(name, params) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) throw new Error('还没有配置 Supabase（js/config.js）');

  let res;
  try {
    res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(params),
    });
  } catch (e) {
    throw new Error('连不上服务器，检查网络或配置里的 URL');
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const raw =
      (data && (data.message || data.error_description || data.hint)) ||
      (typeof data === 'string' ? data : '');
    throw new Error(friendlyError(String(raw).replace(/^ERROR:\s*/i, ''), res.status));
  }
  return data;
}

/* ---------------- 快照 ---------------- */

/** 打包成只读快照。注意：绝不能把 trip.share（含 editKey）发出去 */
export function buildPayload(store, trip) {
  const { share, ...tripSafe } = trip;
  const s = store.data.settings;

  return {
    v: 1,
    app: 'trailnote',
    exportedAt: new Date().toISOString(),
    settings: {
      baseCurrency: s.baseCurrency,
      rates: s.rates,
    },
    trip: tripSafe,
    days: store.daysOf(trip.id),
    bookings: store.bookingsOf(trip.id),
    gear: store.gearOf(trip.id),
    expenses: store.expensesOf(trip.id),
  };
}

/* ---------------- 发布 / 读取 / 撤回 ---------------- */

export async function publishTrip(store, trip, opts = {}) {
  if (!isSyncConfigured()) throw new Error('还没有配置 Supabase');

  const prev = trip.share || {};
  const token = prev.token || randomKey(20);
  const editKey = prev.editKey || randomKey(26);
  const payload = buildPayload(store, trip);

  const result = await rpc('publish_shared_trip', {
    p_token: token,
    p_edit_key: editKey,
    p_payload: payload,
  });

  const version = Number(result?.version) || (Number(prev.version) || 0) + 1;

  const nowIso = new Date().toISOString();
  store.commit((s) => {
    const t = s.trips.find((x) => x.id === trip.id);
    if (t) {
      t.share = {
        token,
        editKey,
        version,
        publishedAt: nowIso,
        // 自动同步用：记住这份内容的指纹，下次比对就知道有没有改过
        syncedHash: opts.hash || null,
        syncedAt: nowIso,
      };
    }
  }, { action: 'trip.share.publish', entity: 'trip', id: trip.id });

  return { token, version };
}

export async function fetchShared(token) {
  const data = await rpc('get_shared_trip', { p_token: token });
  if (!data || !data.payload) return null;
  writeCache(token, data);
  return data;
}

export async function revokeShare(store, trip) {
  const share = trip.share;
  if (!share) return;
  await rpc('revoke_shared_trip', { p_token: share.token, p_edit_key: share.editKey });
  store.commit((s) => {
    const t = s.trips.find((x) => x.id === trip.id);
    if (t) delete t.share;
  }, { action: 'trip.share.revoke', entity: 'trip', id: trip.id });
}

/* ---------------- 本地缓存（离线也能看上次的内容） ---------------- */

function writeCache(token, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + token, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch (e) {
    // 存储满了就跳过，不影响主流程
  }
}

export function readCache(token) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + token);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ---------------- 工具 ---------------- */

export function shareLink(token) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/s/${token}`;
}

export function parseSharedToken(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] === 's' && parts[1]) return decodeURIComponent(parts[1]);
  return null;
}

/** 把分享内容存成本地的一份新行程 */
export function importShared(store, payload) {
  const src = payload.trip || {};
  const newTripId = `trip_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  store.commit((s) => {
    s.trips.push({
      ...src,
      id: newTripId,
      name: (src.name || '分享的行程') + '（副本）',
      share: undefined,
      createdAt: now,
      updatedAt: now,
    });
    for (const d of payload.days || []) s.days.push({ ...d, id: `day_${Math.random().toString(36).slice(2, 9)}`, tripId: newTripId });
    for (const b of payload.bookings || []) s.bookings.push({ ...b, id: `bk_${Math.random().toString(36).slice(2, 9)}`, tripId: newTripId });
    for (const g of payload.gear || []) s.gear.push({ ...g, id: `gear_${Math.random().toString(36).slice(2, 9)}`, tripId: newTripId });
    for (const e of payload.expenses || []) s.expenses.push({ ...e, id: `ex_${Math.random().toString(36).slice(2, 9)}`, tripId: newTripId });
  }, { action: 'trip.import', entity: 'trip', id: newTripId });

  return newTripId;
}
