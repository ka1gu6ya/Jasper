/* ============================================================
   views/overview.js — 行程概览：一眼看清这趟的负重、难度和预算
   ============================================================ */

import {
  esc, fmtDate, fmtDateRange, fmtWeight, fmtKg, fmtMoney, fmtNum,
  daysUntil, nightsBetween, eachDay,
} from '../util.js';
import {
  computeWeights, baseWeightGrade, computeDifficulty, expenseStats,
  TRIP_TYPES, catOf, bookingTypeOf, expenseCatOf, TERRAINS,
  memberInitial, computeSettlement,
} from '../calc.js';
import { openMembersModal } from '../members.js';
import { icon, badge, progress, emptyState, stat, openModal, toast } from '../ui.js';
import { CURRENCIES } from '../store.js';

export function render(ctx) {
  const { trip, store } = ctx;
  const gear = store.gearOf(trip.id);
  const days = store.daysOf(trip.id);
  const bookings = store.bookingsOf(trip.id);
  const expenses = store.expensesOf(trip.id);

  const w = computeWeights(gear);
  const grade = baseWeightGrade(w.base);
  const diff = computeDifficulty(days, w.pack / 1000);
  const money = expenseStats(expenses, store.data.settings);

  const members = trip.members || [];
  const team = members.length >= 2;
  const settlement = team ? computeSettlement(expenses, members, store.data.settings) : null;
  const type = TRIP_TYPES.find((t) => t.id === trip.type) || TRIP_TYPES[0];
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const totalDays = Math.max(days.length, eachDay(trip.startDate, trip.endDate).length);
  const until = daysUntil(trip.startDate);
  const endUntil = daysUntil(trip.endDate);

  const countdown = (() => {
    if (until === null) return { num: '—', label: '未设日期' };
    if (until > 0) return { num: String(until), label: '天后出发' };
    if (endUntil !== null && endUntil >= 0) return { num: String(Math.abs(until) + 1), label: '进行中 · 第几天' };
    return { num: String(Math.abs(endUntil ?? 0)), label: '天前结束' };
  })();

  const budgetPct = trip.budget > 0 ? (money.total / trip.budget) * 100 : 0;
  const packed = gear.filter((g) => g.packed).length;
  const confirmed = bookings.filter((b) => b.status === 'confirmed').length;

  const upcoming = bookings
    .filter((b) => b.status !== 'cancelled')
    .slice(0, 4);

  return `
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

    <div class="memberstrip">
      ${members.map((m) => `
        <span class="mpill" title="${esc(m.role || '成员')}">
          <i style="background:${esc(m.color || '#9b9a97')}">${esc(memberInitial(m.name))}</i>
          ${esc(m.name)}${m.role ? `<em>${esc(m.role)}</em>` : ''}
        </span>`).join('')}
      <button class="mpill mpill--add" data-action="members">
        ${icon(members.length ? 'edit' : 'plus', 12)}${members.length ? '管理成员' : '添加同行成员'}
      </button>
      ${settlement ? `<span class="memberstrip__hint">${icon('wallet', 12)}分摊结算已就绪</span>` : ''}
    </div>

    <section class="stat-grid">
      ${stat({
        label: '背负重量', value: fmtKg(w.pack, 2),
        hint: `含消耗品 · 基础 ${fmtKg(w.base, 2)}`,
        iconName: 'backpack', color: grade.color,
      })}
      ${stat({
        label: '基础重量', value: fmtKg(w.base, 2),
        hint: `体量档位：${grade.label} · ${grade.en}`,
        iconName: 'scale', color: grade.color,
      })}
      ${stat({
        label: '难度指数', value: diff.total > 0 ? fmtNum(diff.total) : '—',
        hint: `${diff.grade.label}${diff.hikingDays ? ` · 徒步 ${diff.hikingDays} 天` : ''}`,
        iconName: 'trending', color: diff.grade.color,
      })}
      ${stat({
        label: '花销', value: fmtMoney(money.total, money.baseCurrency),
        hint: trip.budget > 0 ? `预算 ${fmtMoney(trip.budget, money.baseCurrency)} · 已用 ${Math.round(budgetPct)}%` : `${money.count} 笔记录`,
        iconName: 'wallet', color: budgetPct > 100 ? 'var(--danger)' : budgetPct > 85 ? '#9a7c3f' : 'var(--accent)',
      })}
    </section>

    ${w.items ? weightCard(w, grade, ctx) : ''}
    ${diff.total > 0 ? difficultyCard(diff) : ''}

    <div class="two-col">
      ${bookingsCard(upcoming, confirmed, bookings.length, ctx)}
      ${moneyCard(money, trip, budgetPct, ctx)}
    </div>
  `;
}

