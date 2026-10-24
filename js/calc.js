/* ============================================================
   calc.js — 领域计算：背包重量、难度指数、汇率、账目汇总、ICS
   纯函数，不碰 DOM，方便以后搬到后端 / 小程序复用。
   ============================================================ */

import { parseDay, esc } from './util.js';

/* ==================== 枚举定义 ==================== */

export const TRIP_TYPES = [
  { id: 'hiking', name: '徒步为主', icon: 'mountain' },
  { id: 'city', name: '城市为主', icon: 'building' },
  { id: 'mixed', name: '徒步 + 城市', icon: 'route' },
];

export const GEAR_CATEGORIES = [
  { id: 'pack', name: '背包', color: '#6b7f6e', icon: 'backpack' },
  { id: 'shelter', name: '庇护所', color: '#8a6f4e', icon: 'tent' },
  { id: 'sleep', name: '睡眠系统', color: '#5b6f8a', icon: 'moon' },
  { id: 'clothing', name: '衣物', color: '#7a5f8a', icon: 'shirt' },
  { id: 'cook', name: '炊具', color: '#9a7c3f', icon: 'flame' },
  { id: 'food', name: '食物', color: '#8a7b4a', icon: 'apple' },
  { id: 'water', name: '水与水具', color: '#4a7b8a', icon: 'droplet' },
  { id: 'electronics', name: '电子设备', color: '#5a6a7a', icon: 'battery' },
  { id: 'safety', name: '安全急救', color: '#a05f5f', icon: 'shield' },
  { id: 'hygiene', name: '洗漱护理', color: '#6a8a7a', icon: 'droplet' },
  { id: 'misc', name: '其他', color: '#8a8a85', icon: 'box' },
];

export const WT_SEGMENTS = [
  { id: 'base', name: '基础重量', en: 'Base Weight', hint: '除穿戴与消耗品外的全部装备' },
  { id: 'worn', name: '穿戴重量', en: 'Worn Weight', hint: '身上穿的、手里拿的，不计入背负' },
  { id: 'consumable', name: '消耗品', en: 'Consumables', hint: '食物、水、气罐，会随行程减少' },
];

export const TERRAINS = [
  { id: 'trail', name: '成熟步道', mult: 1.0 },
  { id: 'gravel', name: '碎石 / 乱石坡', mult: 1.15 },
  { id: 'bush', name: '灌木 / 野路', mult: 1.2 },
  { id: 'snow', name: '雪线 / 冰川', mult: 1.35 },
  { id: 'climb', name: '铁索 / 攀爬段', mult: 1.45 },
];

export const BOOKING_TYPES = [
  { id: 'flight', name: '航班', icon: 'plane', color: '#3f6b8a' },
  { id: 'train', name: '火车 / 高铁', icon: 'train', color: '#6b5f8a' },
  { id: 'bus', name: '大巴 / 包车', icon: 'bus', color: '#8a7b4a' },
  { id: 'boat', name: '船 / 渡轮', icon: 'boat', color: '#4a7b8a' },
  { id: 'hotel', name: '住宿', icon: 'bed', color: '#8a6f4e' },
  { id: 'permit', name: '许可 / 门票', icon: 'ticket', color: '#2f6b52' },
  { id: 'restaurant', name: '餐厅', icon: 'utensils', color: '#a05f5f' },
  { id: 'other', name: '其他', icon: 'box', color: '#8a8a85' },
];

export const EXPENSE_CATEGORIES = [
  { id: 'transport', name: '交通', color: '#3f6b8a', icon: 'train' },
  { id: 'lodging', name: '住宿', color: '#8a6f4e', icon: 'bed' },
  { id: 'food', name: '餐饮', color: '#a05f5f', icon: 'utensils' },
  { id: 'tickets', name: '门票 / 许可', color: '#2f6b52', icon: 'ticket' },
  { id: 'gear', name: '装备', color: '#6b5f8a', icon: 'backpack' },
  { id: 'shopping', name: '购物', color: '#8a7b4a', icon: 'bag' },
  { id: 'other', name: '其他', color: '#8a8a85', icon: 'box' },
];

