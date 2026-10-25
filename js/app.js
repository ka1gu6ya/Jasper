/* ============================================================
   app.js — 外壳：路由、侧边栏、标签页、数据管理、PWA
   ============================================================ */

import { esc, fmtDateRange, fmtKg, uid, todayStr, addDays, download, slug, relTime } from './util.js';
import { computeWeights, TRIP_TYPES } from './calc.js';
import { store, CURRENCIES } from './store.js';
import {
  icon, toast, openModal, confirmDialog,
  field, selectField, textareaField, formGrid, emptyState,
} from './ui.js';
import { parseSharedToken } from './sync.js';
import { startAutoSync, status as autoStatus, syncNow } from './autosync.js';
import { isSyncConfigured } from './config.js';
import { startVaultSync, status as vaultStatus } from './vault.js';
import { openSyncPanel } from './syncui.js';
import { openShareModal } from './share.js';
import { renderShared } from './views/shared.js';

import * as overview from './views/overview.js';
import * as itinerary from './views/itinerary.js';
import * as bookings from './views/bookings.js';
import * as gear from './views/gear.js';
import * as expenses from './views/expenses.js';

const VIEWS = {
  overview: { mod: overview, name: '概览', icon: 'map' },
  itinerary: { mod: itinerary, name: '行程', icon: 'calendar' },
  bookings: { mod: bookings, name: '预定', icon: 'ticket' },
  gear: { mod: gear, name: '装备', icon: 'backpack' },
  expenses: { mod: expenses, name: '花销', icon: 'wallet' },
};

const TABS = Object.keys(VIEWS);
const BUILD = 'v12';   // 每次部署 +1，方便确认手机上是哪一版

/* ==================== 主题 ==================== */

/** 默认浅色（白底黑字）。不再跟随系统深色——很多人系统是深色，但看这种表格类界面还是白底更清楚。 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  // 同步移动端状态栏颜色
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#191918' : '#ffffff');
}

function initTheme() {
  const saved = localStorage.getItem('trailnote.theme');
  applyTheme(saved === 'dark' ? 'dark' : 'light');
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('trailnote.theme', next);
}

/* ==================== 路由 ==================== */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] === 't' && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    const tab = TABS.includes(parts[2]) ? parts[2] : 'overview';
    return { tripId: id, tab };
  }
  return { tripId: null, tab: 'overview' };
}

function navigate(tripId, tab = 'overview') {
  location.hash = `#/t/${encodeURIComponent(tripId)}/${tab}`;
}

function currentTrip() {
  const { tripId } = parseRoute();
  if (tripId) {
    const t = store.trip(tripId);
    if (t) return t;
  }
  return store.trips[0] || null;
}

/* ==================== 渲染入口 ==================== */

function render() {
  const app = document.getElementById('app');

  // 只读分享页：完全独立的一屏，不连本地行程
  const sharedToken = parseSharedToken(location.hash);
  if (sharedToken) {
    renderShared(app, sharedToken);
    return;
  }
  app.className = '';

  const scrollY = window.scrollY;
  const trip = currentTrip();
  const { tab } = parseRoute();

  app.innerHTML = `
    ${sidebarHTML(trip)}
    <main class="main">
      ${trip ? topbarHTML(trip, tab) : ''}
      <div id="view" class="view"></div>
    </main>
    <div class="sidebar-scrim" data-action="close-sidebar"></div>
  `;

  const viewEl = document.getElementById('view');
  if (!trip) {
    viewEl.innerHTML = welcomeHTML();
    return;
  }

  const ctx = {
    trip,
    store,
    state: store.data,
    go: (t) => navigate(trip.id, t),
    rerender: render,
    refresh: render,
    openTrip: (id, t) => navigate(id, t),
  };

  const view = VIEWS[tab] || VIEWS.overview;
  try {
    viewEl.innerHTML = view.mod.render(ctx);
    view.mod.mount(viewEl, ctx);
  } catch (err) {
    console.error('渲染视图失败', err);
    viewEl.innerHTML = `<div class="errbox">${icon('alert', 20)}<div><b>这个视图渲染出错了</b><p>${esc(err.message)}</p></div></div>`;
  }

  window.scrollTo(0, scrollY);
}

