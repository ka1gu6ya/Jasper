/* ============================================================
   views/bookings.js — 预定信息：录入、确认状态、日历导出、邮件导入
   ============================================================ */

import {
  esc, fmtDate, fmtMoney, fmtDateTime, uid, download, slug, splitDateTime,
} from '../util.js';
import { BOOKING_TYPES, bookingTypeOf, bookingsToICS, parseBookingText } from '../calc.js';
import {
  icon, badge, openModal, confirmDialog, toast,
  field, textareaField, selectField, formGrid, emptyState,
} from '../ui.js';
import { CURRENCIES } from '../store.js';

const STATUS_META = {
  confirmed: { label: '已确认', color: '#2f6b52' },
  pending: { label: '待确认', color: '#9a7c3f' },
  cancelled: { label: '已取消', color: '#a05f5f' },
};

export function render(ctx) {
  const { trip, store } = ctx;
  const bookings = store.bookingsOf(trip.id);

  const head = `
    <div class="bar">
      <div class="bar__facts">
        <span><b>${bookings.length}</b> 条预定</span>
        <span><b>${bookings.filter((b) => b.status === 'confirmed').length}</b> 已确认</span>
        ${bookings.filter((b) => b.status === 'pending').length
          ? `<span class="bar__warn">${bookings.filter((b) => b.status === 'pending').length} 条待确认</span>` : ''}
      </div>
      <div class="bar__actions">
        <button class="btn btn--ghost btn--sm" data-action="import">${icon('sparkles', 13)}从邮件导入</button>
        <button class="btn btn--ghost btn--sm" data-action="export-ics">${icon('download', 13)}导出 .ics</button>
        <button class="btn btn--primary btn--sm" data-action="add">${icon('plus', 13)}新增预定</button>
      </div>
    </div>`;

  if (!bookings.length) {
    return head + emptyState({
      iconName: 'ticket',
      title: '还没有预定信息',
      desc: '航班、火车、住宿、徒步许可都可以记在这里。录入后可以一键导出到系统日历。',
      action: `<button class="btn btn--primary" data-action="add">${icon('plus', 14)}录入第一条</button>`,
    });
  }

  // 按日期分组
  const groups = new Map();
  for (const b of bookings) {
    const key = (b.startAt || b.date || '').slice(0, 10) || 'unscheduled';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a.localeCompare(b)));

  return head + `
    <div class="timeline">
      ${keys.map((k) => `
        <div class="tl-group">
          <div class="tl-date">
            ${k === 'unscheduled' ? '<b>待定</b><span>未定日期</span>' : `
              <b>${esc(fmtDate(k, { short: true, weekday: false }))}</b>
              <span>${esc(fmtDate(k, { weekday: true }).split(' ').pop())}</span>`}
          </div>
          <div class="tl-items">${groups.get(k).map(bookingCard).join('')}</div>
        </div>
      `).join('')}
    </div>`;
}

function bookingCard(b) {
  const t = bookingTypeOf(b.type);
  const st = STATUS_META[b.status] || STATUS_META.confirmed;
  const { time: startTime } = splitDateTime(b.startAt || b.date);
  const { time: endTime, date: endDate } = splitDateTime(b.endAt);

  const route = b.from || b.to
    ? `<span class="bk__route">${esc(b.from || '—')}${icon('chevronRight', 11)}${esc(b.to || '—')}</span>`
    : b.address ? `<span class="bk__route">${icon('pin', 11)}${esc(b.address)}</span>` : '';

  return `
    <article class="bk ${b.status === 'cancelled' ? 'is-cancelled' : ''}" style="--bk:${t.color}">
      <div class="bk__type">${icon(t.icon, 15)}</div>
      <div class="bk__body">
        <div class="bk__row1">
          <h3 class="bk__title">${esc(b.title || t.name)}</h3>
          ${b.price ? `<span class="bk__price">${fmtMoney(b.price, b.currency)}</span>` : ''}
        </div>
        <div class="bk__meta">
          ${startTime ? `<span>${icon('clock', 11)}${esc(startTime)}${endTime ? ' – ' + esc(endTime) : ''}</span>` : ''}
          ${b.provider ? `<span>${esc(b.provider)}</span>` : ''}
          ${route}
        </div>
        ${b.confirmation ? `
          <div class="bk__conf">
            <span class="bk__conf-label">确认号</span>
            <code>${esc(b.confirmation)}</code>
            <button class="icon-btn icon-btn--sm" data-action="copy" data-copy="${esc(b.confirmation)}" title="复制">${icon('copy', 12)}</button>
          </div>` : ''}
        ${b.notes ? `<p class="bk__notes">${esc(b.notes)}</p>` : ''}
      </div>
      <div class="bk__side">
        <button class="status-pill" data-action="status" data-id="${esc(b.id)}" style="--s:${st.color}" title="点击切换状态">${st.label}</button>
        <div class="bk__tools">
          <button class="icon-btn icon-btn--sm" data-action="edit" data-id="${esc(b.id)}" title="编辑">${icon('edit', 14)}</button>
          <button class="icon-btn icon-btn--sm" data-action="del" data-id="${esc(b.id)}" title="删除">${icon('trash', 14)}</button>
        </div>
      </div>
    </article>`;
}

