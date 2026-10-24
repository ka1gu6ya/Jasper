/* ============================================================
   views/shared.js — 只读分享页
   别人打开链接看到的就是这里：不连本地数据，只读远端快照。
   ============================================================ */

import {
  esc, fmtDate, fmtDateRange, fmtWeight, fmtKg, fmtMoney, fmtNum,
  nightsBetween, eachDay, daysUntil, relTime,
} from '../util.js';
import {
  computeWeights, baseWeightGrade, computeDifficulty, expenseStats,
  TRIP_TYPES, GEAR_CATEGORIES, catOf, bookingTypeOf, expenseCatOf,
  itemTypeOf, TERRAINS, memberInitial, weightsByOwner,
  toBase, memberName,
} from '../calc.js';
import { icon, badge } from '../ui.js';
import { fetchShared, readCache, importShared } from '../sync.js';
import { store } from '../store.js';

/* ---------------- 入口 ---------------- */

let pollTimer = null;

export async function renderShared(app, token) {
  clearInterval(pollTimer);
  app.className = 'shared-shell';
  app.innerHTML = shell(loadingHTML());

  let data = null;
  let failMessage = '';

  try {
    data = await fetchShared(token);
  } catch (err) {
    failMessage = err.message;
  }

  if (!data) {
    const cached = readCache(token);
    if (cached && cached.payload) {
      paint(app, token, cached, { stale: true, reason: failMessage });
      return;
    }
    app.innerHTML = shell(notFoundHTML(failMessage));
    return;
  }

  paint(app, token, data, {});
}

function paint(app, token, data, opts) {
  const payload = data.payload;
  app.innerHTML = shell(bodyHTML(payload, data, opts), true);
  bind(app, token, payload);
  watchForUpdates(app, token, data.version);
}

/** 页面开着的时候每 90 秒看一眼有没有新版（切到后台就暂停） */
function watchForUpdates(app, token, version) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    if (!document.getElementById('app').className.includes('shared-shell')) {
      clearInterval(pollTimer);
      return;
    }
    try {
      const next = await fetchShared(token);
      if (next && next.version !== version) {
        clearInterval(pollTimer);
        paint(app, token, next, {});
      }
    } catch {
      // 网络抖动就跳过这一轮
    }
  }, 90000);
}

function shell(inner, withActions = false) {
  return `
    <header class="sharehead">
      <a class="brand" href="./">
        <span class="brand__mark">${icon('mountain', 17)}</span>
        <span class="brand__text">TrailNote</span>
      </a>
      ${withActions ? `<span class="sharehead__badge">${icon('lock', 11)}只读分享</span>` : ''}
      <div class="sharehead__actions">
        ${withActions ? `<button class="btn btn--ghost btn--sm" data-shared-action="import">${icon('copy', 13)}存到我的行程</button>` : ''}
      </div>
    </header>
    <main class="view view--shared">${inner}</main>`;
}

const loadingHTML = () => `
  <div class="shared-state">
    <div class="shared-state__spinner"></div>
    <p>正在加载行程…</p>
  </div>`;

function notFoundHTML(reason) {
  return `
    <div class="shared-state">
      <div class="shared-state__icon">${icon('alert', 26)}</div>
      <h1>打不开这个分享</h1>
      <p>${reason ? esc(reason) : '链接可能已经失效，或者分享被停止了。'}</p>
      <p class="muted small">可以问问发链接的人要一个新的。</p>
    </div>`;
}

/* ---------------- 主体 ---------------- */

