/* ============================================================
   vault.js — 个人多设备同步
   ------------------------------------------------------------
   目标：同一趟行程，电脑上改完，手机上打开就是新的；手机上记一笔花销，
        回家用电脑也能看到。

   模型：
     * 整个应用状态作为一条 JSON 存进 Supabase（按「同步码」的 sha256）
     * 同步码 = 凭证，只存在你自己的设备上，服务器不存明文
     * 写入用乐观并发（rev），对不上就返回云端最新内容
     * 客户端用「三方合并」：base（上次同步的样子）/ local / remote

   合并规则（按 id 逐条）：
     只有一边改过        → 用改过的那边
     两边都改过、都在     → 保留本地那份，记一条冲突
     一边删了、另一边改过 → 保留改过的那份（不丢数据）
     两边都删了          → 删除
   ============================================================ */

import { store } from './store.js';
import { rpc, randomKey } from './sync.js';
import { isSyncConfigured } from './config.js';
import { mergePayloads, COLLECTIONS, stable } from './merge.js';

const KEY_STORE = 'trailnote.sync.key';
const BASE_STORE = 'trailnote.sync.base';
const META_STORE = 'trailnote.sync.meta';
const BACKUP_STORE = 'trailnote.sync.backup';

const DEBOUNCE_MS = 2500;
const RETRY_MS = 15000;

/* ---------------- 状态 ---------------- */

let key = '';
let baseRev = 0;
let base = null;            // 上次同步成功时的完整快照
let busy = false;
let applying = false;
let timer = null;
let dirty = false;
let started = false;
let lastError = '';
let lastSyncedAt = null;
let conflicts = [];
let onChange = null;

const deviceId = (() => {
  try {
    const m = JSON.parse(localStorage.getItem(META_STORE) || '{}');
    return m.deviceId || randomKey(8);
  } catch { return randomKey(8); }
})();

/* ---------------- 持久化 ---------------- */

function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_STORE) || '{}');
    baseRev = Number(m.rev) || 0;
    lastSyncedAt = m.lastSyncedAt || null;
    key = localStorage.getItem(KEY_STORE) || '';
    const raw = localStorage.getItem(BASE_STORE);
    base = raw ? JSON.parse(raw) : null;
  } catch {
    baseRev = 0; base = null;
  }
}

function saveMeta() {
  try {
    localStorage.setItem(META_STORE, JSON.stringify({ rev: baseRev, deviceId, lastSyncedAt }));
    if (base) localStorage.setItem(BASE_STORE, JSON.stringify(base));
    else localStorage.removeItem(BASE_STORE);
  } catch (e) {
    // 配额满了就算了，下次会重新合并
  }
}

/* ---------------- 快照 ---------------- */

export function snapshot() {
  const d = store.data;
  // 注意：不要把 meta 放进来。meta.updatedAt 每次换数据都会变，
  // 放进快照会导致「启动时误判为有未同步改动」，每次开 App 都白推一版。
  const out = {
    schema: 1,
    app: 'trailnote',
    settings: d.settings,
  };
  for (const k of COLLECTIONS) out[k] = (d[k] || []).map((x) => x);
  return out;
}

/* ---------------- 落地 ---------------- */

function adopt(payload, { backup = true } = {}) {
  applying = true;
  try {
    if (backup) {
      try { localStorage.setItem(BACKUP_STORE, JSON.stringify(store.data)); } catch {}
    }
    store.replaceAll(payload);
  } finally {
    applying = false;
  }
  window.dispatchEvent(new CustomEvent('trailnote:data-replaced'));
}

/* ---------------- 同步主流程 ---------------- */

async function pullRemote() {
  return await rpc('pull_vault', { p_key: key });
}

async function pushRemote(payload, baseRevArg) {
  return await rpc('push_vault', { p_key: key, p_payload: payload, p_base_rev: baseRevArg });
}

function finish(rev, snapshotPayload) {
  baseRev = Number(rev) || baseRev;
  base = snapshotPayload || snapshot();
  dirty = false;
  lastError = '';
  lastSyncedAt = new Date().toISOString();
  saveMeta();
}

