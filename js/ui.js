/* ============================================================
   ui.js — 图标、弹窗、表单、提示条等通用 UI 组件
   ============================================================ */

import { esc } from './util.js';

/* ==================== 图标 ==================== */

const P = {
  mountain: 'm8 3 4 8 5-5 5 15H2L8 3z',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h4a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2',
  route: 'M4 19h3a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3h3M4 19l3-3M4 19l3 3M16 5l3-3M16 5l3 3',
  backpack: 'M6 8a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM9 9h6M9 14h6M12 4V2',
  tent: 'M3 20 12 5l9 15zM9.5 20 12 14.5 14.5 20',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  shirt: 'M20.4 3.5 16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.1a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.3-2.2z',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  apple: 'M12 20.9c1.5 0 2.8 1.1 4 1.1 3 0 6-8 6-12.2A4.9 4.9 0 0 0 17 5c-2.2 0-4 1.4-5 2-1-.6-2.8-2-5-2a4.9 4.9 0 0 0-5 4.8C2 14 5 22 8 22c1.2 0 2.5-1.1 4-1.1zM10 2c1 .5 2 2 2 5',
  droplet: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z',
  battery: 'M2 8h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H2zM22 11v2',
  shield: 'M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.7 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.5 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z',
  box: 'M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7l8.7 5 8.7-5M12 22V12',
  plane: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  train: 'M6 3h12a2 2 0 0 1 2 2v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V5a2 2 0 0 1 2-2zM9 18v3M15 18v3M4 11h16M9 7h6',
  bus: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10H4zM4 11h16M4 16v3M20 16v3M8 19h.01M16 19h.01',
  boat: 'M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4zM21 14 10 2 3 14h18zM10 2v16',
  bed: 'M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
  ticket: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 11v2M13 17v2',
  utensils: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7',
  star: 'M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7a2.1 2.1 0 0 0 1.6 1.2l5.2.7a.5.5 0 0 1 .3.9l-3.8 3.6a2.1 2.1 0 0 0-.6 1.9l.9 5.1a.5.5 0 0 1-.8.6l-4.6-2.4a2.1 2.1 0 0 0-2 0L6.4 21a.5.5 0 0 1-.8-.6l.9-5.1a2.1 2.1 0 0 0-.6-1.9L2.2 9.8a.5.5 0 0 1 .3-.9l5.2-.7a2.1 2.1 0 0 0 1.6-1.2z',
  note: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v4a2 2 0 0 0 2 2h4M8 13h8M8 17h5',
  plus: 'M5 12h14M12 5v14',
  trash: 'M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2',
  edit: 'M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  check: 'M20 6 9 17l-5-5',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  chevronUp: 'm18 15-6-6-6 6',
  x: 'M18 6 6 18M6 6l12 12',
  search: 'm21 21-4.3-4.3',
  sparkles: 'M9.9 15.5A2 2 0 0 0 8.5 14.1l-6.1-1.6a.5.5 0 0 1 0-1L8.5 9.9A2 2 0 0 0 9.9 8.5l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  wallet: 'M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v0h2v4h-3a2 2 0 0 0 0 4h3v3H5a2 2 0 0 1-2-2z',
  scale: 'm16 16 3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1zM2 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1zM7 21h10M12 3v18M3 7h2M17 7h2',
  trending: 'M3 17l6-6 4 4 8-8M17 7h4v4',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  copy: 'M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2',
  menu: 'M3 6h18M3 12h18M3 18h18',
  map: 'M14.1 5.6a2 2 0 0 0 1.8 0l3.7-1.9A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.7 1.8A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0zM15 5.8v15M9 3.2v15',
  clock: 'M12 6v6l4 2',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  info: 'M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  refresh: 'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.4 2.6L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.4-2.6L3 16M3 21v-5h5',
  circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  dot: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4',
  database: 'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3zM3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3',
};