function bodyHTML(payload, data, { stale }) {
  const trip = payload.trip || {};
  const days = payload.days || [];
  const gear = payload.gear || [];
  const bookings = payload.bookings || [];
  const expenses = payload.expenses || [];
  const settings = payload.settings || { baseCurrency: 'CNY', rates: {} };

  const w = computeWeights(gear);
  const grade = baseWeightGrade(w.base);
  const diff = computeDifficulty(days, w.pack / 1000);
  const money = expenseStats(expenses, settings);
  const type = TRIP_TYPES.find((t) => t.id === trip.type) || TRIP_TYPES[0];
  const members = trip.members || [];
  const totalDays = Math.max(days.length, eachDay(trip.startDate, trip.endDate).length);
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const until = daysUntil(trip.startDate);

  const countdown = (() => {
    if (until === null) return { num: '—', label: '未定日期' };
    if (until > 0) return { num: String(until), label: '天后出发' };
    const end = daysUntil(trip.endDate);
    if (end !== null && end >= 0) return { num: String(Math.abs(until) + 1), label: '进行中' };
    return { num: '—', label: '已结束' };
  })();

  return `
    ${stale ? `<div class="stalebar">${icon('alert', 13)}连不上服务器，显示的是上次缓存的版本${data.updated_at ? `（${esc(String(data.updated_at).slice(0, 10))}）` : ''}</div>` : ''}

    <section class="hero">
      <div class="hero__main">
        <div class="hero__eyebrow">
          ${badge(type.name, 'var(--accent)')}
          ${trip.destination ? `<span class="hero__dest">${icon('pin', 13)}${esc(trip.destination)}</span>` : ''}
        </div>
        <h1 class="hero__title">${esc(trip.name || '未命名行程')}</h1>
        <div class="hero__meta">
          <span>${icon('calendar', 14)}${fmtDateRange(trip.startDate, trip.endDate)}</span>
          <span>${icon('clock', 14)}共 ${totalDays} 天 · ${nights} 晚</span>
          <span>${icon('backpack', 14)}${gear.length} 件装备</span>
        </div>
      </div>
      <div class="hero__count">
        <div class="hero__count-num">${esc(countdown.num)}</div>
        <div class="hero__count-label">${esc(countdown.label)}</div>
      </div>
    </section>

    ${members.length ? `
      <div class="memberstrip">
        ${members.map((m) => `
          <span class="mpill">
            <i style="background:${esc(m.color || '#9b9a97')}">${esc(memberInitial(m.name))}</i>
            ${esc(m.name)}${m.role ? `<em>${esc(m.role)}</em>` : ''}
          </span>`).join('')}
      </div>` : ''}

    <section class="stat-grid">
      ${statCard('背负重量', fmtKg(w.pack, 2), `基础 ${fmtKg(w.base, 2)} · 消耗品 ${fmtKg(w.consumable, 2)}`, grade.color, 'backpack')}
      ${statCard('基础重量', fmtKg(w.base, 2), `${grade.label} · ${grade.en}`, grade.color, 'scale')}
      ${statCard('难度指数', diff.total > 0 ? fmtNum(diff.total) : '—', `${diff.grade.label}${diff.hikingDays ? ` · 徒步 ${diff.hikingDays} 天` : ''}`, diff.grade.color, 'trending')}
      ${statCard('花销', fmtMoney(money.total, money.baseCurrency), trip.budget > 0 ? `预算 ${fmtMoney(trip.budget, money.baseCurrency)}` : `${money.count} 笔`, 'var(--accent)', 'wallet')}
    </section>

    ${trip.notes ? `<section class="card"><p class="shared-note">${esc(trip.notes)}</p></section>` : ''}

    ${days.length ? itineraryCard(days) : ''}
    ${bookings.length ? bookingsCard(bookings) : ''}
    ${gear.length ? gearCard(w, gear, members) : ''}
    ${money.byCategory.length ? moneyCard(money, settings, expenses, trip) : ''}

    <p class="shared-foot">
      ${icon('lock', 12)}
      只读页面，无法修改。最后更新：${esc(relTime(data.updated_at || payload.exportedAt))}
      · 保持打开会自动刷新
    </p>`;
}

function statCard(label, value, hint, color, iconName) {
  return `
    <div class="stat" style="--stat-color:${color}">
      <div class="stat__label">${icon(iconName, 13)}<span>${esc(label)}</span></div>
      <div class="stat__value">${value}</div>
      ${hint ? `<div class="stat__hint">${esc(hint)}</div>` : ''}
    </div>`;
}