/* ==================== 表单 ==================== */

function bookingFormHTML(b = {}) {
  const s = splitDateTime(b.startAt);
  const e = splitDateTime(b.endAt);
  return formGrid(`
    ${selectField({ label: '类型', name: 'type', span: 1, value: b.type || 'flight', options: BOOKING_TYPES.map((t) => ({ value: t.id, label: t.name })) })}
    ${field({ label: '标题', name: 'title', span: 1, value: b.title || '', placeholder: '上海虹桥 → 成都天府', required: true })}
    ${field({ label: '服务方', name: 'provider', span: 1, value: b.provider || '', placeholder: '航司 / 酒店 / 平台' })}
    ${field({ label: '确认号', name: 'confirmation', span: 1, value: b.confirmation || '', placeholder: 'PNR / 订单号' })}

    <div class="form-divider field--span2"><span>时间</span><em>开始必填，结束可留空</em></div>
    ${field({ label: '开始日期', name: 'startDate', type: 'date', span: 1, value: s.date })}
    ${field({ label: '开始时间', name: 'startTime', type: 'time', span: 1, value: s.time })}
    ${field({ label: '结束日期', name: 'endDate', type: 'date', span: 1, value: e.date })}
    ${field({ label: '结束时间', name: 'endTime', type: 'time', span: 1, value: e.time })}

    <div class="form-divider field--span2"><span>地点</span></div>
    ${field({ label: '出发地', name: 'from', span: 1, value: b.from || '', placeholder: '上海虹桥 T2' })}
    ${field({ label: '到达地', name: 'to', span: 1, value: b.to || '', placeholder: '成都天府 T2' })}
    ${field({ label: '地址', name: 'address', span: 2, value: b.address || '', placeholder: '住宿地址 / 集合点' })}

    <div class="form-divider field--span2"><span>费用与状态</span></div>
    ${field({ label: '金额', name: 'price', type: 'number', step: '0.01', min: '0', span: 1, value: b.price ?? '', placeholder: '0.00' })}
    ${selectField({ label: '币种', name: 'currency', span: 1, value: b.currency || 'CNY', options: CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })) })}
    ${selectField({ label: '状态', name: 'status', span: 1, value: b.status || 'confirmed', options: Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label })) })}
    ${field({ label: '备注', name: 'notes', span: 1, value: b.notes || '', placeholder: '行李额、退改政策…' })}
  `);
}