export const ITEM_TYPES = [
  { id: 'transport', name: '交通', icon: 'train' },
  { id: 'hike', name: '徒步', icon: 'mountain' },
  { id: 'activity', name: '活动', icon: 'star' },
  { id: 'food', name: '餐饮', icon: 'utensils' },
  { id: 'stay', name: '住宿', icon: 'bed' },
  { id: 'note', name: '备忘', icon: 'note' },
];

export const byId = (arr, id) => arr.find((x) => x.id === id) || arr[arr.length - 1];
export const catOf = (id) => byId(GEAR_CATEGORIES, id);
export const bookingTypeOf = (id) => byId(BOOKING_TYPES, id);
export const expenseCatOf = (id) => byId(EXPENSE_CATEGORIES, id);
export const itemTypeOf = (id) => byId(ITEM_TYPES, id);

/* ==================== 背包重量 ==================== */

export const gearUnitWeight = (it) => (Number(it.weightG) || 0) * (Number(it.qty) || 1);

/**
 * 按背包客行业标准拆分重量。
 *   base       = 除穿戴、消耗品之外的全部装备
 *   worn       = 穿戴 / 手持
 *   consumable = 食物、水、燃料
 *   pack       = base + consumable       → 实际背在肩上的
 *   skinOut    = base + worn + consumable → 人 + 全部装备
 */
export function computeWeights(gear = []) {
  let base = 0, worn = 0, consumable = 0;
  const byCategory = new Map();
  const byPackage = { base: 0, worn: 0, consumable: 0 };

  for (const it of gear) {
    const w = gearUnitWeight(it);
    if (!w) continue;

    const seg = it.worn ? 'worn' : it.consumable ? 'consumable' : 'base';
    if (seg === 'worn') worn += w;
    else if (seg === 'consumable') consumable += w;
    else base += w;
    byPackage[seg] += w;

    const c = byCategory.get(it.category) || { id: it.category, weight: 0, count: 0 };
    c.weight += w;
    c.count += 1;
    byCategory.set(it.category, c);
  }

  const pack = base + consumable;
  const skinOut = base + worn + consumable;

  return {
    base, worn, consumable, pack, skinOut,
    byCategory: [...byCategory.values()].sort((a, b) => b.weight - a.weight),
    byPackage,
    sections: [
      { ...WT_SEGMENTS[0], weight: base },
      { ...WT_SEGMENTS[2], weight: consumable },
      { ...WT_SEGMENTS[1], weight: worn },
    ],
    items: gear.length,
  };
}

/** 基础重量的行业档位（克） */
export function baseWeightGrade(grams) {
  const kg = grams / 1000;
  if (!grams) return { id: 'none', label: '未录入', en: '—', color: 'var(--text-3)', range: '添加装备后自动评估' };
  if (kg < 4.5) return { id: 'ul', label: '超轻量', en: 'Ultralight', color: '#2f6b52', range: '基础重量 < 4.5 kg' };
  if (kg < 9) return { id: 'light', label: '轻量化', en: 'Lightweight', color: '#4a7b8a', range: '4.5 – 9 kg' };
  if (kg < 13.6) return { id: 'traditional', label: '传统负重', en: 'Traditional', color: '#9a7c3f', range: '9 – 13.6 kg' };
  return { id: 'heavy', label: '重装', en: 'Heavy', color: '#a05f5f', range: '> 13.6 kg' };
}

/* ==================== 难度指数 ==================== */

/**
 * 单日强度（km 等效）：
 *   距离 × (1 + 爬升/1000 × 1.5) × 负重系数 × 地形系数 × 海拔系数
 * 15km / 800m 爬升 ≈ 33 km 等效，符合体感。
 */
export function dayEffort(day, packKg = 0) {
  const h = day.hike || {};
  const dist = Number(h.distanceKm) || 0;
  const gain = Number(h.gainM) || 0;
  if (!dist && !gain) return 0;

  const kmEq = dist * (1 + (gain / 1000) * 1.5);
  const load = 1 + Math.max(0, (Number(packKg) || 0) - 6) * 0.05;
  const terrain = (TERRAINS.find((t) => t.id === h.terrain) || TERRAINS[0]).mult;
  const alt = Number(h.maxAlt) > 3000 ? 1 + (Number(h.maxAlt) - 3000) / 10000 : 1;

  return kmEq * load * terrain * alt;
}