function itineraryCard(days) {
  return `
    <section class="card">
      <header class="card__head">
        <h2 class="card__title">${icon('calendar', 15)}行程安排</h2>
        <span class="card__note">${days.length} 天</span>
      </header>
      <div class="days">
        ${days.map((day, i) => {
          const hike = day.hike || {};
          const items = (day.items || []).slice().sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
          const chips = [];
          if (hike.distanceKm) chips.push(`<span class="chip">${fmtNum(hike.distanceKm, 1)} km</span>`);
          if (hike.gainM) chips.push(`<span class="chip">↑ ${fmtNum(hike.gainM)} m</span>`);
          if (hike.maxAlt) chips.push(`<span class="chip">${fmtNum(hike.maxAlt)} m</span>`);
          const terrain = TERRAINS.find((t) => t.id === hike.terrain);
          if (terrain && terrain.id !== 'trail') chips.push(`<span class="chip">${esc(terrain.name)}</span>`);

          return `
            <div class="day">
              <header class="day__head">
                <div class="day__date">
                  <b>${esc(fmtDate(day.date, { short: true, weekday: false }))}</b>
                  <span>${esc(fmtDate(day.date, { weekday: true }).split(' ').pop())}</span>
                </div>
                <div class="day__mid">
                  <h3 class="day__title">${esc(day.title || `第 ${i + 1} 天`)}</h3>
                  ${chips.length ? `<div class="day__chips">${chips.join('')}</div>` : ''}
                  ${day.notes ? `<p class="day__notes">${esc(day.notes)}</p>` : ''}
                </div>
              </header>
              ${items.length ? `<ul class="items">${items.map((it) => {
                const t = itemTypeOf(it.type);
                return `
                  <li class="item">
                    <span class="item__time">${esc(it.time || '——')}</span>
                    <span class="item__icon">${icon(t.icon, 14)}</span>
                    <span class="item__body">
                      <span class="item__title">${esc(it.title || t.name)}</span>
                      ${it.note ? `<span class="item__note">${esc(it.note)}</span>` : ''}
                    </span>
                  </li>`;
              }).join('')}</ul>` : ''}
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

function bookingsCard(bookings) {
  return `
    <section class="card">
      <header class="card__head">
        <h2 class="card__title">${icon('ticket', 15)}预定信息</h2>
        <span class="card__note">${bookings.length} 条</span>
      </header>
      <ul class="sharedlist">
        ${bookings.map((b) => {
          const t = bookingTypeOf(b.type);
          const [date, time] = String(b.startAt || b.date || '').split('T');
          return `
            <li class="sharedlist__item">
              <span class="sharedlist__icon" style="color:${t.color}">${icon(t.icon, 14)}</span>
              <span class="sharedlist__body">
                <span class="sharedlist__title">${esc(b.title || t.name)}</span>
                <span class="sharedlist__meta">
                  ${date ? esc(fmtDate(date, { short: true, weekday: false })) : ''}${time ? ' · ' + esc(time.slice(0, 5)) : ''}
                  ${b.provider ? ' · ' + esc(b.provider) : ''}
                  ${b.confirmation ? ' · ' + esc(b.confirmation) : ''}
                </span>
              </span>
              <span class="sharedlist__side">
                ${b.price ? `<b>${fmtMoney(b.price, b.currency)}</b>` : ''}
                ${b.status === 'pending' ? '<em class="is-pending">待确认</em>' : ''}
              </span>
            </li>`;
        }).join('')}
      </ul>
    </section>`;
}

function gearCard(w, gear, members) {
  const groups = GEAR_CATEGORIES
    .map((cat) => ({ cat, items: gear.filter((g) => g.category === cat.id).sort((a, b) => (b.weightG * b.qty) - (a.weightG * a.qty)) }))
    .filter((g) => g.items.length);

  const team = members.length >= 2 ? weightsByOwner(gear, members) : null;

  return `
    <section class="card">
      <header class="card__head">
        <h2 class="card__title">${icon('backpack', 15)}装备清单</h2>
        <span class="card__note">${fmtKg(w.pack, 2)} · ${gradeLabel(w)}</span>
      </header>

      ${team ? `
        <div class="teamblock teamblock--flat">
          <div class="teamblock__head"><span class="teamblock__title">每人背负</span></div>
          ${team.perMember.map((m) => `
            <div class="pprow">
              <span class="pprow__who">
                <i class="avatar avatar--xs" style="background:${esc(m.color || '#9b9a97')}">${esc(memberInitial(m.name))}</i>
                <b>${esc(m.name)}</b>
              </span>
              <span class="pprow__bar"><i style="width:${(m.weight / Math.max(team.perMember[0].weight, 1)) * 100}%;background:${esc(m.color || '#9b9a97')}"></i></span>
              <span class="pprow__val">${fmtWeight(m.weight)}</span>
            </div>`).join('')}
        </div>` : ''}

      ${groups.map(({ cat, items }) => `
        <div class="sharedgroup">
          <div class="sharedgroup__head" style="color:${cat.color}">${icon(cat.icon, 13)}${esc(cat.name)}</div>
          <ul class="sharedlist sharedlist--tight">
            ${items.map((g) => `
              <li class="sharedlist__item sharedlist__item--plain">
                <span class="sharedlist__body">
                  <span class="sharedlist__title">${esc(g.name)}${g.qty > 1 ? `<em class="qty">×${g.qty}</em>` : ''}</span>
                </span>
                <span class="sharedlist__side"><b>${fmtWeight((g.weightG || 0) * (g.qty || 1))}</b></span>
              </li>`).join('')}
          </ul>
        </div>`).join('')}
    </section>`;
}

function gradeLabel(w) {
  const g = baseWeightGrade(w.base);
  return `${g.label}`;
}

function moneyCard(money, settings, expenses, trip) {
  const base = money.baseCurrency;
  const members = trip.members || [];
  const sorted = [...expenses].sort((a, b) => {
    const d = String(b.date || '').localeCompare(String(a.date || ''));
    return d !== 0 ? d : String(a.id).localeCompare(String(b.id));
  });

  return `
    <section class="card">
      <header class="card__head">
        <h2 class="card__title">${icon('wallet', 15)}花销概况</h2>
        <span class="card__note">${fmtMoney(money.total, base)} · ${money.count} 笔</span>
      </header>
      <div class="catbars catbars--money">
        ${money.byCategory.map((c) => {
          const cat = expenseCatOf(c.id);
          return `
            <div class="catbar">
              <span class="catbar__name" style="color:${cat.color}">${icon(cat.icon, 12)}${esc(cat.name)}</span>
              <span class="catbar__track"><i style="width:${(c.amount / money.byCategory[0].amount) * 100}%;background:${cat.color}"></i></span>
              <span class="catbar__val">${fmtMoney(c.amount, money.baseCurrency)}</span>
            </div>`;
        }).join('')}
      </div>
      ${money.byCurrency.length > 1 ? `
        <div class="money-currs">
          <span class="money-currs__label">多币种</span>
          ${money.byCurrency.map((c) => `<span class="currchip">${esc(c.currency)} <b>${fmtNum(c.amount, 0)}</b></span>`).join('')}
        </div>` : ''}

      <details class="fold">
        <summary class="fold__summary">
          ${icon('list', 13)}<span>花销明细</span><em>${sorted.length} 笔</em>${icon('chevronDown', 14)}
        </summary>
        <ul class="sharedlist sharedlist--tight">
          ${sorted.map((e) => {
            const cat = expenseCatOf(e.category);
            const converted = e.currency !== base;
            const payer = members.length >= 2 && e.paidBy ? memberName(trip, e.paidBy) : '';
            return `
              <li class="sharedlist__item sharedlist__item--plain">
                <span class="sharedlist__icon" style="color:${cat.color}">${icon(cat.icon, 13)}</span>
                <span class="sharedlist__body">
                  <span class="sharedlist__title">${esc(e.note || cat.name)}</span>
                  <span class="sharedlist__meta">
                    ${esc(fmtDate(e.date, { short: true, weekday: false }))} · ${esc(cat.name)}${payer ? ' · ' + esc(payer) + ' 付' : ''}${e.memo ? ' · ' + esc(e.memo) : ''}
                  </span>
                </span>
                <span class="sharedlist__side">
                  <b>${fmtMoney(e.amount, e.currency)}</b>
                  ${converted ? `<em>≈ ${fmtMoney(toBase(e.amount, e.currency, settings), base)}</em>` : ''}
                </span>
              </li>`;
          }).join('')}
        </ul>
      </details>
    </section>`;
}

/* ---------------- 交互 ---------------- */

function bind(app, token, payload) {
  app.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-shared-action]');
    if (!btn) return;
    if (btn.dataset.sharedAction === 'import') {
      const id = importShared(store, payload);
      // 不需要整页重载：store 已经是新的了，改 hash 就会重新渲染
      window.location.hash = `#/t/${encodeURIComponent(id)}/overview`;
    }
  });
}
