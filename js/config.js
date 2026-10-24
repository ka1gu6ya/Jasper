/* ============================================================
   config.js — 云端配置
   ------------------------------------------------------------
   留空 = 完全本地运行，一切照旧。
   填上 Supabase 的 URL 和 anon key，就会解锁「生成只读分享链接」。

   获取方式：Supabase Dashboard → Project Settings → API
     Project URL  → 填到 url
     anon public  → 填到 anonKey（这是公开密钥，放在前端是正常用法）

   安全说明：anon key 公开没问题，真正的权限控制在数据库的 RPC 里
   （见 supabase.sql）。别人拿到 anon key 也列不出你分享过的行程。
   ============================================================ */

export const SUPABASE = {
  url: 'https://yqsnabbpmvnigapbfqej.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxc25hYmJwbXZuaWdhcGJmcWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MzE3MjksImV4cCI6MjEwODQwNzcyOX0.2jrfVggepv1MHbNdT-DranlArjSxSgtNaaGwutoQrIc',
};

/**
 * 运行时覆盖：方便本地用模拟后端测试，也方便自建实例。
 * 用法：在 index.html 里引入 app.js 之前加一行
 *   <script>window.__TRAILNOTE_SUPABASE__ = { url: '...', anonKey: '...' }</script>
 */
export function getSupabaseConfig() {
  const o = typeof window !== 'undefined' ? window.__TRAILNOTE_SUPABASE__ : null;
  if (o && o.url && o.anonKey) return { url: o.url, anonKey: o.anonKey };
  return { url: SUPABASE.url, anonKey: SUPABASE.anonKey };
}

export function isSyncConfigured() {
  const c = getSupabaseConfig();
  return Boolean(c.url && c.anonKey);
}
