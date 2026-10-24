/* ============================================================
   views/gear.js — 装备清单与背包重量
   核心：按 base / consumable / worn 三段拆分，给出行业档位判断
   ============================================================ */

import {
  esc, fmtWeight, fmtKg, uid, fmtNum,
} from '../util.js';
import {
  GEAR_CATEGORIES, catOf, computeWeights, baseWeightGrade, gearUnitWeight,
  weightsByOwner, memberById, memberInitial,
} from '../calc.js';
import { openMembersModal } from '../members.js';
import {
  icon, badge, openModal, confirmDialog, toast,
  field, selectField, checkboxField, formGrid, textareaField, emptyState, progress,
} from '../ui.js';

export function render(ctx) {
  const { trip, store } = ctx;
  const gear = store.gearOf(trip.id);
  const w = computeWeights(gear);
  const grade = baseWeightGrade(w.base);
  const packed = gear.filter((g) => g.packed).length;
  const members = trip.members || [];
  const team = members.length >= 2;

  const head = summaryCard(w, grade, packed, gear.length, gear, trip, team);

  const toolbar = `
    <div class="bar">
      <div class="bar__facts">
        <span class="muted">按类别分组 · 同类内按重量排序</span>
      </div>
      <div class="bar__actions">
        <button class="btn btn--ghost btn--sm" data-action="members">${icon('shirt', 13)}${team ? `${members.length} 人同行` : '设置成员'}</button>
        <button class="btn btn--ghost btn--sm" data-action="copy-trip">${icon('copy', 13)}从其他行程复制</button>
        <button class="btn btn--ghost btn--sm" data-action="pack-all">${icon('check', 13)}全部打包</button>
        <button class="btn btn--primary btn--sm" data-action="add">${icon('plus', 13)}添加装备</button>
      </div>
    </div>`;

  if (!gear.length) {
    return head + toolbar + emptyState({
      iconName: 'backpack',
      title: '装备清单是空的',
      desc: '把每件装备和它的重量记下来，就能立刻看到基础重量属于超轻量还是重装，以及这份重量如何影响行程难度。',
      action: `<button class="btn btn--primary" data-action="add">${icon('plus', 14)}添加第一件装备</button>`,
    });
  }

  // 按类别分组
  const groups = GEAR_CATEGORIES
    .map((cat) => ({
      cat,
      items: gear
        .filter((g) => g.category === cat.id)
        .sort((a, b) => gearUnitWeight(b) - gearUnitWeight(a)),
    }))
    .filter((g) => g.items.length);

  const sections = groups.map(({ cat, items }) => {
    const total = items.reduce((s, i) => s + gearUnitWeight(i), 0);
    return `
      <section class="geargroup">
        <header class="geargroup__head">
          <span class="geargroup__name" style="color:${cat.color}">${icon(cat.icon, 14)}${esc(cat.name)}</span>
          <span class="geargroup__meta">${items.length} 件 · <b>${fmtWeight(total)}</b></span>
        </header>
        <ul class="gearitems">
          ${items.map((it) => gearRow(it, team ? memberById(trip, it.ownerId) : null, team)).join('')}
        </ul>
      </section>`;
  }).join('');

  return head + toolbar + `<div class="gearlist">${sections}</div>` + librarySection(store, trip);
}

/* ---------------- 汇总卡 ---------------- */