function openBookingForm(ctx, preset = {}, detected = null) {
  const { store, trip, rerender } = ctx;
  const editing = !!preset.id;

  const hint = detected && detected.matches.length
    ? `<div class="detected">
         <div class="detected__head">${icon('sparkles', 13)}识别到 ${detected.matches.length} 个候选字段，已填入表单，请核对</div>
         <div class="detected__chips">
           ${detected.matches.slice(0, 12).map((m) => `<span class="detected__chip"><em>${esc(m.label)}</em>${esc(m.value)}</span>`).join('')}
         </div>
       </div>`
    : '';

  openModal({
    title: editing ? '编辑预定' : '新增预定',
    subtitle: editing ? '' : '也可以先用「从邮件导入」自动填充',
    size: 'lg',
    body: hint + bookingFormHTML(preset),
    onSubmit: (d) => {
      if (!d.title.trim()) { toast('标题不能为空', 'error'); return false; }
      const startAt = d.startDate ? `${d.startDate}T${d.startTime || '00:00'}` : '';
      const endAt = d.endDate ? `${d.endDate}T${d.endTime || '00:00'}` : '';
      if (!startAt) { toast('请填写开始日期', 'error'); return false; }

      const payload = {
        type: d.type, title: d.title.trim(), provider: d.provider || '',
        confirmation: d.confirmation || '', startAt, endAt,
        from: d.from || '', to: d.to || '', address: d.address || '',
        price: d.price === '' ? '' : Number(d.price),
        currency: d.currency, status: d.status, notes: d.notes || '',
        date: d.startDate,
      };

      store.commit((s) => {
        if (editing) {
          const b = s.bookings.find((x) => x.id === preset.id);
          Object.assign(b, payload);
        } else {
          s.bookings.push({ id: uid('bk_'), tripId: trip.id, ...payload });
        }
      }, { action: editing ? 'booking.update' : 'booking.add', entity: 'booking', id: preset.id });
      toast(editing ? '已保存' : '已添加预定', 'success');
      rerender();
    },
  });
}

function openImportModal(ctx) {
  openModal({
    title: '从确认邮件导入',
    subtitle: '粘贴邮件正文，自动识别航班号、确认号、日期、金额，再由你确认',
    size: 'md',
    submitText: '解析',
    body: formGrid(textareaField({
      label: '邮件内容', name: 'raw', rows: 9, span: 2,
      placeholder: '把航空 / 酒店 / 铁路的确认邮件全文粘贴到这里…\n\n例如：\n您的航班 MU5401 已确认\n日期：2026年11月5日 08:30\n确认号：7XK2P9\n总价：¥1080',
    })),
    onSubmit: (d) => {
      const text = (d.raw || '').trim();
      if (!text) { toast('先粘贴内容', 'error'); return false; }
      const res = parseBookingText(text);
      const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l && l.length < 60) || '';
      const preset = {
        type: res.candidates.type || 'other',
        confirmation: res.candidates.confirmation || '',
        startAt: res.candidates.date
          ? `${res.candidates.date}T${res.candidates.time || '09:00'}`
          : '',
        price: res.candidates.price || '',
        currency: res.candidates.currency || ctx.store.data.settings.baseCurrency,
        title: firstLine.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '').slice(0, 48),
        from: res.candidates.from || '',
        to: res.candidates.to || '',
      };
      setTimeout(() => openBookingForm(ctx, preset, res), 240);
    },
  });
}

/* ==================== 交互 ==================== */

export function mount(root, ctx) {
  const { store, trip, rerender } = ctx;

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    if (action === 'add') return openBookingForm(ctx, {});
    if (action === 'import') return openImportModal(ctx);

    if (action === 'copy') {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        toast('已复制', 'success');
      } catch {
        toast('复制失败，请手动选择', 'error');
      }
      return;
    }

    if (action === 'export-ics') return exportICS(ctx);

    if (action === 'edit') {
      const b = store.bookingsOf(trip.id).find((x) => x.id === id);
      if (b) openBookingForm(ctx, b);
      return;
    }

    if (action === 'del') {
      const ok = await confirmDialog({ message: '删除这条预定？' });
      if (!ok) return;
      store.commit((s) => { s.bookings = s.bookings.filter((b) => b.id !== id); },
        { action: 'booking.delete', entity: 'booking', id });
      toast('已删除');
      rerender();
      return;
    }

    if (action === 'status') {
      const order = ['confirmed', 'pending', 'cancelled'];
      store.commit((s) => {
        const b = s.bookings.find((x) => x.id === id);
        if (b) b.status = order[(order.indexOf(b.status || 'confirmed') + 1) % order.length];
      }, { action: 'booking.status', entity: 'booking', id });
      rerender();
      return;
    }
  });
}

export function exportICS(ctx) {
  const { trip, store } = ctx;
  const list = store.bookingsOf(trip.id);
  if (!list.length) { toast('还没有预定可以导出', 'error'); return; }
  const ics = bookingsToICS(list, trip);
  download(`${slug(trip.name)}-预定.ics`, new Blob([ics], { type: 'text/calendar;charset=utf-8' }), 'text/calendar');
  toast(`已导出 ${list.length} 条日程`, 'success');
}
