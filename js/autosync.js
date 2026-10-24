/* ============================================================
   autosync.js — 分享内容自动同步
   ------------------------------------------------------------
   目标：别人打开分享链接时，看到的永远是「你最后一次改动」的内容，
        不需要你手动点「更新链接内容」。

   做法：
     1. 监听 store 的每次写入，算出该行程快照的指纹
     2. 和上次发布时的指纹比对，不一致就标记为「待同步」
     3. 防抖 3.5 秒后自动发布（避免连续编辑时疯狂请求）
     4. 失败（比如在山上没信号）就保留脏标记，20 秒后重试
     5. 下次打开 App 时会重新比对一次，离线期间的改动也会补传

   只有持有 editKey 的设备（也就是你自己那台）才会发布，
   别人拿到链接只能看，不会反向写回。
   ============================================================ */

import { store } from './store.js';
import { buildPayload, publishTrip } from './sync.js';
import { isSyncConfigured } from './config.js';

const DEBOUNCE_MS = 3500;
const RETRY_MS = 20000;

/** FNV-1a 32 位指纹，足够用来判断「内容有没有变」 */
function fingerprint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const dirty = new Set();
let timer = null;
let busy = false;
let started = false;
let lastError = '';
let lastSyncedAt = null;
let onChange = null;

/* ---------------- 内部 ---------------- */

function signatureOf(trip) {
  return fingerprint(JSON.stringify(buildPayload(store, trip)));
}

function scan() {
  for (const trip of store.data.trips) {
    if (!trip.share || !trip.share.token) continue;
    const sig = signatureOf(trip);
    if (sig !== trip.share.syncedHash) dirty.add(trip.id);
    else dirty.delete(trip.id);
  }
}

function schedule(delay = DEBOUNCE_MS) {
  clearTimeout(timer);
  timer = setTimeout(flush, delay);
}

async function flush() {
  if (busy || !dirty.size) return;
  busy = true;
  let failed = false;

  for (const id of [...dirty]) {
    const trip = store.trip(id);
    if (!trip || !trip.share) { dirty.delete(id); continue; }

    const sig = signatureOf(trip);
    if (sig === trip.share.syncedHash) { dirty.delete(id); continue; }

    try {
      await publishTrip(store, trip, { hash: sig });
      dirty.delete(id);
      lastError = '';
      lastSyncedAt = new Date().toISOString();
    } catch (err) {
      failed = true;
      lastError = err.message || '同步失败';
    }
  }

  busy = false;
  emit();
  if (dirty.size) schedule(failed ? RETRY_MS : DEBOUNCE_MS);
}

function emit() {
  if (onChange) {
    try { onChange(status()); } catch (e) { console.error(e); }
  }
}

/* ---------------- 对外 ---------------- */

export function status() {
  return {
    pending: dirty.size,
    syncing: busy,
    lastError,
    lastSyncedAt,
  };
}

export function subscribeStatus(fn) {
  onChange = fn;
  return () => { onChange = null; };
}

/** 立即同步（给「立即同步」按钮用） */
export function syncNow() {
  scan();
  if (!dirty.size) return Promise.resolve();
  clearTimeout(timer);
  return flush();
}

/** 某个行程是否正在等待同步 */
export function isPending(tripId) {
  return dirty.has(tripId);
}

export function startAutoSync() {
  if (started) return;
  started = true;

  // 首次加载：补传离线期间的改动
  scan();
  if (dirty.size) schedule(1500);

  store.subscribe(() => {
    scan();
    if (dirty.size) schedule();
  });

  // 网络恢复时立刻试一次
  window.addEventListener('online', () => {
    if (dirty.size) schedule(600);
  });

  // 切回页面时也检查一下
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dirty.size) schedule(600);
  });
}

export { isSyncConfigured };