/* ---------------- 重量卡 ---------------- */

function weightCard(w, grade, ctx) {
  const total = w.skinOut || 1;
  const segs = [
    { name: '基础', g: w.base, color: 'var(--accent)' },
    { name: '消耗品', g: w.consumable, color: '#9a7c3f' },
    { name: '穿戴', g: w.worn, color: '#5b6f8a' },
  ].filter((s) => s.g > 0);

  const topCats = w.byCategory.slice(0, 6);
  const maxCat = topCats[0]?.weight || 1;

  return `
    <section class="card">
      <header class="card__head">
        <h2 class="card__title">${icon('scale', 15)}背包重量构成</h2>
        <button class="link-btn" data-action="go-gear">管理装备${icon('chevronRight', 13)}</button>
      </header>

      <div class="weight-hero">
        <div class="weight-hero__num">${fmtKg(w.pack, 2)}<span>背负</span></div>
        <div class="weight-hero__side">
          <div class="weight-hero__row"><span>基础重量</span><b>${fmtKg(w.base, 2)}</b></div>
          <div class="weight-hero__row"><span>Skin-out 总重</span><b>${fmtKg(w.skinOut, 2)}</b></div>
          <div class="weight-hero__grade" style="--g:${grade.color}">${esc(grade.label)} <em>${esc(grade.en)}</em></div>
        </div>
      </div>

      <div class="segbar">
        ${segs.map((s) => `<span style="width:${(s.g / total) * 100}%;background:${s.color}" title="${esc(s.name)} ${fmtWeight(s.g)}"></span>`).join('')}
      </div>
      <div class="seglegend">
        ${segs.map((s) => `
          <span class="seglegend__item"><i style="background:${s.color}"></i>${esc(s.name)} <b>${fmtWeight(s.g)}</b></span>
        `).join('')}
      </div>

      <div class="catbars">
        ${topCats.map((c) => {
          const cat = catOf(c.id);
          return `
            <div class="catbar">
              <span class="catbar__name" style="color:${cat.color}">${icon(cat.icon, 12)}${esc(cat.name)}</span>
              <span class="catbar__track"><i style="width:${(c.weight / maxCat) * 100}%;background:${cat.color}"></i></span>
              <span class="catbar__val">${fmtWeight(c.weight)}</span>
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

/* ---------------- 难度卡 ---------------- */

function difficultyCard(diff) {
  const max = Math.max(...diff.perDay.map((d) => d.effort), 1);
  return `
    <section class="card">
      <header class="card__head">
        <h2 class="card__title">${icon('trending', 15)}每日强度</h2>
        <span class="card__note">总指数 <b>${fmtNum(diff.total)}</b> · ${esc(diff.grade.label)}</span>
      </header>
      <p class="card__desc">${esc(diff.grade.desc)}</p>

      <div class="effortchart">
        ${diff.perDay.map((d) => {
          const t = TERRAINS.find((x) => x.id === d.terrain);
          return `
            <div class="effortbar" title="${esc(fmtDate(d.date))} · ${d.effort} 指数">
              <span class="effortbar__val">${d.effort > 0 ? d.effort : ''}</span>
              <span class="effortbar__track">
                <i style="height:${d.effort ? Math.max(6, (d.effort / max) * 100) : 2}%;background:${d.effort ? diff.grade.color : 'var(--border)'}"></i>
              </span>
              <span class="effortbar__day">${esc(fmtDate(d.date, { short: true, weekday: false }))}</span>
              <span class="effortbar__sub">${d.distanceKm || 0}km${d.gainM ? ` / ${d.gainM}m` : ''}</span>
            </div>`;
        }).join('')}
      </div>

      <div class="difficulty-facts">
        <span><b>${fmtNum(diff.distance)}</b> km 总距离</span>
        <span><b>${fmtNum(diff.gain)}</b> m 累计爬升</span>
        <span>最高 <b>${fmtNum(diff.maxAlt)}</b> m</span>
        ${diff.hardest ? `<span>最难：<b>${esc(fmtDate(diff.hardest.date, { short: true, weekday: false }))}</b></span>` : ''}
        <span class="muted">负重系数 ×${diff.loadFactor}</span>
      </div>
    </section>`;
}

/* ---------------- 预定卡 ---------------- */

function bookingsCard(upcoming, confirmed, total, ctx) {
  return `
    <section class="card">
      <header class="card__head">
        <h2 class="card__title">${icon('ticket', 15)}预定进度</h2>
        <button class="link-btn" data-action="go-bookings">全部${icon('chevronRight', 13)}</button>
      </header>
      <div class="mini-fact"><b>${confirmed}</b> / ${total} 已确认</div>
      ${upcoming.length ? `
        <ul class="minilist">
          ${upcoming.map((b) => {
            const t = bookingTypeOf(b.type);
            const { date, time } = splitTime(b.startAt || b.date);
            return `
              <li class="minilist__item">
                <span class="minilist__icon" style="color:${t.color}">${icon(t.icon, 14)}</span>
                <span class="minilist__body">
                  <span class="minilist__title">${esc(b.title || t.name)}</span>
                  <span class="minilist__meta">${esc(fmtDate(date, { short: true, weekday: false }))}${time ? ' · ' + esc(time) : ''}</span>
                </span>
                ${b.status === 'pending' ? badge('待确认', '#9a7c3f') : ''}
              </li>`;
          }).join('')}
        </ul>` : `<p class="muted small">还没有录入任何预定。</p>`}
    </section>`;
}

/* ---------------- 花销卡 ---------------- */

function moneyCard(money, trip, pct, ctx) {
  const cats = money.byCategory.slice(0, 4);
  return `
    <section class="card">
      <header class="card__head">
        <h2 class="card__title">${icon('wallet', 15)}花销分布</h2>
        <button class="link-btn" data-action="go-expenses">明细${icon('chevronRight', 13)}</button>
      </header>
      <div class="mini-fact"><b>${fmtMoney(money.total, money.baseCurrency)}</b> 已记录 · ${money.count} 笔</div>
      ${trip.budget > 0 ? `
        <div class="budget-line">
          ${progress(pct, pct > 100 ? 'var(--danger)' : pct > 85 ? '#9a7c3f' : 'var(--accent)', 7)}
          <span class="budget-line__label">预算已用 ${Math.round(pct)}%</span>
        </div>` : ''}
      ${cats.length ? `
        <div class="catbars catbars--money">
          ${cats.map((c) => {
            const cat = expenseCatOf(c.id);
            return `
              <div class="catbar">
                <span class="catbar__name" style="color:${cat.color}">${icon(cat.icon, 12)}${esc(cat.name)}</span>
                <span class="catbar__track"><i style="width:${(c.amount / cats[0].amount) * 100}%;background:${cat.color}"></i></span>
                <span class="catbar__val">${fmtMoney(c.amount, money.baseCurrency)}</span>
              </div>`;
          }).join('')}
        </div>` : `<p class="muted small">还没有记账。</p>`}
    </section>`;
}

function splitTime(s) {
  const [date, time] = String(s || '').split('T');
  return { date: date || '', time: (time || '').slice(0, 5) };
}

/* ==================== 交互 ==================== */

export function mount(root, ctx) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'members') { openMembersModal(ctx); return; }
    if (a === 'go-gear') ctx.go('gear');
    if (a === 'go-bookings') ctx.go('bookings');
    if (a === 'go-expenses') ctx.go('expenses');
    if (a === 'go-itinerary') ctx.go('itinerary');
  });
}