function summaryCard(w, grade, packed, total, gear, trip, team) {
  const totalForBar = w.skinOut || 1;
  const segs = [
    { key: 'base', name: '基础', g: w.base, color: 'var(--accent)' },
    { key: 'consumable', name: '消耗品', g: w.consumable, color: '#9a7c3f' },
    { key: 'worn', name: '穿戴', g: w.worn, color: '#5b6f8a' },
  ];

  return `
    <section class="card card--weight">
      <div class="wgrid">
        <div class="wgrid__main">
          <div class="wnum">
            <span class="wnum__label">背上肩的重量</span>
            <span class="wnum__value">${fmtKg(w.pack, 2)}</span>
            <span class="wnum__sub">= 基础 ${fmtKg(w.base, 2)} + 消耗品 ${fmtKg(w.consumable, 2)}</span>
          </div>
          <div class="segbar segbar--lg">
            ${segs.filter((s) => s.g > 0).map((s) =>
              `<span style="width:${(s.g / totalForBar) * 100}%;background:${s.color}" title="${esc(s.name)} ${fmtWeight(s.g)}"></span>`).join('')}
          </div>
          <div class="seglegend">
            ${segs.map((s) => `<span class="seglegend__item"><i style="background:${s.color}"></i>${esc(s.name)} <b>${fmtWeight(s.g)}</b></span>`).join('')}
          </div>
        </div>

        <div class="wgrid__side">
          <div class="gradebox" style="--g:${grade.color}">
            <span class="gradebox__label">基础重量档位</span>
            <span class="gradebox__value">${esc(grade.label)}</span>
            <span class="gradebox__en">${esc(grade.en)} · ${esc(grade.range)}</span>
          </div>
          ${weightScale(w.base)}
          <div class="wstats">
            <div><span>Skin-out 总重</span><b>${fmtKg(w.skinOut, 2)}</b></div>
            <div><span>已打包</span><b>${packed}/${total}</b></div>
          </div>
          ${progress(total ? (packed / total) * 100 : 0, '#5b6f8a', 4)}
        </div>
      </div>
      ${team ? teamBlock(gear, trip) : ''}

      <p class="card__fineprint">
        基础重量取国际通行的背包客口径：<b>不含</b>身上穿戴的衣物与手持装备，也<b>不含</b>食物、水、燃料等消耗品。
        后者单独记为消耗品，因为它们在行程中会不断减少。
      </p>
    </section>`;
}

/** 多人时按「谁背」拆分重量 */
function teamBlock(gear, trip) {
  const members = trip.members || [];
  const { perMember, pool } = weightsByOwner(gear, members);
  const max = Math.max(...perMember.map((m) => m.weight), pool.weight, 1);

  return `
    <div class="teamblock">
      <div class="teamblock__head">
        <span class="teamblock__title">${icon('shirt', 13)}每人背负</span>
        <button class="link-btn" data-action="members">管理成员${icon('chevronRight', 12)}</button>
      </div>
      ${perMember.map((m) => `
        <div class="pprow">
          <span class="pprow__who">
            <i class="avatar" style="background:${esc(m.color || '#9b9a97')}">${esc(memberInitial(m.name))}</i>
            <b>${esc(m.name)}</b>${m.role ? `<em>${esc(m.role)}</em>` : ''}
          </span>
          <span class="pprow__bar"><i style="width:${(m.weight / max) * 100}%;background:${esc(m.color || '#9b9a97')}"></i></span>
          <span class="pprow__val">${fmtWeight(m.weight)}</span>
          <span class="pprow__count">${m.count} 件</span>
        </div>`).join('')}
      ${pool.weight ? `
        <div class="pprow pprow--pool">
          <span class="pprow__who"><i class="avatar" style="background:#9b9a97">公</i><b>公共 / 未分配</b></span>
          <span class="pprow__bar"><i style="width:${(pool.weight / max) * 100}%;background:#9b9a97"></i></span>
          <span class="pprow__val">${fmtWeight(pool.weight)}</span>
          <span class="pprow__count">${pool.count} 件</span>
        </div>
        <p class="pprow__hint">有 ${fmtWeight(pool.weight)} 还没指定谁背，点装备右侧的编辑按钮可以分配。</p>` : ''}
    </div>`;
}