export const DIFFICULTY_GRADES = [
  { max: 30, id: 'easy', label: '轻松', color: '#2f6b52', desc: '半天行程强度，节奏宽松' },
  { max: 70, id: 'moderate', label: '适中', color: '#4a7b8a', desc: '每天行走 5–7 小时，普通体能可胜任' },
  { max: 120, id: 'challenging', label: '挑战', color: '#9a7c3f', desc: '需要一定训练基础与稳定节奏' },
  { max: 200, id: 'hard', label: '困难', color: '#b06a3d', desc: '长距离 + 大爬升，建议预留恢复日' },
  { max: Infinity, id: 'severe', label: '严苛', color: '#a05f5f', desc: '高强度连续多日，需充分准备' },
];

export function computeDifficulty(days = [], packKg = 0) {
  const perDay = days.map((d) => ({
    id: d.id,
    date: d.date,
    effort: Math.round(dayEffort(d, packKg) * 10) / 10,
    distanceKm: Number(d.hike?.distanceKm) || 0,
    gainM: Number(d.hike?.gainM) || 0,
    maxAlt: Number(d.hike?.maxAlt) || 0,
    terrain: d.hike?.terrain || 'trail',
  }));

  const total = perDay.reduce((s, d) => s + d.effort, 0);
  const hikingDays = perDay.filter((d) => d.effort > 0).length;
  const distance = perDay.reduce((s, d) => s + d.distanceKm, 0);
  const gain = perDay.reduce((s, d) => s + d.gainM, 0);
  const maxAlt = perDay.reduce((s, d) => Math.max(s, d.maxAlt), 0);
  const grade = DIFFICULTY_GRADES.find((g) => total <= g.max) || DIFFICULTY_GRADES[0];
  const hardest = perDay.slice().sort((a, b) => b.effort - a.effort)[0] || null;

  return {
    total: Math.round(total * 10) / 10,
    grade: total > 0 ? grade : { ...grade, label: '待评估', id: 'none', desc: '先在行程里填写每日距离与爬升' },
    perDay,
    hikingDays,
    distance: Math.round(distance * 10) / 10,
    gain: Math.round(gain),
    maxAlt,
    hardest,
    loadFactor: Math.round((1 + Math.max(0, (Number(packKg) || 0) - 6) * 0.05) * 100) / 100,
  };
}

/* ==================== 汇率 / 账目 ==================== */

export const DEFAULT_RATES = {
  CNY: 1, USD: 7.15, EUR: 7.78, JPY: 0.0475, HKD: 0.92, GBP: 9.05,
  THB: 0.2, KRW: 0.0052, TWD: 0.222, SGD: 5.3, AUD: 4.72, NZD: 4.3,
  CHF: 8.1, ISK: 0.052, NOK: 0.65, SEK: 0.67, INR: 0.086, MYR: 1.6, VND: 0.00028,
};

/** 1 单位外币 = rate 单位本币 */
export function toBase(amount, currency, settings) {
  const base = settings?.baseCurrency || 'CNY';
  if (!currency || currency === base) return Number(amount) || 0;
  const rate = Number(settings?.rates?.[currency]) || DEFAULT_RATES[currency] || 1;
  return (Number(amount) || 0) * rate;
}

export function expenseStats(expenses = [], settings = {}) {
  const base = settings.baseCurrency || 'CNY';
  let total = 0;
  const byCategory = new Map();
  const byDay = new Map();
  const byCurrency = new Map();

  for (const e of expenses) {
    const amt = toBase(e.amount, e.currency, settings);
    total += amt;

    const c = byCategory.get(e.category) || { id: e.category, amount: 0, count: 0 };
    c.amount += amt;
    c.count += 1;
    byCategory.set(e.category, c);

    byDay.set(e.date, (byDay.get(e.date) || 0) + amt);

    const cur = byCurrency.get(e.currency) || { currency: e.currency, amount: 0, count: 0 };
    cur.amount += Number(e.amount) || 0;
    cur.count += 1;
    byCurrency.set(e.currency, cur);
  }

  const cats = [...byCategory.values()].sort((a, b) => b.amount - a.amount);
  return {
    total,
    baseCurrency: base,
    byCategory: cats,
    byDay: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    byCurrency: [...byCurrency.values()].sort((a, b) => b.amount - a.amount),
    count: expenses.length,
    avgPerEntry: expenses.length ? total / expenses.length : 0,
    topCategory: cats[0] || null,
  };
}

