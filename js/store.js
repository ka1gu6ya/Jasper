/* ============================================================
   store.js — 数据层：本地优先持久化 + 同步适配器预留位
   ------------------------------------------------------------
   设计要点
   1. 所有写操作都走 commit()，这样将来接后端时只有一处需要改。
   2. 每次 commit 会递增 meta.rev、标记 dirty、并向 oplog 追加一条操作记录。
   3. syncAdapter 是可替换的接口：第一版是 LocalOnlyAdapter（空实现），
      以后接 Supabase / PocketBase / 自建服务时只需实现 push/pull，
      再把 activeAdapter 指过去，UI 不需要改。
   ============================================================ */

import { uid, eachDay, todayStr } from './util.js';
import { DEFAULT_RATES } from './calc.js';

export const STORAGE_KEY = 'trailnote.state.v1';
export const SCHEMA_VERSION = 1;

export const CURRENCIES = [
  { code: 'CNY', name: '人民币', symbol: '¥' },
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'EUR', name: '欧元', symbol: '€' },
  { code: 'JPY', name: '日元', symbol: '¥' },
  { code: 'HKD', name: '港币', symbol: 'HK$' },
  { code: 'GBP', name: '英镑', symbol: '£' },
  { code: 'TWD', name: '新台币', symbol: 'NT$' },
  { code: 'THB', name: '泰铢', symbol: '฿' },
  { code: 'KRW', name: '韩元', symbol: '₩' },
  { code: 'SGD', name: '新加坡元', symbol: 'S$' },
  { code: 'AUD', name: '澳元', symbol: 'A$' },
  { code: 'NZD', name: '新西兰元', symbol: 'NZ$' },
  { code: 'CHF', name: '瑞士法郎', symbol: 'CHF' },
  { code: 'NOK', name: '挪威克朗', symbol: 'kr' },
  { code: 'SEK', name: '瑞典克朗', symbol: 'kr' },
  { code: 'ISK', name: '冰岛克朗', symbol: 'kr' },
  { code: 'INR', name: '印度卢比', symbol: '₹' },
  { code: 'MYR', name: '马来西亚林吉特', symbol: 'RM' },
  { code: 'VND', name: '越南盾', symbol: '₫' },
];

/* ==================== 同步适配器接口 ==================== */

/**
 * 任何适配器都要实现这两个方法：
 *   push(ops)  → 把本地未同步的操作推上去
 *   pull(since) → 拉取远端变更（lastSyncedAt 之后）
 * 返回结构约定：{ ops: [...], serverTime: ISOString }
 */
export const LocalOnlyAdapter = {
  id: 'local-only',
  label: '仅本机',
  supportsSync: false,
  async push() { return { ok: true }; },
  async pull() { return { ops: [], serverTime: new Date().toISOString() }; },
};

/** 将来的远端适配器照这个形状写即可，commit 逻辑无需改动 */
export const sync = {
  active: LocalOnlyAdapter,
  use(adapter) { this.active = adapter; },
};

/* ==================== 初始状态 ==================== */

function emptyState() {
  return {
    meta: {
      schema: SCHEMA_VERSION,
      rev: 0,
      dirty: false,
      updatedAt: new Date().toISOString(),
      lastSyncedAt: null,
    },
    settings: {
      baseCurrency: 'CNY',
      rates: { ...DEFAULT_RATES },
      distanceUnit: 'km',
    },
    trips: [],
    days: [],
    bookings: [],
    gear: [],
    expenses: [],
    library: [],
    oplog: [],
  };
}

/* ==================== 演示数据 ==================== */
/* 首次打开时给两个例子：一个即将出发的徒步行程、一个已完成的混合行程。
   用户可以随时删除，或「清空全部数据」从零开始。 */