async function runSync() {
  if (!key || busy) return status();
  busy = true;
  notify();

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await pullRemote();

      // 云端还没有这个同步码 → 把本地传上去
      if (!remote) {
        const res = await pushRemote(snapshot(), 0);
        finish(res.rev);
        return status();
      }

      // 这台设备是第一次连上 → 直接采纳云端（先备份本地）
      if (!base || baseRev === 0) {
        adopt(remote.payload);
        finish(remote.rev, remote.payload);
        return status();
      }

      // 云端版本没变 → 只在本地有改动时上传
      if (Number(remote.rev) === Number(baseRev)) {
        if (!dirty) {
          lastSyncedAt = new Date().toISOString();
          saveMeta();
          return status();
        }
        const res = await pushRemote(snapshot(), baseRev);
        if (res && res.conflict) {
          base = res.payload;
          baseRev = res.rev;
          saveMeta();
          continue;
        }
        finish(res.rev);
        return status();
      }

      // 云端更新了 → 三方合并
      const { merged, conflicts: c } = mergePayloads(base, snapshot(), remote.payload);
      conflicts = c.slice();
      applyMergedAndSync(merged);

      // 合并结果如果和云端一模一样，就不要再推一次，
      // 否则两台设备会互相「推来推去」，版本号无限涨。
      if (stable(snapshot()) === stable(remote.payload)) {
        finish(remote.rev, remote.payload);
        return status();
      }

      const res = await pushRemote(snapshot(), remote.rev);
      if (res && res.conflict) {
        base = res.payload;
        baseRev = res.rev;
        saveMeta();
        continue;
      }
      finish(res.rev);
      return status();
    }

    lastError = '同步冲突过多，稍后再试';
  } catch (err) {
    lastError = err.message || '同步失败';
  } finally {
    busy = false;
    notify();
  }
  return status();
}

function applyMergedAndSync(merged) {
  applying = true;
  try {
    try { localStorage.setItem(BACKUP_STORE, JSON.stringify(store.data)); } catch {}
    store.replaceAll(merged);
  } finally {
    applying = false;
  }
  window.dispatchEvent(new CustomEvent('trailnote:data-replaced'));
}

/* ---------------- 调度 ---------------- */

function schedule(delay = DEBOUNCE_MS) {
  clearTimeout(timer);
  timer = setTimeout(() => { runSync(); }, delay);
}

function notify() {
  if (onChange) {
    try { onChange(status()); } catch (e) { console.error(e); }
  }
}

/* ---------------- 对外 ---------------- */

export function status() {
  return {
    enabled: Boolean(key),
    key,
    rev: baseRev,
    syncing: busy,
    pending: dirty,
    lastError,
    lastSyncedAt,
    conflicts: conflicts.slice(),
    deviceId,
  };
}

export function subscribeStatus(fn) {
  onChange = fn;
  return () => { onChange = null; };
}

export function syncNow() {
  if (!key) return Promise.resolve(status());
  clearTimeout(timer);
  dirty = true;
  return runSync();
}

/** 生成同步码：这台设备作为起点 */
export async function createVault() {
  if (!isSyncConfigured()) throw new Error('还没有配置 Supabase');
  const k = randomKey(32);
  localStorage.setItem(KEY_STORE, k);
  key = k;
  baseRev = 0;
  base = null;
  dirty = true;
  const st = await runSync();
  return st;
}

/** 用已有的同步码接入：会拉云端覆盖本地（先备份） */
export async function joinVault(code) {
  if (!isSyncConfigured()) throw new Error('还没有配置 Supabase');
  const k = String(code || '').trim();
  if (k.length < 16) throw new Error('同步码看起来不对（至少要 16 位）');

  localStorage.setItem(KEY_STORE, k);
  key = k;
  baseRev = 0;
  base = null;

  const remote = await pullRemote();
  if (remote) {
    adopt(remote.payload);
    finish(remote.rev, remote.payload);
  } else {
    // 这个码还没有数据 → 用当前本地内容起一个
    dirty = true;
    await runSync();
  }
  notify();
  return status();
}

/** 断开同步（不删云端数据） */
export function disconnect() {
  localStorage.removeItem(KEY_STORE);
  localStorage.removeItem(BASE_STORE);
  key = '';
  base = null;
  baseRev = 0;
  dirty = false;
  lastError = '';
  saveMeta();
  notify();
}

/** 出错时人工恢复上一次被覆盖前的数据 */
export function hasBackup() {
  try { return Boolean(localStorage.getItem(BACKUP_STORE)); } catch { return false; }
}

export function restoreBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_STORE);
    if (!raw) return false;
    store.replaceAll(JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

export function startVaultSync() {
  if (started) return;
  started = true;
  loadMeta();

  // 订阅必须无条件建立：即使启动时还没同步码，
  // 用户之后在会话里开启同步也要能自动上传。
  store.subscribe(() => {
    if (!key || applying) return;
    dirty = true;
    schedule();
  });

  window.addEventListener('online', () => { if (key && dirty) schedule(600); });
  document.addEventListener('visibilitychange', () => {
    if (key && document.visibilityState === 'visible') schedule(300);
  });
  window.addEventListener('focus', () => { if (key) schedule(300); });

  // 打开时就检查：上次有没有没来得及上传的改动（比如关得太快、当时没网）
  if (key) {
    try {
      if (base && stable(snapshot()) !== stable(base)) dirty = true;
    } catch {}
    runSync();
  }
}