/* ==================== 同行成员 ==================== */

export const MEMBER_COLORS = [
  '#2f6b52', '#4a6f8a', '#8a6f4e', '#7a5f8a',
  '#a05f5f', '#6a8a7a', '#9a7c3f', '#5b6f8a',
];

export const MEMBER_ROLE_SUGGESTIONS = ['领队', '协作', '队员', '后勤', '财务', '家属'];

export const memberById = (trip, id) => ((trip && trip.members) || []).find((m) => m.id === id) || null;
export const memberName = (trip, id) => (memberById(trip, id) || {}).name || '';

/** 人名缩写：中文取末两字，英文取首字母 */
export function memberInitial(name = '') {
  const s = String(name).trim();
  if (!s) return '?';
  if (/[\u4e00-\u9fa5]/.test(s)) {
    // 中文：单字取自己，两字取末字（阿哲→哲），三四字取末两字（王小明→小明）
    if (s.length <= 1) return s;
    return s.length === 2 ? s.slice(-1) : s.slice(-2);
  }
  return s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

/** 按「谁背」拆分重量 */
export function weightsByOwner(gear = [], members = []) {
  const map = new Map();
  for (const m of members) {
    map.set(m.id, { id: m.id, name: m.name, role: m.role || '', color: m.color, weight: 0, count: 0 });
  }
  const pool = { id: null, name: '公共 / 未分配', role: '', color: '#9b9a97', weight: 0, count: 0 };

  for (const it of gear) {
    const w = gearUnitWeight(it);
    if (!w) continue;
    const rec = it.ownerId ? map.get(it.ownerId) : null;
    if (rec) { rec.weight += w; rec.count += 1; }
    else { pool.weight += w; pool.count += 1; }
  }

  const perMember = [...map.values()].sort((a, b) => b.weight - a.weight);
  return { perMember, pool, heaviest: perMember[0] || null, total: perMember.reduce((s, x) => s + x.weight, 0) + pool.weight };
}

/* ==================== 多人分摊结算 ==================== */

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * 结算规则：
 *   - 有 splitWith：按 splitWith 人数均摊，付款人先垫付
 *   - 只有 paidBy 没有 splitWith：视为个人支出，付款人独自承担，不计入结算
 *   - 两者都没有：不计入结算
 * 金额先折算成基础货币再算，避免多币种混算。
 */
export function computeSettlement(expenses = [], members = [], settings = {}) {
  if (!members || members.length < 2) return null;

  const idx = new Map(members.map((m) => [
    m.id,
    { id: m.id, name: m.name, role: m.role || '', color: m.color, paid: 0, share: 0, entries: 0 },
  ]));

  let counted = 0;
  for (const e of expenses) {
    const amt = toBase(e.amount, e.currency, settings);
    if (!amt) continue;

    let people = Array.isArray(e.splitWith) ? e.splitWith.filter((id) => idx.has(id)) : [];
    people = [...new Set(people)];

    // splitWith 为空 → 退化为「谁付谁承担」，仅当指定了付款人才计入
    if (!people.length) {
      if (!e.paidBy || !idx.has(e.paidBy)) continue;
      people = [e.paidBy];
    }

    const payer = e.paidBy ? idx.get(e.paidBy) : null;
    if (payer) payer.paid += amt;

    const each = amt / people.length;
    for (const id of people) {
      const rec = idx.get(id);
      rec.share += each;
      rec.entries += 1;
    }
    counted += 1;
  }

  if (!counted) return null;

  const list = [...idx.values()].map((x) => ({ ...x, net: round2(x.paid - x.share) }));

  // 最少转账次数：贪心配对
  const creditors = list.filter((x) => x.net > 0.009).map((x) => ({ ...x })).sort((a, b) => b.net - a.net);
  const debtors = list.filter((x) => x.net < -0.009).map((x) => ({ ...x })).sort((a, b) => a.net - b.net);

  const transfers = [];
  let ci = 0, di = 0, guard = 0;
  while (ci < creditors.length && di < debtors.length && guard++ < 200) {
    const c = creditors[ci], d = debtors[di];
    const amt = round2(Math.min(c.net, -d.net));
    if (amt > 0.009) {
      transfers.push({ from: d, to: c, amount: amt });
      c.net = round2(c.net - amt);
      d.net = round2(d.net + amt);
    }
    if (c.net <= 0.009) ci++;
    if (d.net >= -0.009) di++;
  }

  return { perMember: list, transfers, counted };
}

/* ==================== 日历导出（.ics） ==================== */

const icsEscape = (s = '') =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const icsFold = (line) => {
  let out = '';
  let rest = line;
  while (rest.length > 75) {
    out += rest.slice(0, 75) + '\r\n ';
    rest = rest.slice(75);
  }
  return out + rest;
};

const icsStamp = () =>
  new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** "2026-11-05T08:30" → "20261105T083000"（本地时间，不带 Z） */
function icsLocal(dt, fallbackDate) {
  const m = String(dt || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h = '09', mi = '00'] = m;
    return `${y}${mo}${d}T${h}${mi}00`;
  }
  const f = String(fallbackDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (f) return `${f[1]}${f[2]}${f[3]}T090000`;
  return null;
}

export function bookingsToICS(bookings = [], trip = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TrailNote//行程预定//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const start = icsLocal(b.startAt, b.date || trip.startDate);
    if (!start) continue;
    const end = b.endAt ? icsLocal(b.endAt) : start;

    const t = bookingTypeOf(b.type);
    const desc = [
      b.provider ? `服务方：${b.provider}` : '',
      b.confirmation ? `确认号：${b.confirmation}` : '',
      b.from || b.to ? `路线：${b.from || '—'} → ${b.to || '—'}` : '',
      b.address ? `地址：${b.address}` : '',
      b.price ? `费用：${b.price} ${b.currency || ''}` : '',
      b.notes || '',
      '—— 由 TrailNote 导出',
    ].filter(Boolean).join('\n');

    lines.push(
      'BEGIN:VEVENT',
      icsFold(`UID:${b.id}@trailnote.local`),
      `DTSTAMP:${icsStamp()}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      icsFold(`SUMMARY:${icsEscape(`[${t.name}] ${b.title || ''}`)}`),
      icsFold(`DESCRIPTION:${icsEscape(desc)}`),
      b.address || b.to
        ? icsFold(`LOCATION:${icsEscape(b.address || b.to)}`)
        : 'LOCATION:',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/* ==================== 确认邮件解析（启发式） ==================== */

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * 从确认邮件正文里抽出航班号、确认号、日期时间、金额等候选字段。
 * 只做"建议填充"，最终必须由用户确认后再保存 —— 不做静默写入。
 */
export function parseBookingText(text = '') {
  const raw = String(text);
  const out = { candidates: {}, matches: [] };
  const push = (field, value, label) => {
    if (!value) return;
    const key = field + '::' + value;
    if (out.matches.some((m) => m.key === key)) return;
    out.matches.push({ key, field, value, label });
  };

  // 航班号：CA1234 / MU 5678 / NH0123
  const flightNos = new Set();
  for (const m of raw.matchAll(/\b([A-Z]{2})\s?(\d{2,4})\b/g)) {
    const code = `${m[1]}${m[2]}`;
    flightNos.add(code);
    push('flightNo', code, '航班号');
  }
  // 形如 IATA 航班号的一律不当成确认号
  const looksLikeFlight = (v) => /^[A-Z]{2}\d{2,4}$/.test(v) || flightNos.has(v);

  // 确认号 / 订单号：关键词后跟 5–10 位大写字母数字
  for (const m of raw.matchAll(/(?:确认号|订单号|预订号|编号|Confirmation|Booking|Reference|PNR)[^A-Za-z0-9]{0,6}([A-Z0-9][A-Z0-9-]{3,13}[A-Z0-9])\b/gi)) {
    if (!looksLikeFlight(m[1])) push('confirmation', m[1], '确认号');
  }
  // 兜底：6 位混合字母数字，但至少 2 个字母 + 2 个数字
  for (const m of raw.matchAll(/\b([A-Z0-9]{6})\b/g)) {
    const v = m[1];
    if (looksLikeFlight(v)) continue;
    const letters = (v.match(/[A-Z]/g) || []).length;
    const digits = (v.match(/[0-9]/g) || []).length;
    if (letters >= 2 && digits >= 2) push('confirmation', v, '疑似确认号');
  }

  // 出发地 / 到达地：形如「上海虹桥 T2 - 成都天府 T2」「A → B」
  for (const line of raw.split(/\r?\n/)) {
    const m = line.trim().match(/^(.{2,24}?)\s*(?:→|->|—>|–>|=>|至|到|\s-\s|\s—\s)\s*(.{2,24})$/);
    if (m) {
      push('from', m[1].trim(), '出发地');
      push('to', m[2].trim(), '到达地');
      break;
    }
  }

  // 2026-11-05 / 2026/11/05 / 2026年11月5日 / 05 Nov 2026
  const dates = [];
  for (const m of raw.matchAll(/(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/g)) {
    dates.push(`${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`);
  }
  for (const m of raw.matchAll(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\b/gi)) {
    dates.push(`${m[3]}-${String(MONTHS[m[2].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`);
  }
  dates.forEach((d) => push('date', d, '日期'));

  // 时间 08:30 / 8:30
  for (const m of raw.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)) {
    push('time', `${m[1].padStart(2, '0')}:${m[2]}`, '时间');
  }

  // 金额
  for (const m of raw.matchAll(/(?:¥|￥|\bCNY|RMB)\s?([\d,]+(?:\.\d{1,2})?)/gi)) push('price', m[1].replace(/,/g, ''), 'CNY 金额');
  for (const m of raw.matchAll(/(?:\$|\bUSD)\s?([\d,]+(?:\.\d{1,2})?)/gi)) push('price', m[1].replace(/,/g, ''), 'USD 金额');
  for (const m of raw.matchAll(/(?:€|\bEUR)\s?([\d,]+(?:\.\d{1,2})?)/gi)) push('price', m[1].replace(/,/g, ''), 'EUR 金额');

  // 类型判断
  // 注意：中文没有 \b 词边界，这里不能用 \b 包裹 CJK 关键词
  const typeRules = [
    [/航班|机票|登机牌|boarding pass|\bflight\b/i, 'flight'],
    [/酒店|民宿|旅馆|客栈|入住|房型|check[- ]?in|\bhotel\b|guesthouse/i, 'hotel'],
    [/高铁|动车|火车|列车|座位|车厢|新干线|shinkansen|\btrain\b/i, 'train'],
    [/渡轮|船票|\bferry\b|\bboat\b/i, 'boat'],
    [/大巴|巴士|包车|\bbus\b|\bcoach\b/i, 'bus'],
    [/门票|许可|入园|\bpermit\b|\bticket\b|entrance/i, 'permit'],
    [/餐厅|订座|\brestaurant\b|reservation/i, 'restaurant'],
  ];
  for (const [re, type] of typeRules) {
    if (re.test(raw)) { out.candidates.type = type; break; }
  }

  if (dates.length) out.candidates.date = dates[0];
  const times = out.matches.filter((m) => m.field === 'time').map((m) => m.value);
  if (times.length) out.candidates.time = times[0];
  const price = out.matches.find((m) => m.field === 'price');
  if (price) {
    out.candidates.price = price.value;
    out.candidates.currency = price.label.slice(0, 3);
  }
  const conf = out.matches.find((m) => m.field === 'confirmation');
  if (conf) out.candidates.confirmation = conf.value;
  const fromM = out.matches.find((m) => m.field === 'from');
  if (fromM) out.candidates.from = fromM.value;
  const toM = out.matches.find((m) => m.field === 'to');
  if (toM) out.candidates.to = toM.value;
  const flight = out.matches.find((m) => m.field === 'flightNo');
  if (flight) out.candidates.flightNo = flight.value;

  return out;
}

export { esc };
