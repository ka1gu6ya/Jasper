/* ============================================================
   views/expenses.js — 花销记录：多币种、分类、预算对照
   ============================================================ */

import {
  esc, fmtDate, fmtMoney, fmtNum, uid, todayStr, parseDay, eachDay,
} from '../util.js';
import {
  EXPENSE_CATEGORIES, expenseCatOf, expenseStats, toBase, DEFAULT_RATES,
  computeSettlement, memberById, memberName, memberInitial,
} from '../calc.js';
import { openMembersModal } from '../members.js';
import {
  icon, openModal, confirmDialog, toast, progress,
  field, selectField, formGrid, emptyState,
} from '../ui.js';
import { CURRENCIES } from '../store.js';

export function render(ctx) {
  const { trip, store } = ctx;
  const expenses = store.expensesOf(trip.id);
  const settings = store.data.settings;
  const members = trip.members || [];
  const team = members.length >= 2;
  const settlement = team ? computeSettlement(expenses, members, settings) : null;
  const money = expenseStats(expenses, settings);
  const base = money.baseCurrency;
  const pct = trip.budget > 0 ? (money.total / trip.budget) * 100 : 0;

  const tripDays = Math.max(1, eachDay(trip.startDate, trip.endDate).length);
  const perDay = money.total / tripDays;

  const head = `
    <section class="card card--money">
      <header class="card__head">
        <h2 class="card__title">${icon('wallet', 15)}花销总览</h2>
        <button class="link-btn" data-action="rates">${icon('sliders', 12)}汇率设置</button>
      </header>
      <div class="money-top">
        <div class="money-total">
          <span class="money-total__label">已记录支出</span>
          <span class="money-total__value">${fmtMoney(money.total, base)}</span>
          <span class="money-total__sub">${money.count} 笔 · 日均 ${fmtMoney(perDay, base)}</span>
        </div>
        <div class="money-budget">
          ${trip.budget > 0 ? `
            <div class="money-budget__row">
              <span>预算 ${fmtMoney(trip.budget, base)}</span>
              <b class="${pct > 100 ? 'is-over' : ''}">已用 ${Math.round(pct)}%</b>
            </div>
            ${progress(pct, pct > 100 ? 'var(--danger)' : pct > 85 ? '#9a7c3f' : 'var(--accent)', 8)}
            <div class="money-budget__sub ${pct > 100 ? 'is-over' : ''}">
              ${pct > 100 ? '超支 ' + fmtMoney(money.total - trip.budget, base) : '剩余 ' + fmtMoney(trip.budget - money.total, base)}
            </div>
          ` : `<div class="money-budget__row"><span>还没设定预算</span><b>—</b></div>
               <div class="money-budget__sub">在「编辑行程」里填一个预算数字</div>`}
        </div>
      </div>

      ${money.byCategory.length ? `
        <div class="money-cats">
          ${money.byCategory.map((c) => {
            const cat = expenseCatOf(c.id);
            return `
              <div class="money-cat">
                <span class="money-cat__name" style="color:${cat.color}">${icon(cat.icon, 13)}${esc(cat.name)}</span>
                <span class="money-cat__bar"><i style="width:${(c.amount / money.byCategory[0].amount) * 100}%;background:${cat.color}"></i></span>
                <span class="money-cat__val">${fmtMoney(c.amount, base)}</span>
                <span class="money-cat__pct">${Math.round((c.amount / money.total) * 100)}%</span>
              </div>`;
          }).join('')}
        </div>` : ''}

      ${money.byCurrency.length > 1 ? `
        <div class="money-currs">
          <span class="money-currs__label">多币种汇总</span>
          ${money.byCurrency.map((c) => {
            const rate = settings.rates[c.currency] ?? DEFAULT_RATES[c.currency] ?? 1;
            return `<span class="currchip">${esc(c.currency)} <b>${fmtNum(c.amount, 0)}</b><em>${rate !== 1 ? `×${rate} ` : ''}→ ${fmtMoney(c.amount * rate, base)}</em></span>`;
          }).join('')}
        </div>` : ''}
    </section>`;

  const settleCard = team ? settlementCard(settlement, trip, base) : '';

  const quickAdd = `
    <form class="quickadd ${team ? 'quickadd--team' : ''}" data-quickadd>
      <div class="quickadd__amount">
        <span class="quickadd__cur">${esc(base)}</span>
        <input class="input" name="amount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" required />
      </div>
      <select class="input input--select" name="category">
        ${EXPENSE_CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === 'food' ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      ${team ? `<select class="input input--select" name="paidBy" title="谁付的">
        ${members.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} 付</option>`).join('')}
      </select>` : ''}
      <input class="input" name="note" placeholder="备注，例如：午餐 / 门票 / 车票" />
      <button class="btn btn--ghost btn--sm quickadd__more" type="button" data-action="add">${icon('edit', 13)}详细录入</button>
      <button class="btn btn--primary" type="submit">${icon('plus', 14)}记账</button>
    </form>`;

  if (!expenses.length) {
    return head + settleCard + quickAdd + emptyState({
      iconName: 'wallet',
      title: '还没有记账',
      desc: '用上面的快捷输入，写金额、选类别就能记一笔。要换币种或改日期，用「详细录入」。',
    });
  }

  // 按日期分组
  const groups = new Map();
  for (const e of expenses) {
    const k = e.date || 'unknown';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }

  const list = [...groups.entries()].map(([date, items]) => {
    const dayTotal = items.reduce((s, e) => s + toBase(e.amount, e.currency, settings), 0);
    return `
      <div class="exgroup">
        <header class="exgroup__head">
          <span class="exgroup__date">${date === 'unknown' ? '未记日期' : esc(fmtDate(date))}</span>
          <span class="exgroup__total">${fmtMoney(dayTotal, base)}</span>
        </header>
        <ul class="exitems">
          ${items.map((e) => {
            const cat = expenseCatOf(e.category);
            const converted = e.currency !== base;
            return `
              <li class="exitem">
                <span class="exitem__icon" style="color:${cat.color}">${icon(cat.icon, 14)}</span>
                <span class="exitem__body">
                  <span class="exitem__note">${esc(e.note || cat.name)}</span>
                  <span class="exitem__meta">
                    ${esc(cat.name)}${team && e.paidBy ? ` · ${esc(memberName(trip, e.paidBy))} 付` : ''}${team && Array.isArray(e.splitWith) && e.splitWith.length > 1 ? ` · ${e.splitWith.length} 人均摊` : ''}${e.memo ? ' · ' + esc(e.memo) : ''}
                  </span>
                </span>
                <span class="exitem__amt">
                  <b>${fmtMoney(e.amount, e.currency)}</b>
                  ${converted ? `<em>≈ ${fmtMoney(toBase(e.amount, e.currency, settings), base)}</em>` : ''}
                </span>
                <span class="exitem__tools">
                  <button class="icon-btn icon-btn--sm" data-action="edit" data-id="${esc(e.id)}" title="编辑">${icon('edit', 14)}</button>
                  <button class="icon-btn icon-btn--sm" data-action="del" data-id="${esc(e.id)}" title="删除">${icon('trash', 14)}</button>
                </span>
              </li>`;
          }).join('')}
        </ul>
      </div>`;
  }).join('');

  return head + settleCard + quickAdd + `<div class="exlist">${list}</div>`;
}

/* ---------------- 分摊结算 ---------------- */

function settlementCard(st, trip, base) {
  const head = (extra = '') => `
    <header class="card__head">
      <h2 class="card__title">${icon('shirt', 15)}分摊结算</h2>
      ${extra || `<button class="link-btn" data-action="members">管理成员${icon('chevronRight', 12)}</button>`}
    </header>`;

  if (!st) {
    return `
      <section class="card">
        ${head()}
        <p class="card__desc" style="margin-bottom:0">
          还没有可结算的账目。记账时勾选「谁一起分摊」，这里会自动算出每个人该付多少、谁该补给谁。
        </p>
      </section>`;
  }

  return `
    <section class="card">
      ${head(`<span class="card__note">${st.counted} 笔参与分摊</span>`)}
      <div class="settlerows">
        <div class="settlerow settlerow--head">
          <span>成员</span><span>已付</span><span>应摊</span><span>净额</span>
        </div>
        ${st.perMember.map((m) => {
          const pos = m.net > 0.009;
          const neg = m.net < -0.009;
          return `
            <div class="settlerow">
              <span class="settlerow__who">
                <i class="avatar avatar--xs" style="background:${esc(m.color || '#9b9a97')}">${esc(memberInitial(m.name))}</i>
                <b>${esc(m.name)}</b>${m.role ? `<em>${esc(m.role)}</em>` : ''}
              </span>
              <span class="settlerow__num">${fmtMoney(m.paid, base)}</span>
              <span class="settlerow__num">${fmtMoney(m.share, base)}</span>
              <span class="settlerow__num ${pos ? 'is-pos' : neg ? 'is-neg' : ''}">
                ${pos ? '+' : ''}${fmtMoney(m.net, base)}
              </span>
            </div>`;
        }).join('')}
      </div>

      <div class="transfers">
        <div class="transfers__head">${icon('trending', 13)}结算建议</div>
        ${st.transfers.length
          ? `<ul class="transfers__list">
              ${st.transfers.map((t) => `
                <li>
                  <span class="transfers__from">${esc(t.from.name)}</span>
                  ${icon('chevronRight', 12)}
                  <span class="transfers__to">${esc(t.to.name)}</span>
                  <b>${fmtMoney(t.amount, base)}</b>
                </li>`).join('')}
            </ul>`
          : `<p class="transfers__even">${icon('check', 13)}大家已经平了，不用转账。</p>`}
      </div>
    </section>`;
}

/* ==================== 表单 ==================== */

function openExpenseForm(ctx, preset = {}) {
  const { store, trip, rerender } = ctx;
  const editing = !!preset.id;
  const settings = store.data.settings;
  const members = trip.members || [];
  const team = members.length >= 2;
  const defaultSplit = editing ? (preset.splitWith || []) : members.map((m) => m.id);

  openModal({
    title: editing ? '编辑这笔花销' : '记一笔',
    size: 'md',
    body: formGrid(`
      ${field({ label: '金额', name: 'amount', type: 'number', step: '0.01', min: '0', span: 1, value: preset.amount ?? '', inputmode: 'decimal', required: true })}
      ${selectField({ label: '币种', name: 'currency', span: 1, value: preset.currency || settings.baseCurrency, options: CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })) })}
      ${selectField({ label: '类别', name: 'category', span: 1, value: preset.category || 'food', options: EXPENSE_CATEGORIES.map((c) => ({ value: c.id, label: c.name })) })}
      ${field({ label: '日期', name: 'date', type: 'date', span: 1, value: preset.date || todayStr() })}

      ${team ? `<div class="form-divider field--span2"><span>谁付的 · 谁分摊</span><em>不勾选分摊 = 个人支出</em></div>
      ${selectField({
        label: '付款人', name: 'paidBy', span: 1,
        value: preset.paidBy || members[0].id,
        options: members.map((m) => ({ value: m.id, label: m.role ? `${m.name} · ${m.role}` : m.name })),
        hint: '谁先垫的这笔钱',
      })}
      <div class="field field--span1">
        <span class="field__label">谁一起分摊</span>
        <div class="checks">
          ${members.map((m) => `
            <label class="check check--inline">
              <input type="checkbox" name="splitWith" value="${esc(m.id)}" ${defaultSplit.includes(m.id) ? 'checked' : ''} />
              <span class="check__box">${icon('check', 11)}</span>
              <span class="check__label">${esc(m.name)}</span>
            </label>`).join('')}
        </div>
      </div>` : ''}

      ${field({ label: '说明', name: 'note', span: 2, value: preset.note || '', placeholder: '例如：进山前的补给' })}
      ${field({ label: '备注', name: 'memo', span: 2, value: preset.memo || '', placeholder: '可选' })}
    `),
    onSubmit: (d) => {
      const amount = Number(d.amount);
      if (!amount || amount <= 0) { toast('金额要大于 0', 'error'); return false; }
      const payload = {
        amount, currency: d.currency, category: d.category,
        date: d.date || todayStr(), note: d.note || '', memo: d.memo || '',
        paidBy: team ? (d.paidBy || null) : (preset.paidBy ?? null),
        splitWith: team ? [].concat(d.splitWith || []).filter(Boolean) : (preset.splitWith || []),
      };
      store.commit((s) => {
        if (editing) {
          Object.assign(s.expenses.find((e) => e.id === preset.id), payload);
        } else {
          s.expenses.push({ id: uid('ex_'), tripId: trip.id, ...payload, createdAt: new Date().toISOString() });
        }
      }, { action: editing ? 'expense.update' : 'expense.add', entity: 'expense', id: preset.id });
      toast(editing ? '已保存' : '已记账', 'success');
      rerender();
    },
  });
}

function openRatesModal(ctx) {
  const { store, rerender } = ctx;
  const settings = store.data.settings;
  const used = [...new Set(store.expensesOf(ctx.trip.id).map((e) => e.currency))];
  const others = used.filter((c) => c !== settings.baseCurrency);
  const list = others.length ? others : ['USD', 'JPY', 'EUR'];

  openModal({
    title: '汇率设置',
    subtitle: `1 单位外币 = ? ${settings.baseCurrency}`,
    size: 'md',
    body: formGrid(`
      <p class="modal__text field--span2">这里填的是「1 单位外币能换多少 ${settings.baseCurrency}」。手动填比自动更新更可靠，尤其在山里没网的时候。</p>
      ${list.map((code) => field({
        label: code, name: `rate_${code}`, type: 'number', step: '0.0001', min: '0', span: 1,
        value: settings.rates[code] ?? DEFAULT_RATES[code] ?? '',
      })).join('')}
    `),
    onSubmit: (d) => {
      store.commit((s) => {
        for (const [k, v] of Object.entries(d)) {
          if (k.startsWith('rate_') && Number(v) > 0) {
            s.settings.rates[k.slice(5)] = Number(v);
          }
        }
      }, { action: 'settings.rates', entity: 'settings' });
      toast('汇率已更新', 'success');
      rerender();
    },
  });
}

/* ==================== 交互 ==================== */

export function mount(root, ctx) {
  const { store, trip, rerender } = ctx;
  const members = trip.members || [];
  const team = members.length >= 2;

  // 快捷记账
  const form = root.querySelector('[data-quickadd]');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const amount = Number(fd.get('amount'));
      if (!amount || amount <= 0) { toast('填个金额', 'error'); return; }
      store.commit((s) => {
        s.expenses.push({
          id: uid('ex_'), tripId: trip.id,
          amount, currency: store.data.settings.baseCurrency,
          category: fd.get('category'), note: (fd.get('note') || '').trim(),
          memo: '', date: todayStr(), createdAt: new Date().toISOString(),
          paidBy: team ? (fd.get('paidBy') || members[0].id) : null,
          splitWith: team ? members.map((m) => m.id) : [],
        });
      }, { action: 'expense.add', entity: 'expense' });
      toast('已记账', 'success');
      rerender();
      const again = document.querySelector('[data-quickadd] [name=amount]');
      if (again) again.focus();
    });
  }

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    if (action === 'add') return openExpenseForm(ctx, {});
    if (action === 'rates') return openRatesModal(ctx);
    if (action === 'members') return openMembersModal(ctx);

    if (action === 'edit') {
      const item = store.expensesOf(trip.id).find((x) => x.id === id);
      if (item) openExpenseForm(ctx, item);
      return;
    }

    if (action === 'del') {
      const ok = await confirmDialog({ message: '删除这笔记录？' });
      if (!ok) return;
      store.commit((s) => { s.expenses = s.expenses.filter((x) => x.id !== id); },
        { action: 'expense.delete', entity: 'expense', id });
      rerender();
    }
  });
}