/** 0–18kg 的横向刻度，标出超轻 / 轻量 / 传统 / 重装四个区间 */
function weightScale(baseG) {
  const kg = Math.min(18, baseG / 1000);
  const pct = (kg / 18) * 100;
  return `
    <div class="wscale">
      <div class="wscale__track">
        <span class="wscale__zone" style="left:0;width:25%;background:#2f6b52"></span>
        <span class="wscale__zone" style="left:25%;width:25%;background:#4a7b8a"></span>
        <span class="wscale__zone" style="left:50%;width:25.5%;background:#9a7c3f"></span>
        <span class="wscale__zone" style="left:75.5%;width:24.5%;background:#a05f5f"></span>
        <i class="wscale__needle" style="left:${pct}%"></i>
      </div>
      <div class="wscale__ticks">
        <span style="left:0">0</span>
        <span style="left:25%">4.5</span>
        <span style="left:50%">9</span>
        <span style="left:75.5%">13.6</span>
        <span style="left:100%">18kg</span>
      </div>
    </div>`;
}

/* ---------------- 单件装备 ---------------- */

function gearRow(it, owner, team) {
  const cat = catOf(it.category);
  const unit = Number(it.weightG) || 0;
  const qty = Number(it.qty) || 1;
  const total = unit * qty;

  const tags = [];
  if (it.worn) tags.push('<span class="gtag gtag--worn">穿戴</span>');
  if (it.consumable) tags.push('<span class="gtag gtag--cons">消耗</span>');

  return `
    <li class="gearitem ${it.packed ? 'is-packed' : ''}">
      <button class="gearitem__check" data-action="toggle-pack" data-id="${esc(it.id)}" title="${it.packed ? '标记未打包' : '标记已打包'}">
        ${it.packed ? icon('check', 11) : ''}
      </button>
      <span class="gearitem__body">
        <span class="gearitem__name">${esc(it.name)}${tags.join('')}</span>
        ${it.note ? `<span class="gearitem__note">${esc(it.note)}</span>` : ''}
      </span>
      ${team ? `<span class="gearitem__owner" title="${owner ? '背着：' + esc(owner.name) : '公共 / 未分配'}">
        ${owner ? `<i class="avatar avatar--xs" style="background:${esc(owner.color || '#9b9a97')}">${esc(memberInitial(owner.name))}</i>` : '<span class="gearitem__pool">公共</span>'}
      </span>` : ''}
      <span class="gearitem__qty">${qty > 1 ? `×${qty}` : ''}</span>
      <span class="gearitem__weight">${fmtWeight(total)}</span>
      <span class="gearitem__tools">
        <button class="icon-btn icon-btn--sm" data-action="lib-save" data-id="${esc(it.id)}" title="存入常用库">${icon('star', 13)}</button>
        <button class="icon-btn icon-btn--sm" data-action="edit" data-id="${esc(it.id)}" title="编辑">${icon('edit', 14)}</button>
        <button class="icon-btn icon-btn--sm" data-action="del" data-id="${esc(it.id)}" title="删除">${icon('trash', 14)}</button>
      </span>
    </li>`;
}

/* ---------------- 常用装备库 ---------------- */

function librarySection(store, trip) {
  const lib = store.data.library || [];
  if (!lib.length) return '';
  return `
    <details class="lib">
      <summary class="lib__summary">
        ${icon('star', 14)}<span>常用装备库</span><em>${lib.length} 件</em>
        ${icon('chevronDown', 14)}
      </summary>
      <div class="lib__chips">
        ${lib.map((l) => `
          <button class="libchip" data-action="lib-add" data-id="${esc(l.id)}" title="加入本行程">
            ${icon('plus', 11)}<span>${esc(l.name)}</span><em>${fmtWeight(l.weightG)}</em>
          </button>`).join('')}
      </div>
      <p class="lib__hint">点一下即可加入当前行程。装备编辑页可以勾选「存入常用库」，下次出行直接取用。</p>
    </details>`;
}

/* ==================== 表单 ==================== */

