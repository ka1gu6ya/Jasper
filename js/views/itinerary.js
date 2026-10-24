/* ============================================================
   views/itinerary.js — 逐日行程
   ============================================================ */

import {
  esc, fmtDate, fmtNum, uid, parseDay, addDays, todayStr,
} from '../util.js';
import {
  ITEM_TYPES, TERRAINS, itemTypeOf, dayEffort, computeWeights, computeDifficulty,
} from '../calc.js';
import {
  icon, badge, openModal, confirmDialog, toast,
  field, textareaField, selectField, formGrid, emptyState,
} from '../ui.js';

export function render(ctx) {
  const { trip, store } = ctx;
  const days = store.daysOf(trip.id);
  const w = computeWeights(store.gearOf(trip.id));
  const diff = computeDifficulty(days, w.pack / 1000);

  if (!days.length) {
    return emptyState({
      iconName: 'calendar',
      title: '还没有行程日期',
      desc: '先给这趟旅行设定开始和结束日期，之后每天会自动生成一张日程卡。',
      action: `<button class="btn btn--primary" data-action="edit-trip">${icon('calendar', 14)}设定日期</button>`,
    });
  }

  const today = todayStr();
  const summary = `
    <div class="bar">
      <div class="bar__facts">
        <span><b>${days.length}</b> 天</span>
        <span><b>${fmtNum(diff.distance)}</b> km</span>
        <span><b>${fmtNum(diff.gain)}</b> m 爬升</span>
        <span>最高 <b>${fmtNum(diff.maxAlt)}</b> m</span>
        <span class="bar__grade" style="color:${diff.grade.color}">${esc(diff.grade.label)}</span>
      </div>
      <button class="btn btn--ghost btn--sm" data-action="export-ics">${icon('download', 13)}导出日历</button>
    </div>`;

  const list = days.map((day, i) => dayCard(day, i, today, w.pack / 1000)).join('');

  return summary + `<div class="days">${list}</div>`;
}

function dayCard(day, index, today, packKg) {
  const items = sortItems(day.items || []);
  const hike = day.hike || {};
  const effort = Math.round(dayEffort(day, packKg) * 10) / 10;
  const done = items.filter((x) => x.done).length;
  const isToday = day.date === today;
  const terrain = TERRAINS.find((t) => t.id === hike.terrain);

  const chips = [];
  if (hike.distanceKm) chips.push(`<span class="chip">${icon('route', 12)}${fmtNum(hike.distanceKm, 1)} km</span>`);
  if (hike.gainM) chips.push(`<span class="chip">${icon('trending', 12)}↑ ${fmtNum(hike.gainM)} m</span>`);
  if (hike.maxAlt) chips.push(`<span class="chip">${icon('mountain', 12)}${fmtNum(hike.maxAlt)} m</span>`);
  if (hike.terrain && hike.terrain !== 'trail') chips.push(`<span class="chip">${esc(terrain.name)}</span>`);
  if (effort > 0) chips.push(`<span class="chip chip--effort">强度 ${effort}</span>`);

  return `
    <section class="day ${isToday ? 'day--today' : ''}">
      <header class="day__head">
        <div class="day__date">
          <b>${esc(fmtDate(day.date, { short: true, weekday: false }))}</b>
          <span>${esc(fmtDate(day.date, { weekday: true }).split(' ').pop())}</span>
        </div>
        <div class="day__mid">
          <h3 class="day__title">
            ${esc(day.title || `第 ${index + 1} 天`)}
            ${isToday ? '<span class="tag-today">今天</span>' : ''}
          </h3>
          ${chips.length ? `<div class="day__chips">${chips.join('')}</div>` : ''}
          ${day.notes ? `<p class="day__notes">${esc(day.notes)}</p>` : ''}
        </div>
        <div class="day__tools">
          ${items.length ? `<span class="day__count">${done}/${items.length}</span>` : ''}
          <button class="icon-btn" data-action="day-edit" data-id="${esc(day.id)}" title="编辑当天">${icon('edit', 15)}</button>
        </div>
      </header>

      <ul class="items">
        ${items.map((it) => itemRow(it, day.id)).join('')}
      </ul>

      <button class="add-row" data-action="item-add" data-id="${esc(day.id)}">
        ${icon('plus', 14)}<span>添加安排</span>
      </button>
    </section>`;
}

function itemRow(it, dayId) {
  const type = itemTypeOf(it.type);
  return `
    <li class="item ${it.done ? 'is-done' : ''}">
      <button class="item__check" data-action="item-toggle" data-id="${esc(it.id)}" title="${it.done ? '标记未完成' : '标记完成'}">
        ${it.done ? icon('check', 11) : ''}
      </button>
      <span class="item__time">${esc(it.time || '——')}</span>
      <span class="item__icon" title="${esc(type.name)}">${icon(type.icon, 14)}</span>
      <span class="item__body">
        <span class="item__title">${esc(it.title || type.name)}</span>
        ${it.note ? `<span class="item__note">${esc(it.note)}</span>` : ''}
      </span>
      <span class="item__tools">
        <button class="icon-btn icon-btn--sm" data-action="item-edit" data-id="${esc(it.id)}" data-day="${esc(dayId)}" title="编辑">${icon('edit', 14)}</button>
        <button class="icon-btn icon-btn--sm" data-action="item-del" data-id="${esc(it.id)}" title="删除">${icon('trash', 14)}</button>
      </span>
    </li>`;
}

