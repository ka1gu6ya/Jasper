/* ============================================================
   util.js — 无依赖的小工具：ID、转义、格式化、日期
   ============================================================ */

export const uid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** HTML 转义 —— 所有用户输入进模板前必须过一遍 */
export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 属性值转义（用于 data-*） */
export const attr = (s) => esc(s);

/* ---------------- 数字 / 重量 / 金额 ---------------- */

export function fmtWeight(g) {
  g = Number(g) || 0;
  if (g >= 1000) {
    const kg = g / 1000;
    return (kg >= 100 ? kg.toFixed(0) : kg.toFixed(2).replace(/\.?0+$/, '')) + ' kg';
  }
  return Math.round(g) + ' g';
}

export function fmtKg(g, digits = 2) {
  return (Number(g || 0) / 1000).toFixed(digits) + ' kg';
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'ISK']);

export function fmtMoney(n, cur = 'CNY') {
  n = Number(n) || 0;
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: ZERO_DECIMAL.has(cur) ? 0 : 2,
      maximumFractionDigits: ZERO_DECIMAL.has(cur) ? 0 : 2,
    }).format(n);
  } catch {
    return cur + ' ' + n.toFixed(2);
  }
}

export function fmtNum(n, digits = 0) {
  n = Number(n) || 0;
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/* ---------------- 日期（全部按本地日期处理，避免时区漂移） ---------------- */

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function parseDay(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

export function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayStr() {
  return ymd(new Date());
}

export function addDays(s, n) {
  const d = parseDay(s);
  if (!d) return s;
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 闭区间日期列表，最多 90 天，防止误输入撑爆页面 */
export function eachDay(start, end) {
  const a = parseDay(start), b = parseDay(end);
  if (!a || !b || b < a) return start ? [start] : [];
  const out = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(a);
    d.setDate(a.getDate() + i);
    out.push(ymd(d));
    if (ymd(d) >= ymd(b)) break;
  }
  return out;
}

export function fmtDate(s, opts = {}) {
  const d = parseDay(s);
  if (!d) return '—';
  const { year = false, weekday = true, short = false } = opts;
  const base = short
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${d.getMonth() + 1}月${d.getDate()}日`;
  const y = year ? `${d.getFullYear()}年` : '';
  const w = weekday ? ' ' + WEEK[d.getDay()] : '';
  return y + base + w;
}

export function fmtDateRange(a, b) {
  if (!a && !b) return '未定日期';
  if (a && b && a !== b) {
    const da = parseDay(a), db = parseDay(b);
    const sameYear = da.getFullYear() === db.getFullYear();
    return `${fmtDate(a, { year: !sameYear, weekday: false })} – ${fmtDate(b, { weekday: false })}`;
  }
  return fmtDate(a || b, { weekday: false });
}

/** "2026-11-05T08:30" → {date:'2026-11-05', time:'08:30'} */
export function splitDateTime(s) {
  if (!s) return { date: '', time: '' };
  const [date, time] = String(s).split('T');
  return { date: date || '', time: (time || '').slice(0, 5) };
}

export function fmtDateTime(s) {
  const { date, time } = splitDateTime(s);
  if (!date) return '—';
  return fmtDate(date, { weekday: date !== todayStr() ? false : true }) + (time ? ' ' + time : '');
}

export function daysUntil(s) {
  const d = parseDay(s);
  if (!d) return null;
  const t = parseDay(todayStr());
  return Math.round((d - t) / 86400000);
}

/** "3 分钟前" / "刚刚" */
export function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 30) return '刚刚';
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return String(iso).slice(0, 10);
}

export function nightsBetween(a, b) {
  const da = parseDay(a), db = parseDay(b);
  if (!da || !db) return 0;
  return Math.max(0, Math.round((db - da) / 86400000));
}

/* ---------------- 其它 ---------------- */

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function download(filename, content, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s) {
  return (
    String(s || 'trip')
      .replace(/[\\/:*?"<>|\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'trip'
  );
}