export function icon(name, size = 16, extra = '') {
  const d = P[name] || P.circle;
  return `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

/* ==================== 提示条 ==================== */

let toastTimer = null;
export function toast(message, type = 'info') {
  let box = document.querySelector('.toast-stack');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toast-stack';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info', 15)}<span>${esc(message)}</span>`;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  clearTimeout(toastTimer);
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

/* ==================== 弹窗 ==================== */

let modalStack = 0;

/**
 * openModal({ title, subtitle, body, size, submitText, cancelText, onSubmit, onMount, hideFooter })
 * onSubmit(formData, formEl) —— 返回 false 可阻止关闭
 */
export function openModal(opts = {}) {
  const {
    title = '', subtitle = '', body = '', size = 'md',
    submitText = '保存', cancelText = '取消',
    onSubmit = null, onMount = null, hideFooter = false, danger = false, onClose = null,
  } = opts;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  modalStack += 1;

  backdrop.innerHTML = `
    <div class="modal modal--${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <form class="modal__form" novalidate>
        <header class="modal__head">
          <div>
            <h2 class="modal__title">${esc(title)}</h2>
            ${subtitle ? `<p class="modal__sub">${esc(subtitle)}</p>` : ''}
          </div>
          <button type="button" class="icon-btn" data-close aria-label="关闭">${icon('x', 18)}</button>
        </header>
        <div class="modal__body">${body}</div>
        ${hideFooter ? '' : `
          <footer class="modal__foot">
            <button type="button" class="btn btn--ghost" data-close>${onSubmit ? esc(cancelText) : '关闭'}</button>
            ${onSubmit ? `<button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(submitText)}</button>` : ''}
          </footer>`}
      </form>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.classList.add('is-modal');
  requestAnimationFrame(() => backdrop.classList.add('is-in'));

  const form = backdrop.querySelector('form');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('is-in');
    modalStack = Math.max(0, modalStack - 1);
    if (!modalStack) document.body.classList.remove('is-modal');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => backdrop.remove(), 200);
    if (onClose) {
      try { onClose(); } catch (e) { console.error(e); }
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  document.addEventListener('keydown', onKey);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
    if (e.target.closest('[data-close]')) close();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const fd = new FormData(form);
    const data = {};
    // 支持同名多值（例如「谁一起分摊」的多个勾选）
    for (const key of new Set(fd.keys())) {
      const all = fd.getAll(key);
      data[key] = all.length > 1 ? all : all[0];
    }
    const result = onSubmit(data, form);
    if (result !== false) close();
  });

  // 自动聚焦第一个输入
  setTimeout(() => {
    const first = backdrop.querySelector('input:not([type=hidden]), textarea, select');
    if (first) first.focus();
  }, 60);

  if (onMount) onMount(backdrop, form, close);

  return { close, el: backdrop, form };
}

export function confirmDialog({ title = '确认操作', message = '', confirmText = '删除', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      size: 'sm',
      body: `<p class="modal__text">${esc(message)}</p>`,
      submitText: confirmText,
      danger,
      onSubmit: () => {
        answered = true;
        resolve(true);
      },
      // 关闭但没有确认（点叉、点遮罩、按 Esc）→ 视为取消
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
  });
}

/* ==================== 表单片段 ==================== */

export function field({ label, name, type = 'text', value = '', placeholder = '', hint = '', step = '', min = '', required = false, span = 1, inputmode = '', autofocus = false, max = '', attrs = '' }) {
  return `
    <label class="field field--span${span}">
      <span class="field__label">${esc(label)}${required ? ' <em>*</em>' : ''}</span>
      <input class="input" type="${type}" name="${esc(name)}" value="${esc(value)}"
        ${placeholder ? `placeholder="${esc(placeholder)}"` : ''}
        ${step ? `step="${esc(step)}"` : ''} ${min !== '' ? `min="${esc(min)}"` : ''}
        ${max !== '' ? `max="${esc(max)}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''}
        ${required ? 'required' : ''} ${autofocus ? 'autofocus' : ''} ${attrs} />
      ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
    </label>`;
}

export function textareaField({ label, name, value = '', placeholder = '', rows = 3, span = 2, hint = '' }) {
  return `
    <label class="field field--span${span}">
      <span class="field__label">${esc(label)}</span>
      <textarea class="input input--area" name="${esc(name)}" rows="${rows}"
        ${placeholder ? `placeholder="${esc(placeholder)}"` : ''}>${esc(value)}</textarea>
      ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
    </label>`;
}

export function selectField({ label, name, options = [], value = '', span = 1, hint = '' }) {
  const opts = options.map((o) => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`;
  }).join('');
  return `
    <label class="field field--span${span}">
      <span class="field__label">${esc(label)}</span>
      <select class="input input--select" name="${esc(name)}">${opts}</select>
      ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
    </label>`;
}

export function checkboxField({ label, name, checked = false, hint = '', span = 2 }) {
  return `
    <label class="check field--span${span}">
      <input type="checkbox" name="${esc(name)}" value="1" ${checked ? 'checked' : ''} />
      <span class="check__box">${icon('check', 12)}</span>
      <span class="check__label">${esc(label)}${hint ? `<span class="check__hint">${esc(hint)}</span>` : ''}</span>
    </label>`;
}

export function formGrid(inner) {
  return `<div class="form-grid">${inner}</div>`;
}

/* ==================== 小组件 ==================== */

export function badge(text, color = 'var(--text-2)', soft = true) {
  return soft
    ? `<span class="badge" style="--badge-color:${color}">${esc(text)}</span>`
    : `<span class="badge badge--solid" style="--badge-color:${color}">${esc(text)}</span>`;
}

export function progress(pct, color = 'var(--accent)', height = 6) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="progress" style="height:${height}px"><span style="width:${w}%;background:${color}"></span></div>`;
}

export function emptyState({ iconName = 'box', title = '还没有内容', desc = '', action = '' }) {
  return `
    <div class="empty">
      <div class="empty__icon">${icon(iconName, 22)}</div>
      <h3 class="empty__title">${esc(title)}</h3>
      ${desc ? `<p class="empty__desc">${esc(desc)}</p>` : ''}
      ${action ? `<div class="empty__action">${action}</div>` : ''}
    </div>`;
}

/** 一个小统计块 */
export function stat({ label, value, unit = '', hint = '', color = '', iconName = '' }) {
  return `
    <div class="stat" ${color ? `style="--stat-color:${color}"` : ''}>
      <div class="stat__label">${iconName ? icon(iconName, 13) : ''}<span>${esc(label)}</span></div>
      <div class="stat__value">${value}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
      ${hint ? `<div class="stat__hint">${esc(hint)}</div>` : ''}
    </div>`;
}