/* ==================== 侧边栏 ==================== */

function sidebarHTML(activeTrip) {
  const trips = store.trips;
  const items = trips.map((t) => {
    const type = TRIP_TYPES.find((x) => x.id === t.type) || TRIP_TYPES[0];
    const w = computeWeights(store.gearOf(t.id));
    const isActive = activeTrip && activeTrip.id === t.id;
    return `
      <a class="triplink ${isActive ? 'is-active' : ''}" href="#/t/${encodeURIComponent(t.id)}/overview">
        <span class="triplink__dot" style="background:${typeColor(t.type)}"></span>
        <span class="triplink__body">
          <span class="triplink__name">${esc(t.name || '未命名行程')}</span>
          <span class="triplink__meta">${esc(fmtDateRange(t.startDate, t.endDate))}${w.pack ? ' · ' + fmtKg(w.pack, 1) : ''}</span>
        </span>
      </a>`;
  }).join('');

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar__head">
        <a class="brand" href="#">
          <span class="brand__mark">${icon('mountain', 18)}</span>
          <span class="brand__text">TrailNote</span>
        </a>
        <button class="icon-btn sidebar__close" data-action="close-sidebar" aria-label="收起">${icon('x', 18)}</button>
      </div>

      <button class="newtrip" data-action="new-trip">${icon('plus', 15)}<span>新建行程</span></button>

      <nav class="triplist" aria-label="行程列表">
        ${trips.length ? items : '<p class="triplist__empty">还没有行程</p>'}
      </nav>

      <div class="sidebar__foot">
        <button class="footrow" data-action="sync-info">
          ${icon('database', 14)}
          <span class="footrow__text">${syncLabel()}</span>
          <span class="sync-dot" data-sync="${autoStatus().pending ? 'syncing' : 'idle'}"></span>
        </button>
        ${activeTrip ? `<button class="footrow" data-action="share-trip">${icon('share', 14)}<span class="footrow__text">分享行程（只读）</span></button>` : ''}
        ${activeTrip ? `<button class="footrow" data-action="edit-trip">${icon('edit', 14)}<span class="footrow__text">编辑行程信息</span></button>` : ''}
        <button class="footrow" data-action="sync-panel">
          ${icon('refresh', 14)}
          <span class="footrow__text">${vaultLabel()}</span>
          ${vaultStatus().enabled ? `<span class="sync-dot" data-sync="${vaultStatus().syncing ? 'syncing' : 'idle'}"></span>` : ''}
        </button>
        <button class="footrow" data-action="data-menu">${icon('sliders', 14)}<span class="footrow__text">数据与设置</span></button>
        <button class="footrow" data-action="toggle-theme">${icon('moon', 14)}<span class="footrow__text">切换深色 / 浅色</span></button>
        <div class="sidebar__hint">本地优先 · 数据存在这台设备上</div>
      </div>
    </aside>`;
}

function typeColor(type) {
  return type === 'hiking' ? '#2f6b52' : type === 'city' ? '#5b6f8a' : '#8a6f4e';
}

function vaultLabel() {
  const st = vaultStatus();
  if (!st.enabled) return '开启多设备同步';
  if (st.syncing) return '同步中…';
  if (st.lastError) return '同步失败';
  if (st.pending) return '有改动待同步';
  return st.lastSyncedAt ? `已同步 · ${relTime(st.lastSyncedAt)}` : '已开启同步';
}

function syncLabel() {
  const shared = store.data.trips.filter((t) => t.share).length;
  const pending = autoStatus().pending;
  if (pending) return `有 ${pending} 处改动待上传`;
  if (shared) return `本机存储 · ${shared} 个分享`;
  return '数据存在本机';
}

/* ==================== 顶部标签栏 ==================== */

function topbarHTML(trip, tab) {
  const tabs = TABS.map((k) => {
    const v = VIEWS[k];
    return `
      <button class="tab ${tab === k ? 'is-active' : ''}" data-action="go" data-tab="${k}">
        ${icon(v.icon, 14)}<span>${v.name}</span>
      </button>`;
  }).join('');

  return `
    <header class="topbar">
      <button class="icon-btn topbar__menu" data-action="open-sidebar" aria-label="行程列表">${icon('menu', 18)}</button>
      <nav class="tabs">${tabs}</nav>
      <div class="topbar__actions">
        <button class="btn btn--sm btn--share" data-action="share-trip">
          ${icon('share', 14)}<span>分享</span>
        </button>
        <button class="icon-btn" data-action="edit-trip" title="编辑行程信息">${icon('edit', 16)}</button>
        <button class="icon-btn" data-action="export-json" title="导出备份">${icon('download', 16)}</button>
      </div>
    </header>`;
}

/* ==================== 欢迎页 ==================== */

function welcomeHTML() {
  return `
    <div class="welcome">
      <div class="welcome__mark">${icon('mountain', 34)}</div>
      <h1 class="welcome__title">从第一趟行程开始</h1>
      <p class="welcome__sub">
        一个放在手机里的旅行工作台：行程、预定、装备重量、花销，全在一处。
        数据存在本机，山里没信号也能用。
      </p>
      <button class="btn btn--primary btn--lg" data-action="new-trip">${icon('plus', 16)}新建行程</button>

      <div class="welcome__grid">
        <div class="wcard">${icon('calendar', 18)}<b>逐日行程</b><span>每天的时间线与徒步数据</span></div>
        <div class="wcard">${icon('ticket', 18)}<b>预定聚合</b><span>航班住宿许可，一键导出日历</span></div>
        <div class="wcard">${icon('backpack', 18)}<b>装备重量</b><span>基础 / 消耗 / 穿戴三段拆分</span></div>
        <div class="wcard">${icon('wallet', 18)}<b>花销记账</b><span>多币种，预算实时对照</span></div>
      </div>
    </div>`;
}

/* ==================== 行程表单 ==================== */

function openTripForm(existing) {
  const editing = !!existing;
  const t = existing || {
    name: '', destination: '', type: 'hiking',
    startDate: todayStr(), endDate: addDays(todayStr(), 4),
    budget: '', notes: '',
  };

  openModal({
    title: editing ? '编辑行程' : '新建行程',
    size: 'md',
    body: formGrid(`
      ${field({ label: '行程名称', name: 'name', span: 2, value: t.name, placeholder: '例如：贡嘎西南坡穿越', required: true })}
      ${field({ label: '目的地', name: 'destination', span: 1, value: t.destination, placeholder: '四川 · 康定' })}
      ${selectField({ label: '类型', name: 'type', span: 1, value: t.type, options: TRIP_TYPES.map((x) => ({ value: x.id, label: x.name })) })}
      ${field({ label: '开始日期', name: 'startDate', type: 'date', span: 1, value: t.startDate })}
      ${field({ label: '结束日期', name: 'endDate', type: 'date', span: 1, value: t.endDate })}
      ${field({ label: '预算', name: 'budget', type: 'number', step: '100', min: '0', span: 1, value: t.budget || '', placeholder: '可选', hint: `以 ${store.data.settings.baseCurrency} 计` })}
      ${textareaField({ label: '备注', name: 'notes', value: t.notes || '', rows: 2, span: 2, placeholder: '路线要点、注意事项…' })}
    `),
    onMount: (backdrop) => {
      // 结束日期不能早于开始日期
      const start = backdrop.querySelector('[name=startDate]');
      const end = backdrop.querySelector('[name=endDate]');
      start.addEventListener('change', () => {
        if (end.value && end.value < start.value) end.value = start.value;
        end.min = start.value;
      });
      end.min = start.value;
    },
    onSubmit: (d) => {
      if (!d.name.trim()) { toast('给行程起个名字', 'error'); return false; }
      if (d.endDate && d.startDate && d.endDate < d.startDate) {
        toast('结束日期不能早于开始', 'error');
        return false;
      }
      const payload = {
        name: d.name.trim(),
        destination: d.destination || '',
        type: d.type,
        startDate: d.startDate,
        endDate: d.endDate || d.startDate,
        budget: d.budget === '' ? 0 : Number(d.budget),
        notes: d.notes || '',
      };

      let newId = null;
      store.commit((s) => {
        if (editing) {
          const trip = s.trips.find((x) => x.id === existing.id);
          Object.assign(trip, payload, { updatedAt: new Date().toISOString() });
        } else {
          newId = uid('trip_');
          s.trips.push({
            id: newId, ...payload,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          });
        }
      }, { action: editing ? 'trip.update' : 'trip.add', entity: 'trip', id: editing ? existing.id : null });

      const id = editing ? existing.id : newId;
      store.ensureDays(id);
      toast(editing ? '已保存' : '行程已创建', 'success');
      if (newId) navigate(newId, 'itinerary');
      else render();
    },
  });
}

/* ==================== 数据管理 ==================== */

function openDataMenu() {
  const data = store.data;
  const size = new Blob([JSON.stringify(data)]).size;
  const kb = (size / 1024).toFixed(1);

  const m = openModal({
    title: '数据与设置',
    subtitle: '备份、恢复、清空',
    size: 'md',
    hideFooter: true,
    body: `
      <div class="datastats">
        <div><b>${data.trips.length}</b><span>行程</span></div>
        <div><b>${data.gear.length}</b><span>装备</span></div>
        <div><b>${data.expenses.length}</b><span>账目</span></div>
        <div><b>${data.bookings.length}</b><span>预定</span></div>
        <div><b>${kb} KB</b><span>占用</span></div>
      </div>

      <div class="menu-list">
        <button class="menu-item" data-action="export-json">
          ${icon('download', 16)}<span><b>导出备份</b><em>下载一个 JSON 文件，含全部行程数据</em></span>
        </button>
        <button class="menu-item" data-action="import-trip">
          ${icon('plus', 16)}<span><b>导入行程（合并）</b><em>从 JSON 添加一趟行程，现有数据不受影响</em></span>
        </button>
        <button class="menu-item" data-action="import-json">
          ${icon('upload', 16)}<span><b>导入备份</b><em>从 JSON 文件恢复（会覆盖当前数据）</em></span>
        </button>
        <button class="menu-item" data-action="reseed">
          ${icon('sparkles', 16)}<span><b>恢复演示数据</b><em>清空后载入两个示例行程</em></span>
        </button>
        <button class="menu-item menu-item--danger" data-action="wipe">
          ${icon('trash', 16)}<span><b>清空全部数据</b><em>从零开始，不可撤销</em></span>
        </button>
      </div>

      <div class="settings-block">
        <label class="field">
          <span class="field__label">基础货币</span>
          <select class="input input--select" data-base-currency>
            ${CURRENCIES.map((c) => `<option value="${c.code}" ${c.code === data.settings.baseCurrency ? 'selected' : ''}>${c.code} · ${c.name}</option>`).join('')}
          </select>
          <span class="field__hint">所有金额会折算到这个货币做汇总</span>
        </label>
      </div>

      <p class="buildtag">构建版本 ${BUILD} · 如果手机上不是这一版，从后台完全关掉 App 再打开一次</p>

      <div class="syncbox">
        <div class="syncbox__head">${icon('refresh', 15)}同步能力<span class="sync-dot" data-sync="${store.syncState.status}"></span></div>
        <p>当前是 <b>仅本机</b> 模式：数据存在浏览器的本地存储里，不需要账号，也不上传任何东西。</p>
        <p>数据层的每次写入都会经过 <code>commit()</code> 并记录到操作日志，同步适配器是预留的接口——以后接上云端只需要实现 <code>push / pull</code> 两个方法，界面不用改。</p>
        <p class="muted">换设备时：用「导出备份」下载 JSON，在新设备「导入备份」。</p>
      </div>
    `,
    onMount: (backdrop, form, close) => {
      backdrop.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const a = btn.dataset.action;

        if (a === 'export-json') {
          exportJSON();
          return;
        }
        if (a === 'import-json') {
          close();
          setTimeout(pickImportFile, 220);
          return;
        }
        if (a === 'import-trip') {
          close();
          setTimeout(pickTripFile, 220);
          return;
        }
        if (a === 'reseed') {
          close();
          const ok = await confirmDialog({
            title: '恢复演示数据',
            message: '当前的行程和数据会被覆盖，确定吗？建议先导出备份。',
            confirmText: '恢复',
          });
          if (ok) { store.resetToSeed(); location.hash = ''; render(); toast('已恢复演示数据', 'success'); }
          return;
        }
        if (a === 'wipe') {
          close();
          const ok = await confirmDialog({
            title: '清空全部数据',
            message: '所有行程、装备、账目都会被删除，且无法撤销。确定吗？',
            confirmText: '全部删除',
          });
          if (ok) { store.clearAll(); location.hash = ''; render(); toast('已清空'); }
          return;
        }
      });

      const baseSel = backdrop.querySelector('[data-base-currency]');
      baseSel.addEventListener('change', () => {
        const code = baseSel.value;
        store.commit((s) => {
          // 以 CNY 为锚点重算汇率基准
          const oldBase = s.settings.baseCurrency;
          const factor = s.settings.rates[oldBase] || 1;
          if (code !== oldBase) {
            for (const k of Object.keys(s.settings.rates)) {
              s.settings.rates[k] = (s.settings.rates[k] || 1) / (s.settings.rates[code] || 1);
            }
            s.settings.rates[code] = 1;
          }
          s.settings.baseCurrency = code;
        }, { action: 'settings.baseCurrency', entity: 'settings' });
        toast(`基础货币已切换为 ${code}`, 'success');
        render();
      });
    },
  });
  return m;
}

function exportJSON() {
  download(`trailnote-备份-${todayStr()}.json`, store.exportJSON());
  toast('备份已下载', 'success');
}

/** 导入单趟行程：合并进现有数据，不覆盖 */
function pickTripFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const id = store.mergeTripPayload(payload);
      const t = store.trip(id);
      toast(`已导入「${t.name}」`, 'success');
      navigate(id, 'itinerary');
    } catch (err) {
      toast('导入失败：' + err.message, 'error');
    }
  });
  input.click();
}

function pickImportFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const ok = await confirmDialog({
        title: '导入备份',
        message: '导入会覆盖当前全部数据，确定继续吗？',
        confirmText: '导入',
        danger: false,
      });
      if (!ok) return;
      store.importJSON(text);
      location.hash = '';
      render();
      toast('导入成功', 'success');
    } catch (err) {
      toast('导入失败：' + err.message, 'error');
    }
  });
  input.click();
}

function openSyncInfo() {
  const shared = store.data.trips.filter((t) => t.share).length;
  const st = autoStatus();

  openModal({
    title: '数据存在哪',
    subtitle: '三层，各管一件事',
    size: 'md',
    hideFooter: true,
    body: `
      <div class="storage-layers">
        <div class="slayer">
          <span class="slayer__n">1</span>
          <div>
            <b>你的行程数据</b>
            <p>存在<b>这台设备的浏览器</b>里（localStorage）。不联网也在，但换设备不会跟着走。</p>
          </div>
        </div>
        <div class="slayer">
          <span class="slayer__n">2</span>
          <div>
            <b>网页本身</b>
            <p>托管在 <b>GitHub Pages</b>。它只负责把这个界面送到你的浏览器，<b>不保存你的任何行程内容</b>。</p>
          </div>
        </div>
        <div class="slayer">
          <span class="slayer__n">3</span>
          <div>
            <b>分享出去的那一份</b>
            <p>点「分享」后生成的只读快照，存在 <b>Supabase</b> 数据库里。别人打开链接就是从这儿读的。</p>
          </div>
        </div>
      </div>

      <div class="callout callout--info">
        ${icon('info', 14)}
        <p>所以：<b>GitHub 上没有任何你的行程数据</b>。删掉仓库网页就没了，但你的数据不会被删；
        反过来清空浏览器数据，云端已发布的分享也还在。</p>
      </div>

      ${shared ? `
        <div class="callout">
          ${icon('refresh', 14)}
          <p>当前有 <b>${shared}</b> 个行程在分享中。${st.pending
            ? `有 <b>${st.pending}</b> 处改动等待上传${st.lastError ? `（${esc(st.lastError)}）` : ''}。`
            : '改动会自动同步，别人打开链接就是最新版。'}</p>
        </div>` : ''}

      <div class="modal__actions">
        ${shared ? `<button class="btn btn--ghost btn--sm" data-action="force-sync">${icon('refresh', 13)}立即同步一次</button>` : ''}
        <button class="btn btn--ghost btn--sm" data-close>关闭</button>
      </div>
    `,
  });
}

/* ==================== 全局事件 ==================== */

function bindGlobal() {
  // 点击代理：data-action 的通用动作
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    // 允许视图自己处理过的事件继续冒泡，这里只处理外壳级动作
    if (!btn) return;
    const a = btn.dataset.action;

    if (a === 'open-sidebar') document.body.classList.add('is-sidebar');
    if (a === 'close-sidebar') document.body.classList.remove('is-sidebar');

    if (a === 'go') {
      const trip = currentTrip();
      if (trip) navigate(trip.id, btn.dataset.tab);
      return;
    }

    if (a === 'new-trip') { document.body.classList.remove('is-sidebar'); openTripForm(null); return; }

    if (a === 'edit-trip') {
      const trip = currentTrip();
      if (trip) openTripForm(trip);
      return;
    }

    if (a === 'share-trip') {
      const trip = currentTrip();
      if (trip) openShareModal({ trip, store, rerender: render });
      return;
    }

    if (a === 'export-json') { exportJSON(); return; }
    if (a === 'data-menu') { openDataMenu(); return; }
    if (a === 'sync-info') { openSyncInfo(); return; }
    if (a === 'sync-panel') { openSyncPanel(); return; }
    if (a === 'force-sync') {
      const btn = btn;
      btn.disabled = true;
      btn.innerHTML = `${icon('refresh', 13)}同步中…`;
      try {
        await syncNow();
        toast('已同步', 'success');
      } catch (err) {
        toast('同步失败：' + err.message, 'error');
      }
      btn.disabled = false;
      btn.innerHTML = `${icon('refresh', 13)}立即同步一次`;
      return;
    }
    if (a === 'toggle-theme') { toggleTheme(); return; }

    if (a === 'export-ics') {
      const trip = currentTrip();
      if (trip) bookings.exportICS({ trip, store });
      return;
    }
  });

  // 路由变化
  window.addEventListener('hashchange', () => {
    document.body.classList.remove('is-sidebar');
    render();
  });

  // 存储写满提示
  window.addEventListener('trailnote:storage-error', () => {
    toast('本地存储已满，建议导出后清理旧行程', 'error');
  });

  // PWA 安装
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const foot = document.querySelector('.sidebar__foot');
    if (foot && !document.querySelector('[data-action="install"]')) {
      const b = document.createElement('button');
      b.className = 'footrow';
      b.dataset.action = 'install';
      b.innerHTML = `${icon('download', 14)}<span class="footrow__text">安装到桌面</span>`;
      foot.insertBefore(b, foot.firstChild);
      b.addEventListener('click', async () => {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        b.remove();
      });
    }
  });
}

/* ==================== 启动 ==================== */

function boot() {
  initTheme();
  bindGlobal();
  render();

  // 配置了云端才需要自动同步 / 多设备同步
  if (isSyncConfigured()) {
    startAutoSync();
    startVaultSync();
  }

  // 同步把本机数据换掉之后，界面要跟着刷新
  window.addEventListener('trailnote:data-replaced', () => render());

  // 注册 Service Worker（离线可用）
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((e) => {
        console.warn('Service Worker 注册失败（离线缓存不可用）', e);
      });
    });
  }
}

boot();

// 供调试
window.__trailnote = { store, render, navigate };