function openGearForm(ctx, preset = {}) {
  const { store, trip, rerender } = ctx;
  const editing = !!preset.id;
  const members = trip.members || [];
  const team = members.length >= 2;

  openModal({
    title: editing ? '编辑装备' : '添加装备',
    size: 'md',
    body: formGrid(`
      ${field({ label: '名称', name: 'name', span: 2, value: preset.name || '', placeholder: '例如：黑冰 B700 睡袋', required: true })}
      ${selectField({ label: '类别', name: 'category', span: 1, value: preset.category || 'misc', options: GEAR_CATEGORIES.map((c) => ({ value: c.id, label: c.name })) })}
      ${field({ label: '单件重量', name: 'weightG', type: 'number', span: 1, value: preset.weightG ?? '', min: '0', step: '1', inputmode: 'numeric', placeholder: '克', hint: '填克数，例如 1100', required: true })}
      ${field({ label: '数量', name: 'qty', type: 'number', span: 1, value: preset.qty ?? 1, min: '1', step: '1', inputmode: 'numeric' })}
      ${team ? selectField({
        label: '谁背', name: 'ownerId', span: 1,
        value: preset.ownerId || '',
        options: [
          { value: '', label: '公共 / 未分配' },
          ...members.map((m) => ({ value: m.id, label: m.role ? `${m.name} · ${m.role}` : m.name })),
        ],
        hint: '帮大家背的公共装备，也算在这个人头上',
      }) : ''}
      <div class="field field--span${team ? 2 : 1}">
        <span class="field__label">&nbsp;</span>
        <div class="live-weight" data-live-weight>—</div>
      </div>
      <div class="form-divider field--span2"><span>归类</span><em>影响重量档位的计算方式</em></div>
      ${checkboxField({ label: '穿戴在身上的', name: 'worn', checked: !!preset.worn, hint: '衣物、鞋、登山杖——不计入背负重量' })}
      ${checkboxField({ label: '消耗品', name: 'consumable', checked: !!preset.consumable, hint: '食物、水、气罐——会随行程减少' })}
      ${field({ label: '备注', name: 'note', span: 2, value: preset.note || '', placeholder: '型号、购入年份、是否可借…' })}
      ${editing ? '' : checkboxField({ label: '同时存入常用装备库', name: 'toLibrary', checked: true, hint: '下次出行一键添加' })}
    `),
    onMount: (backdrop) => {
      const weightInput = backdrop.querySelector('[name=weightG]');
      const qtyInput = backdrop.querySelector('[name=qty]');
      const live = backdrop.querySelector('[data-live-weight]');
      const update = () => {
        const unit = Number(weightInput.value) || 0;
        const qty = Number(qtyInput.value) || 1;
        const total = unit * qty;
        live.innerHTML = total ? `合计 <b>${fmtWeight(total)}</b>${qty > 1 ? `<em>${fmtWeight(unit)} × ${qty}</em>` : ''}` : '—';
      };
      weightInput.addEventListener('input', update);
      qtyInput.addEventListener('input', update);
      update();
    },
    onSubmit: (d) => {
      if (!d.name.trim()) { toast('名称不能为空', 'error'); return false; }
      const weightG = Number(d.weightG);
      if (!weightG || weightG <= 0) { toast('请填写重量（克）', 'error'); return false; }

      const payload = {
        name: d.name.trim(),
        category: d.category,
        weightG,
        qty: Math.max(1, Number(d.qty) || 1),
        worn: !!d.worn,
        consumable: !!d.consumable,
        note: d.note || '',
        // 单人行程不显示归属，保持原值即可
        ownerId: team ? (d.ownerId || null) : (preset.ownerId ?? null),
      };

      store.commit((s) => {
        if (editing) {
          const g = s.gear.find((x) => x.id === preset.id);
          Object.assign(g, payload);
        } else {
          s.gear.push({ id: uid('gear_'), tripId: trip.id, ...payload, packed: false });
          if (d.toLibrary) {
            s.library.push({ id: uid('lib_'), name: payload.name, category: payload.category, weightG: payload.weightG });
          }
        }
      }, { action: editing ? 'gear.update' : 'gear.add', entity: 'gear', id: preset.id });

      toast(editing ? '已保存' : '已添加', 'success');
      rerender();
    },
  });
}

