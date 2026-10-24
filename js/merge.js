/* ============================================================
   merge.js — 三方合并（纯函数，不碰 DOM / 存储，方便单测）
   ------------------------------------------------------------
   输入：base（上次同步成功的样子）、local（本机）、remote（云端）
   输出：合并后的状态 + 冲突清单

   规则（按 id 逐条比较）：
     只有一边改过          → 用改过的那边
     两边都改过、都还在     → 保留本地，记一条冲突
     一边删了、另一边改过   → 保留改过的那份（宁可多留，不丢数据）
     两边都删了            → 删除
   ============================================================ */

export const COLLECTIONS = ['trips', 'days', 'bookings', 'gear', 'expenses', 'library'];

/** 键排序后的稳定序列化：Postgres 的 jsonb 会重排键，不能直接比 JSON.stringify */
export function stable(v) {
  if (v === undefined) return '\u0000undef';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

const same = (a, b) => stable(a) === stable(b);

function indexById(arr) {
  const m = new Map();
  for (const it of arr || []) if (it && it.id) m.set(it.id, it);
  return m;
}

export function mergeCollection(baseArr, localArr, remoteArr, conflicts = []) {
  const b = indexById(baseArr);
  const l = indexById(localArr);
  const r = indexById(remoteArr);

  const order = [];
  const seen = new Set();
  for (const it of [...(localArr || []), ...(remoteArr || []), ...(baseArr || [])]) {
    if (!it || !it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    order.push(it.id);
  }

  const out = [];
  for (const id of order) {
    const bv = b.get(id);
    const lv = l.get(id);
    const rv = r.get(id);

    const localChanged = !same(lv, bv);
    const remoteChanged = !same(rv, bv);

    let pick;
    if (localChanged && remoteChanged) {
      if (lv === undefined) pick = rv;              // 本地删、云端改 → 保留
      else if (rv === undefined) pick = lv;         // 云端删、本地改 → 保留
      else { pick = lv; conflicts.push(id); }       // 都改 → 保本地，记冲突
    } else if (localChanged) {
      pick = lv;
    } else {
      pick = rv;
    }

    if (pick !== undefined) out.push(pick);
  }
  return out;
}

export function mergePayloads(baseP, localP, remoteP, nowIso) {
  const conflicts = [];
  const merged = {
    schema: 1,
    app: 'trailnote',
    meta: { updatedAt: nowIso || new Date().toISOString() },
    settings: localP.settings || remoteP.settings || (baseP && baseP.settings),
  };
  for (const k of COLLECTIONS) {
    merged[k] = mergeCollection(
      baseP ? baseP[k] : undefined,
      localP[k],
      remoteP[k],
      conflicts
    );
  }
  return { merged, conflicts };
}