function sortItems(items) {
  return items
    .slice()
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

/* ==================== 交互 ==================== */

export function mount(root, ctx) {
  const { store, trip, refresh, rerender } = ctx;

  const findDay = (id) => store.daysOf(trip.id).find((d) => d.id === id);
  const findItem = (id) => {
    for (const d of store.daysOf(trip.id)) {
      const it = (d.items || []).find((x) => x.id === id);
      if (it) return { day: d, item: it };
    }
    return {};
  };

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    /* ---- 切换完成 ---- */
    if (action === 'item-toggle') {
      store.commit((s) => {
        for (const d of s.days) {
          const it = (d.items || []).find((x) => x.id === id);
          if (it) it.done = !it.done;
        }
      }, { action: 'item.toggle', entity: 'day_item', id });
      rerender();
      return;
    }

    /* ---- 删除安排 ---- */
    if (action === 'item-del') {
      const ok = await confirmDialog({ message: '删除这条安排？' });
      if (!ok) return;
      store.commit((s) => {
        for (const d of s.days) d.items = (d.items || []).filter((x) => x.id !== id);
      }, { action: 'item.delete', entity: 'day_item', id });
      rerender();
      return;
    }

    /* ---- 新增安排 ---- */
    if (action === 'item-add') {
      const day = findDay(id);
      if (!day) return;
      openModal({
        title: '添加安排',
        subtitle: `${fmtDate(day.date)}`,
        body: formGrid(`
          ${field({ label: '时间', name: 'time', type: 'time', value: '09:00', span: 1 })}
          ${selectField({ label: '类型', name: 'type', value: 'activity', span: 1, options: ITEM_TYPES.map((t) => ({ value: t.id, label: t.name })) })}
          ${field({ label: '内容', name: 'title', placeholder: '例如：翻越垭口 / 入住民宿', span: 2, required: true })}
          ${field({ label: '备注', name: 'note', placeholder: '可选，比如注意事项', span: 2 })}
        `),
        onSubmit: (d) => {
          if (!d.title.trim()) { toast('内容不能为空', 'error'); return false; }
          store.commit((s) => {
            const dd = s.days.find((x) => x.id === id);
            dd.items = dd.items || [];
            dd.items.push({
              id: uid('it_'), time: d.time || '', type: d.type,
              title: d.title.trim(), note: d.note || '', done: false,
            });
          }, { action: 'item.add', entity: 'day_item', id });
          toast('已添加', 'success');
        },
      });
      return;
    }

    /* ---- 编辑安排 ---- */
    if (action === 'item-edit') {
      const { item } = findItem(id);
      if (!item) return;
      openModal({
        title: '编辑安排',
        body: formGrid(`
          ${field({ label: '时间', name: 'time', type: 'time', value: item.time || '', span: 1 })}
          ${selectField({ label: '类型', name: 'type', value: item.type, span: 1, options: ITEM_TYPES.map((t) => ({ value: t.id, label: t.name })) })}
          ${field({ label: '内容', name: 'title', value: item.title, span: 2, required: true })}
          ${field({ label: '备注', name: 'note', value: item.note || '', span: 2 })}
        `),
        onSubmit: (d) => {
          if (!d.title.trim()) { toast('内容不能为空', 'error'); return false; }
          store.commit((s) => {
            for (const dd of s.days) {
              const it = (dd.items || []).find((x) => x.id === id);
              if (it) Object.assign(it, { time: d.time || '', type: d.type, title: d.title.trim(), note: d.note || '' });
            }
          }, { action: 'item.update', entity: 'day_item', id });
        },
      });
      return;
    }

    /* ---- 编辑当天（含徒步数据） ---- */
    if (action === 'day-edit') {
      const day = findDay(id);
      if (!day) return;
      const h = day.hike || {};
      openModal({
        title: '编辑当天',
        subtitle: fmtDate(day.date),
        size: 'md',
        body: formGrid(`
          ${field({ label: '当天主题', name: 'title', value: day.title || '', placeholder: '例如：老榆林村 → 下日乌且', span: 2 })}
          <div class="form-divider field--span2"><span>徒步数据</span><em>填写后自动计入难度指数</em></div>
          ${field({ label: '距离', name: 'distanceKm', type: 'number', value: h.distanceKm || '', step: '0.1', min: '0', inputmode: 'decimal', span: 1, hint: '公里' })}
          ${field({ label: '累计爬升', name: 'gainM', type: 'number', value: h.gainM || '', step: '10', min: '0', inputmode: 'numeric', span: 1, hint: '米' })}
          ${field({ label: '最高海拔', name: 'maxAlt', type: 'number', value: h.maxAlt || '', step: '10', min: '0', inputmode: 'numeric', span: 1, hint: '米' })}
          ${selectField({ label: '地形', name: 'terrain', value: h.terrain || 'trail', span: 1, options: TERRAINS.map((t) => ({ value: t.id, label: t.name })) })}
          ${textareaField({ label: '当天备注', name: 'notes', value: day.notes || '', rows: 2, hint: '水源、营地、危险点之类' })}
        `),
        onSubmit: (d) => {
          store.commit((s) => {
            const dd = s.days.find((x) => x.id === id);
            dd.title = d.title || '';
            dd.notes = d.notes || '';
            dd.hike = {
              distanceKm: Number(d.distanceKm) || 0,
              gainM: Number(d.gainM) || 0,
              maxAlt: Number(d.maxAlt) || 0,
              terrain: d.terrain || 'trail',
            };
          }, { action: 'day.update', entity: 'day', id });
        },
      });
      return;
    }
  });
}