/* ==================== 交互 ==================== */

export function mount(root, ctx) {
  const { store, trip, rerender } = ctx;
  const find = (id) => store.gearOf(trip.id).find((g) => g.id === id);

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    if (action === 'members') return openMembersModal(ctx);
    if (action === 'add') return openGearForm(ctx, {});

    if (action === 'toggle-pack') {
      store.commit((s) => {
        const g = s.gear.find((x) => x.id === id);
        if (g) g.packed = !g.packed;
      }, { action: 'gear.pack', entity: 'gear', id });
      rerender();
      return;
    }

    if (action === 'pack-all') {
      const allPacked = store.gearOf(trip.id).every((g) => g.packed);
      store.commit((s) => {
        s.gear.filter((g) => g.tripId === trip.id).forEach((g) => { g.packed = !allPacked; });
      }, { action: 'gear.packAll', entity: 'gear', id: trip.id });
      rerender();
      return;
    }

    if (action === 'edit') {
      const g = find(id);
      if (g) openGearForm(ctx, g);
      return;
    }

    if (action === 'del') {
      const ok = await confirmDialog({ message: '从清单里删除这件装备？' });
      if (!ok) return;
      store.commit((s) => { s.gear = s.gear.filter((g) => g.id !== id); },
        { action: 'gear.delete', entity: 'gear', id });
      rerender();
      return;
    }

    if (action === 'lib-save') {
      const g = find(id);
      if (!g) return;
      store.commit((s) => {
        if (!s.library.some((l) => l.name === g.name)) {
          s.library.push({ id: uid('lib_'), name: g.name, category: g.category, weightG: g.weightG });
        }
      }, { action: 'library.add', entity: 'library', id });
      toast('已存入常用装备库', 'success');
      rerender();
      return;
    }

    if (action === 'lib-add') {
      const lib = (store.data.library || []).find((l) => l.id === id);
      if (!lib) return;
      store.commit((s) => {
        s.gear.push({
          id: uid('gear_'), tripId: trip.id, name: lib.name, category: lib.category,
          weightG: lib.weightG, qty: 1, worn: false, consumable: false, packed: false, note: '',
        });
      }, { action: 'gear.add', entity: 'gear', id });
      toast(`已加入「${lib.name}」`, 'success');
      rerender();
      return;
    }

    if (action === 'copy-trip') {
      const others = store.trips.filter((t) => t.id !== trip.id && store.gearOf(t.id).length);
      if (!others.length) { toast('其他行程里还没有装备', 'error'); return; }
      openModal({
        title: '从其他行程复制装备',
        subtitle: '适合重复使用的固定装备',
        size: 'sm',
        body: formGrid(selectField({
          label: '选择行程', name: 'from', span: 2,
          options: others.map((t) => ({
            value: t.id,
            label: `${t.name}（${store.gearOf(t.id).length} 件 / ${fmtKg(computeWeights(store.gearOf(t.id)).base, 1)} 基础）`,
          })),
        })),
        submitText: '复制',
        onSubmit: (d) => {
          const src = store.gearOf(d.from);
          const valid = new Set((trip.members || []).map((m) => m.id));
          store.commit((s) => {
            for (const g of src) {
              s.gear.push({
                id: uid('gear_'), tripId: trip.id, name: g.name, category: g.category,
                weightG: g.weightG, qty: g.qty, worn: g.worn, consumable: g.consumable,
                ownerId: valid.has(g.ownerId) ? g.ownerId : null,
                packed: false, note: g.note || '',
              });
            }
          }, { action: 'gear.copy', entity: 'gear', id: trip.id });
          toast(`已复制 ${src.length} 件装备`, 'success');
          rerender();
        },
      });
    }
  });
}