function seedState() {
  const s = emptyState();
  const t1 = 'trip_gongga';
  const t2 = 'trip_kumano';

  s.trips = [
    {
      id: t1,
      name: '贡嘎西南坡穿越',
      destination: '四川 · 康定',
      startDate: '2026-11-06',
      endDate: '2026-11-10',
      type: 'hiking',
      budget: 6000,
      notes: '经典西南坡路线，日乌且垭口 4920m 是全程难点。预留一天机动。',
      members: [
        { id: 'mb_me', name: '我', role: '领队', color: '#2f6b52' },
        { id: 'mb_zhe', name: '阿哲', role: '协作', color: '#4a6f8a' },
        { id: 'mb_lin', name: '小林', role: '财务', color: '#8a6f4e' },
      ],
      createdAt: '2026-10-10T09:00:00.000Z',
      updatedAt: '2026-10-10T09:00:00.000Z',
    },
    {
      id: t2,
      name: '熊野古道 + 京都',
      destination: '日本 · 和歌山 / 京都',
      startDate: '2026-04-02',
      endDate: '2026-04-07',
      type: 'mixed',
      budget: 12000,
      notes: '中边路走三天，其余时间在城市。已完成，账目基本对得上。',
      members: [
        { id: 'mb_me', name: '我', role: '领队', color: '#2f6b52' },
        { id: 'mb_lin', name: '小林', role: '同伴', color: '#8a6f4e' },
      ],
      createdAt: '2026-03-01T09:00:00.000Z',
      updatedAt: '2026-04-08T09:00:00.000Z',
    },
  ];

  /* ---------- 行程 A：贡嘎 ---------- */
  const gonggaDays = [
    ['2026-11-06', '老榆林村 → 下日乌且', 12, 700, 3800, 'gravel', '上午进山，下午沿河谷缓上。'],
    ['2026-11-07', '下日乌且 → 上日乌且', 10, 850, 4300, 'gravel', '碎石坡为主，注意碎石滚落。'],
    ['2026-11-08', '翻越日乌且垭口 → 莫溪沟尾', 16, 900, 4920, 'snow', '全程最难一天，垭口可能有积雪，早点出发。'],
    ['2026-11-09', '莫溪沟尾 → 贡嘎寺', 14, 400, 3700, 'trail', '下坡为主，膝盖压力大，用杖。'],
    ['2026-11-10', '贡嘎寺 → 子梅村 → 康定', 9, 200, 3400, 'trail', '出山，下午回康定住一晚。'],
  ];

  gonggaDays.forEach(([date, title, distanceKm, gainM, maxAlt, terrain, notes], i) => {
    s.days.push({
      id: `day_g${i + 1}`,
      tripId: t1,
      date,
      title,
      notes,
      hike: { distanceKm, gainM, maxAlt, terrain },
    });
  });

  const gonggaItems = [
    ['day_g1', '07:30', 'transport', '康定 → 老榆林村包车', '约 1.5 小时，走榆磨路', ''],
    ['day_g1', '10:00', 'hike', '进山 · 格西草原', '从水电站开始徒步', ''],
    ['day_g1', '17:00', 'stay', '下日乌且营地扎营', '海拔 3800m，水源在营地东侧', ''],
    ['day_g2', '08:00', 'hike', '出发 · 碎石坡', '今天爬升 850m，节奏放慢', ''],
    ['day_g2', '15:30', 'stay', '上日乌且营地', '海拔 4300m，夜里会到 -8℃', ''],
    ['day_g3', '05:30', 'hike', '摸黑出发翻垭口', '最晚 6 点出发，避开午后天气', ''],
    ['day_g3', '11:00', 'activity', '日乌且垭口 4920m', '停留不超过 20 分钟，风大', ''],
    ['day_g4', '09:00', 'hike', '下到贡嘎寺', '长下坡，护膝戴好', ''],
    ['day_g5', '08:00', 'hike', '出山到子梅村', '子梅村可补热水', ''],
    ['day_g5', '18:20', 'transport', '成都天府 → 上海虹桥 MU5412', '留足 3 小时从康定到机场', ''],
  ];
  gonggaItems.forEach(([dayId, time, type, title, note], i) => {
    s.days.find((d) => d.id === dayId).items = s.days.find((d) => d.id === dayId).items || [];
    s.days.find((d) => d.id === dayId).items.push({
      id: `it_g${i + 1}`, time, type, title, note, done: false,
    });
  });

  const gearA = [
    ['Osprey Exos 48', 'pack', 1100, 1, false, false],
    ['三峰 蓝山 1 帐篷', 'shelter', 780, 1, false, false],
    ['帐篷地布', 'shelter', 120, 1, false, false],
    ['黑冰 B700 睡袋', 'sleep', 1000, 1, false, false],
    ['蛋槽防潮垫', 'sleep', 380, 1, false, false],
    ['充气枕', 'sleep', 80, 1, false, false],
    ['冲锋衣', 'clothing', 420, 1, false, false],
    ['羽绒服', 'clothing', 380, 1, false, false],
    ['抓绒中层', 'clothing', 300, 1, false, false],
    ['速干衣裤', 'clothing', 350, 1, false, false],
    ['备用徒步袜', 'clothing', 80, 2, false, false],
    ['轻量雨衣', 'clothing', 190, 1, false, false],
    ['火枫炉头', 'cook', 90, 1, false, false],
    ['铝制套锅', 'cook', 180, 1, false, false],
    ['气罐 230g', 'cook', 230, 1, false, true],
    ['脱水米饭', 'food', 120, 4, false, true],
    ['能量胶', 'food', 40, 6, false, true],
    ['混合坚果', 'food', 250, 1, false, true],
    ['净水器', 'water', 60, 1, false, false],
    ['水袋 2L（空）', 'water', 60, 1, false, false],
    ['饮用水', 'water', 2000, 1, false, true],
    ['头灯', 'electronics', 80, 1, false, false],
    ['充电宝 10000mAh', 'electronics', 200, 1, false, false],
    ['手机', 'electronics', 200, 1, false, false],
    ['微单相机', 'electronics', 500, 1, false, false],
    ['急救包', 'safety', 150, 1, false, false],
    ['应急保温毯', 'safety', 60, 1, false, false],
    ['求生哨', 'safety', 20, 1, false, false],
    ['牙刷 / 牙膏', 'hygiene', 60, 1, false, false],
    ['防晒霜', 'hygiene', 50, 1, false, false],
    ['湿巾', 'hygiene', 40, 1, false, false],
    ['防水袋', 'misc', 100, 1, false, false],
    ['垃圾袋', 'misc', 10, 1, false, false],
  ];
  gearA.forEach(([name, category, weightG, qty, worn, consumable], i) => {
    s.gear.push({
      id: `gear_a${i + 1}`, tripId: t1, name, category, weightG, qty, worn, consumable,
      packed: false, note: '',
    });
  });
  const wornA = [
    ['中帮徒步鞋', 'clothing', 1100],
    ['登山杖（一对）', 'misc', 480],
    ['徒步裤', 'clothing', 300],
    ['速干 T 恤', 'clothing', 150],
    ['遮阳帽', 'clothing', 60],
    ['薄手套', 'clothing', 50],
  ];
  wornA.forEach(([name, category, weightG], i) => {
    s.gear.push({
      id: `gear_aw${i + 1}`, tripId: t1, name, category, weightG, qty: 1,
      worn: true, consumable: false, packed: false, note: '',
    });
  });

  s.bookings = [
    {
      id: 'bk_1', tripId: t1, type: 'flight', title: '上海虹桥 → 成都天府',
      provider: '东方航空 MU5401', confirmation: '7XK2P9',
      startAt: '2026-11-05T08:30', endAt: '2026-11-05T11:45',
      from: '上海虹桥 T2', to: '成都天府 T2',
      price: 1080, currency: 'CNY', status: 'confirmed',
      notes: '含 20kg 托运，登山杖需托运不能随身。', date: '2026-11-05',
    },
    {
      id: 'bk_2', tripId: t1, type: 'bus', title: '康定 → 老榆林村 包车',
      provider: '扎西师傅', confirmation: '138-xxxx-8842',
      startAt: '2026-11-05T13:00', endAt: '2026-11-05T14:30',
      from: '康定汽车站', to: '老榆林村',
      price: 260, currency: 'CNY', status: 'confirmed', notes: '', date: '2026-11-05',
    },
    {
      id: 'bk_3', tripId: t1, type: 'hotel', title: '扎西民宿 · 标间',
      provider: '老榆林村', confirmation: 'HTL88213',
      startAt: '2026-11-05T15:00', endAt: '2026-11-06T08:00',
      from: '', to: '', address: '康定市老榆林村',
      price: 280, currency: 'CNY', status: 'confirmed',
      notes: '可寄存行李，老板娘帮忙叫车。', date: '2026-11-05',
    },
    {
      id: 'bk_4', tripId: t1, type: 'permit', title: '贡嘎山保护区 徒步许可',
      provider: '贡嘎山国家级自然保护区', confirmation: 'GK-2026-1106',
      startAt: '2026-11-06T07:00', endAt: '',
      from: '', to: '', address: '',
      price: 150, currency: 'CNY', status: 'confirmed',
      notes: '需带身份证原件，进山登记。', date: '2026-11-06',
    },
    {
      id: 'bk_5', tripId: t1, type: 'flight', title: '成都天府 → 上海虹桥',
      provider: '东方航空 MU5412', confirmation: '待出票',
      startAt: '2026-11-10T18:20', endAt: '2026-11-10T21:30',
      from: '成都天府 T2', to: '上海虹桥 T2',
      price: 1120, currency: 'CNY', status: 'pending',
      notes: '还在等降价，最晚 11/1 出票。', date: '2026-11-10',
    },
  ];

  const expenseA = [
    ['2026-10-18', 'gear', '中帮徒步鞋', 1299, 'CNY', '迪卡侬 · 提前备货'],
    ['2026-11-05', 'transport', '机票 上海→成都', 1080, 'CNY', ''],
    ['2026-11-05', 'transport', '包车到老榆林', 260, 'CNY', ''],
    ['2026-11-05', 'lodging', '扎西民宿一晚', 280, 'CNY', ''],
    ['2026-11-05', 'food', '路上吃饭', 68, 'CNY', ''],
    ['2026-11-06', 'tickets', '徒步许可', 150, 'CNY', ''],
    ['2026-11-07', 'food', '路上补给', 85, 'CNY', ''],
  ];
  expenseA.forEach(([date, category, note, amount, currency, memo], i) => {
    s.expenses.push({ id: `ex_a${i + 1}`, tripId: t1, date, category, note, amount, currency, memo, createdAt: '2026-10-20T09:00:00.000Z' });
  });

  /* ---------- 行程 B：熊野古道（已完成，含日元账目） ---------- */
  const kumanoDays = [
    ['2026-04-02', '抵达京都', 0, 0, 60, 'trail', '下午到，晚上逛祇园。'],
    ['2026-04-03', '京都 → 田边', 0, 0, 0, 'trail', '坐 JR 到田边，取熊野古道地图。'],
    ['2026-04-04', '滝尻王子 → 近露王子', 13, 600, 500, 'trail', '中边路第一天，杉树林里走。'],
    ['2026-04-05', '近露王子 → 熊野本宫大社', 24, 900, 700, 'trail', '最长一天，24km，务必早起。'],
    ['2026-04-06', '本宫 → 新宫（熊野川渡船）', 6, 150, 200, 'trail', '坐传统木船下新宫。'],
    ['2026-04-07', '新宫 → 大阪 → 上海', 0, 0, 0, 'trail', ''],
  ];
  kumanoDays.forEach(([date, title, distanceKm, gainM, maxAlt, terrain, notes], i) => {
    s.days.push({
      id: `day_k${i + 1}`, tripId: t2, date, title, notes,
      hike: { distanceKm, gainM, maxAlt, terrain },
    });
  });

  const gearB = [
    ['Daypack 22L', 'pack', 620, 1, false, false],
    ['快干长裤', 'clothing', 280, 1, false, false],
    ['雨衣', 'clothing', 190, 1, false, false],
    ['备用袜', 'clothing', 80, 2, false, false],
    ['轻便徒步鞋', 'clothing', 780, 1, true, false],
    ['水瓶 750ml', 'water', 750, 1, false, true],
    ['充电宝', 'electronics', 200, 1, false, false],
    ['相机', 'electronics', 590, 1, false, false],
    ['急救包', 'safety', 120, 1, false, false],
    ['洗漱包', 'hygiene', 180, 1, false, false],
  ];
  gearB.forEach(([name, category, weightG, qty, worn, consumable], i) => {
    s.gear.push({
      id: `gear_b${i + 1}`, tripId: t2, name, category, weightG, qty, worn, consumable,
      packed: true, note: '',
    });
  });

  s.bookings = s.bookings.concat([
    {
      id: 'bk_k1', tripId: t2, type: 'flight', title: '上海浦东 → 大阪关西',
      provider: '吉祥航空 HO1333', confirmation: 'QK4M7T',
      startAt: '2026-04-02T08:55', endAt: '2026-04-02T12:20',
      from: '上海浦东 T2', to: '大阪关西 T1',
      price: 1680, currency: 'CNY', status: 'confirmed', notes: '', date: '2026-04-02',
    },
    {
      id: 'bk_k2', tripId: t2, type: 'hotel', title: '京都 · 四条民宿',
      provider: 'Booking.com', confirmation: 'BK-4471902',
      startAt: '2026-04-02T15:00', endAt: '2026-04-03T10:00',
      from: '', to: '', address: '京都市下京区四条通',
      price: 42000, currency: 'JPY', status: 'confirmed', notes: '', date: '2026-04-02',
    },
    {
      id: 'bk_k3', tripId: t2, type: 'hotel', title: '汤之峰温泉 · 民宿',
      provider: '汤之峰庄', confirmation: 'YT-7712',
      startAt: '2026-04-04T16:00', endAt: '2026-04-05T08:00',
      from: '', to: '', address: '和歌山县本宫町汤之峰',
      price: 16500, currency: 'JPY', status: 'confirmed', notes: '含早晚餐，泡汤免费。', date: '2026-04-04',
    },
    {
      id: 'bk_k4', tripId: t2, type: 'train', title: '新宫 → 大阪（特急）',
      provider: 'JR 西日本', confirmation: '',
      startAt: '2026-04-07T13:10', endAt: '2026-04-07T17:00',
      from: '新宫站', to: '大阪天王寺',
      price: 6800, currency: 'JPY', status: 'confirmed', notes: '', date: '2026-04-07',
    },
  ]);

  const expenseB = [
    ['2026-04-02', 'transport', '机票 上海→大阪', 1680, 'CNY', ''],
    ['2026-04-02', 'transport', '关西机场 → 京都 HARUKA', 3600, 'JPY', ''],
    ['2026-04-02', 'lodging', '京都民宿两晚', 42000, 'JPY', ''],
    ['2026-04-03', 'transport', '京都 → 田边 JR', 5200, 'JPY', ''],
    ['2026-04-03', 'food', '田边晚餐', 2800, 'JPY', ''],
    ['2026-04-04', 'lodging', '汤之峰温泉一晚', 16500, 'JPY', '含两餐'],
    ['2026-04-04', 'food', '路上饭团补给', 900, 'JPY', ''],
    ['2026-04-05', 'food', '本宫大社前午餐', 1600, 'JPY', ''],
    ['2026-04-05', 'tickets', '熊野本宫大社 参拜', 500, 'JPY', ''],
    ['2026-04-06', 'tickets', '熊野川渡船', 3900, 'JPY', ''],
    ['2026-04-07', 'transport', '新宫 → 大阪特急', 6800, 'JPY', ''],
    ['2026-04-07', 'shopping', '伴手礼', 4800, 'JPY', ''],
    ['2026-04-07', 'gear', '熊野古道登山杖', 3200, 'JPY', ''],
  ];
  expenseB.forEach(([date, category, note, amount, currency, memo], i) => {
    s.expenses.push({ id: `ex_b${i + 1}`, tripId: t2, date, category, note, amount, currency, memo, createdAt: '2026-04-08T09:00:00.000Z' });
  });

  /* ---------- 常用装备库 ---------- */
  s.library = [
    ['Osprey Exos 48', 'pack', 1100],
    ['黑冰 B700 睡袋', 'sleep', 1000],
    ['蛋槽防潮垫', 'sleep', 380],
    ['三峰 蓝山 1 帐篷', 'shelter', 780],
    ['冲锋衣', 'clothing', 420],
    ['头灯', 'electronics', 80],
    ['充电宝 10000mAh', 'electronics', 200],
    ['急救包', 'safety', 150],
  ].map(([name, category, weightG], i) => ({ id: `lib_${i + 1}`, name, category, weightG }));

  /* ---------- 给演示装备分配「谁背」 ---------- */
  const A = t1, B = t2;
  const ownerByName = {
    '三峰 蓝山 1 帐篷': 'mb_zhe',
    '帐篷地布': 'mb_zhe',
    '急救包': 'mb_zhe',
    '应急保温毯': 'mb_zhe',
    '火枫炉头': 'mb_lin',
    '铝制套锅': 'mb_lin',
    '气罐 230g': 'mb_lin',
  };
  for (const g of s.gear) {
    if (g.tripId === A) g.ownerId = ownerByName[g.name] || 'mb_me';
    else if (g.tripId === B) g.ownerId = g.name === '急救包' ? 'mb_lin' : 'mb_me';
  }

  /* ---------- 给演示账目分配付款人与分摊 ---------- */
  const allA = ['mb_me', 'mb_zhe', 'mb_lin'];
  const allB = ['mb_me', 'mb_lin'];
  for (const e of s.expenses) {
    if (e.tripId === A) {
      e.paidBy = e.note.includes('包车') ? 'mb_zhe' : 'mb_me';
      // 登山鞋是个人开销，不参与分摊
      e.splitWith = e.note.includes('徒步鞋') ? [] : allA.slice();
    } else if (e.tripId === B) {
      e.paidBy = e.note.includes('伴手礼') ? 'mb_lin' : 'mb_me';
      e.splitWith = e.note.includes('伴手礼') ? [] : allB.slice();
    }
  }

  s.meta.updatedAt = new Date().toISOString();
  return s;
}

/* ==================== Store ==================== */

class Store {
  constructor() {
    this.data = this.load();
    this.listeners = new Set();
    this.syncListeners = new Set();
    this.syncState = { status: 'idle', lastSyncedAt: this.data.meta.lastSyncedAt, message: '' };
  }

  /* ---------- 持久化 ---------- */

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seeded = seedState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        return seeded;
      }
      const parsed = JSON.parse(raw);
      return this.migrate(parsed);
    } catch (e) {
      console.error('读取本地数据失败，已回退到演示数据', e);
      return seedState();
    }
  }

  migrate(data) {
    const base = emptyState();
    const merged = {
      ...base,
      ...data,
      meta: { ...base.meta, ...(data.meta || {}) },
      settings: {
        ...base.settings,
        ...(data.settings || {}),
        rates: { ...base.settings.rates, ...((data.settings || {}).rates || {}) },
      },
      trips: data.trips || [], days: data.days || [], bookings: data.bookings || [],
      gear: data.gear || [], expenses: data.expenses || [], library: data.library || [],
      oplog: data.oplog || [],
    };
    // 兼容：老数据的 days 可能没有 hike 字段
    merged.days = merged.days.map((d) => ({ ...d, hike: d.hike || { distanceKm: 0, gainM: 0, maxAlt: 0, terrain: 'trail' }, items: d.items || [] }));
    merged.bookings = merged.bookings.map((b) => ({ ...b, status: b.status || 'confirmed' }));
    merged.gear = merged.gear.map((g) => ({ ...g, qty: g.qty || 1, packed: !!g.packed, ownerId: g.ownerId ?? null }));
    merged.expenses = merged.expenses.map((e) => ({
      ...e,
      paidBy: e.paidBy ?? null,
      splitWith: Array.isArray(e.splitWith) ? e.splitWith : [],
    }));
    // 兼容：老数据没有同行成员
    merged.trips = merged.trips.map((t) => ({ ...t, members: Array.isArray(t.members) ? t.members : [] }));
    return merged;
  }

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      console.error('保存失败（可能存储空间已满）', e);
      window.dispatchEvent(new CustomEvent('trailnote:storage-error', { detail: e }));
      return false;
    }
  }

  /* ---------- 订阅 ---------- */

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try { fn(this.data); } catch (e) { console.error(e); }
    }
  }

  onSyncChange(fn) {
    this.syncListeners.add(fn);
    return () => this.syncListeners.delete(fn);
  }

  setSyncState(patch) {
    this.syncState = { ...this.syncState, ...patch };
    for (const fn of this.syncListeners) {
      try { fn(this.syncState); } catch (e) { console.error(e); }
    }
  }

  /* ---------- 写入 ---------- */

  /**
   * 唯一的写入口。mutator 直接改 this.data。
   * meta.action 会进 oplog，将来同步时按顺序推送。
   */
  commit(mutator, meta = {}) {
    try {
      mutator(this.data);
    } catch (e) {
      console.error('commit 失败', e);
      return false;
    }

    this.data.meta.rev += 1;
    this.data.meta.dirty = true;
    this.data.meta.updatedAt = new Date().toISOString();

    if (meta.action) {
      this.data.oplog.push({
        rev: this.data.meta.rev,
        at: this.data.meta.updatedAt,
        action: meta.action,
        entity: meta.entity || null,
        id: meta.id || null,
      });
      if (this.data.oplog.length > 300) this.data.oplog = this.data.oplog.slice(-300);
    }

    const ok = this.persist();
    this.emit();
    if (ok && meta.action) this.afterCommit();
    return ok;
  }

  /** 同步钩子：现在什么都不做，接后端后在这里把 oplog 推上去 */
  async afterCommit() {
    const adapter = sync.active;
    if (!adapter.supportsSync) return;
    try {
      this.setSyncState({ status: 'syncing', message: '同步中…' });
      await adapter.push(this.data.oplog.slice(-50));
      this.setSyncState({ status: 'idle', message: '已同步', lastSyncedAt: new Date().toISOString() });
    } catch (e) {
      this.setSyncState({ status: 'error', message: '同步失败，稍后重试' });
    }
  }

  /* ---------- 查询辅助 ---------- */

  get trips() {
    return this.data.trips.slice().sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }

  trip(id) {
    return this.data.trips.find((t) => t.id === id) || null;
  }

  daysOf(tripId) {
    return this.data.days
      .filter((d) => d.tripId === tripId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  bookingsOf(tripId) {
    return this.data.bookings
      .filter((b) => b.tripId === tripId)
      .sort((a, b) => (a.startAt || a.date || '').localeCompare(b.startAt || b.date || ''));
  }

  gearOf(tripId) {
    return this.data.gear.filter((g) => g.tripId === tripId);
  }

  expensesOf(tripId) {
    return this.data.expenses
      .filter((e) => e.tripId === tripId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  /** 保证行程日期范围内每天都有 day 记录；删除多余的空白天 */
  ensureDays(tripId) {
    const trip = this.trip(tripId);
    if (!trip) return;
    const wanted = eachDay(trip.startDate, trip.endDate);
    if (!wanted.length) return;

    const existing = this.daysOf(tripId);
    const existingDates = new Set(existing.map((d) => d.date));
    const missing = wanted.filter((d) => !existingDates.has(d));

    if (!missing.length) return;

    this.commit((s) => {
      for (const date of missing) {
        s.days.push({
          id: uid('day_'),
          tripId,
          date,
          title: '',
          notes: '',
          hike: { distanceKm: 0, gainM: 0, maxAlt: 0, terrain: 'trail' },
          items: [],
        });
      }
    }, { action: 'days.ensure', entity: 'day', id: tripId });
  }

  /* ---------- 导入 / 导出 ---------- */

  exportJSON() {
    return JSON.stringify(
      { app: 'trailnote', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: this.data },
      null,
      2
    );
  }

  importJSON(text) {
    const parsed = JSON.parse(text);
    const payload = parsed.data || parsed;
    if (!payload || !Array.isArray(payload.trips)) throw new Error('文件格式不对：缺少 trips 列表');
    this.data = this.migrate(payload);
    this.data.meta.rev += 1;
    this.data.meta.dirty = true;
    this.persist();
    this.emit();
  }

  /** 恢复演示数据 */
  resetToSeed() {
    this.data = seedState();
    this.persist();
    this.emit();
  }

  /** 完全清空，从零开始 */
  clearAll() {
    this.data = emptyState();
    this.persist();
    this.emit();
  }

  /** 删掉某行程及其所有关联数据 */
  deleteTrip(tripId) {
    this.commit((s) => {
      s.trips = s.trips.filter((t) => t.id !== tripId);
      s.days = s.days.filter((d) => d.tripId !== tripId);
      s.bookings = s.bookings.filter((b) => b.tripId !== tripId);
      s.gear = s.gear.filter((g) => g.tripId !== tripId);
      s.expenses = s.expenses.filter((e) => e.tripId !== tripId);
    }, { action: 'trip.delete', entity: 'trip', id: tripId });
  }
}

export const store = new Store();
export { emptyState, seedState, todayStr };
