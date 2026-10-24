/* ============================================================
   syncui.js — 多设备同步面板
   ============================================================ */

import { esc, relTime } from './util.js';
import { isSyncConfigured } from './config.js';
import {
  status as syncStatus, subscribeStatus, syncNow,
  createVault, joinVault, disconnect, restoreBackup, hasBackup,
} from './vault.js';
import { icon, openModal, confirmDialog, toast, field, formGrid } from './ui.js';

export function statusLine(st) {
  if (!st.enabled) return '未开启同步';
  if (st.syncing) return '同步中…';
  if (st.lastError) return '同步失败';
  if (st.pending) return '有改动待同步';
  return st.lastSyncedAt ? `已同步 · ${relTime(st.lastSyncedAt)}` : '已连接';
}

function bodyHTML(st) {
  if (!isSyncConfigured()) {
    return `
      <div class="callout callout--warn">
        ${icon('alert', 14)}
        <p>还没配置 Supabase，同步用不了。先按 README 把 <code>js/config.js</code> 填上。</p>
      </div>`;
  }

  if (!st.enabled) {
    return `
      <div class="share-intro">
        <div class="share-intro__icon">${icon('refresh', 22)}</div>
        <div>
          <h3>让几台设备看到同一份行程</h3>
          <p>开启后，你在手机上记的花销、在电脑上改的装备，都会自动同步。适合「一个人、多台设备」。</p>
        </div>
      </div>

      <div class="callout callout--info">
        ${icon('lock', 14)}
        <p><b>同步码就是钥匙。</b>它只存在你的设备上，服务器存的是它的哈希。换手机时输入同一串码就能接上。</p>
      </div>

      <div class="sync-choices">
        <div class="sync-choice">
          <b>这是第一台设备</b>
          <p>生成一个同步码，把当前内容传到云端。</p>
          <button class="btn btn--primary btn--sm" data-sync-action="create">${icon('plus', 13)}生成同步码</button>
        </div>
        <div class="sync-choice">
          <b>我已经有同步码</b>
          <p>在另一台设备上输入，把云端内容拉过来。</p>
          <button class="btn btn--ghost btn--sm" data-sync-action="join">${icon('link', 13)}输入同步码</button>
        </div>
      </div>

      <div class="callout">
        ${icon('alert', 14)}
        <p>输入别人的同步码等于接管他的全部行程。只在你自己的设备之间用。</p>
      </div>`;
  }

  return `
    <div class="share-intro">
      <div class="share-intro__icon share-intro__icon--on">${icon('refresh', 22)}</div>
      <div>
        <h3>${esc(statusLine(st))}</h3>
        <p>第 <b>${st.rev}</b> 版 · 设备 <code>${esc(st.deviceId)}</code></p>
      </div>
    </div>

    <div class="sharelink">
      <input class="input sharelink__input" readonly value="${esc(st.key)}" data-sync-code />
      <button class="btn btn--primary btn--sm" data-sync-action="copy">${icon('copy', 13)}复制</button>
    </div>
    <p class="field__hint" style="margin:-4px 0 14px">把这串码输入到另一台设备，就能接上同一份数据。别发给别人。</p>

    ${st.lastError ? `
      <div class="callout callout--warn">
        ${icon('alert', 14)}
        <p>上次同步失败：${esc(st.lastError)}。改动还在本机，网络恢复后会自动重试。</p>
      </div>` : ''}

    ${st.conflicts && st.conflicts.length ? `
      <div class="callout callout--warn">
        ${icon('alert', 14)}
        <p>有 <b>${st.conflicts.length}</b> 条记录在两边同时被改过，已保留<b>本机版本</b>。
        如果发现云端那份才是你要的，可以用下面的「恢复同步前的备份」。</p>
      </div>` : ''}

    ${st.pending ? `
      <div class="callout">
        ${icon('refresh', 14)}
        <p>有改动还没传上去，几秒后会自动重试。</p>
      </div>` : ''}

    <div class="modal__actions">
      ${hasBackup() ? `<button class="btn btn--ghost btn--sm" data-sync-action="restore">${icon('refresh', 13)}恢复同步前的备份</button>` : ''}
      <button class="btn btn--ghost btn--sm share-danger" data-sync-action="off">断开同步</button>
      <button class="btn btn--primary btn--sm" data-sync-action="now">${icon('refresh', 13)}立即同步</button>
    </div>`;
}

export function openSyncPanel() {
  const modal = openModal({
    title: '多设备同步',
    subtitle: '一个人，多台设备',
    size: 'md',
    hideFooter: true,
    body: `<div data-sync-body>${bodyHTML(syncStatus())}</div>
           <div class="modal__actions"><button class="btn btn--ghost btn--sm" data-close>关闭</button></div>`,
  });

  const backdrop = modal.el;
  const bodyEl = backdrop.querySelector('[data-sync-body]');
  let alive = true;
  const refresh = () => { if (alive) bodyEl.innerHTML = bodyHTML(syncStatus()); };

  const unsub = subscribeStatus(() => refresh());
  const stop = () => { alive = false; unsub(); };
  backdrop.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target === backdrop) stop();
  });

  backdrop.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-sync-action]');
    if (!btn) return;
    const action = btn.dataset.syncAction;

    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(syncStatus().key);
        toast('同步码已复制', 'success');
      } catch {
        const input = backdrop.querySelector('[data-sync-code]');
        if (input) { input.select(); document.execCommand?.('copy'); }
        toast('请手动复制选中的同步码', 'info');
      }
      return;
    }

    if (action === 'create') {
      btn.disabled = true;
      btn.innerHTML = `${icon('refresh', 13)}创建中…`;
      try {
        await createVault();
        toast('已开启同步', 'success');
        refresh();
      } catch (err) {
        toast('失败：' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = `${icon('plus', 13)}生成同步码`;
      }
      return;
    }

    if (action === 'join') {
      openJoinModal(() => refresh());
      return;
    }

    if (action === 'now') {
      btn.disabled = true;
      await syncNow();
      const st = syncStatus();
      toast(st.lastError ? '失败：' + st.lastError : '已同步', st.lastError ? 'error' : 'success');
      btn.disabled = false;
      refresh();
      return;
    }

    if (action === 'restore') {
      const ok = await confirmDialog({
        title: '恢复备份',
        message: '会用「上一次同步覆盖前」的本机数据替换当前内容。确定吗？',
        confirmText: '恢复',
      });
      if (!ok) return;
      if (restoreBackup()) { toast('已恢复备份', 'success'); refresh(); }
      else toast('没有可用的备份', 'error');
      return;
    }

    if (action === 'off') {
      const ok = await confirmDialog({
        title: '断开同步',
        message: '这台设备不再和云端同步。已经上传的数据不会被删除，之后可以重新输入同步码接回来。',
        confirmText: '断开',
      });
      if (!ok) return;
      disconnect();
      toast('已断开同步', 'success');
      refresh();
    }
  });
}

function openJoinModal(onDone) {
  openModal({
    title: '输入同步码',
    subtitle: '从另一台设备上复制过来',
    size: 'sm',
    submitText: '连接',
    body: formGrid(field({
      label: '同步码', name: 'code', span: 2, placeholder: '粘贴另一台设备上显示的同步码',
    })),
    onSubmit: async (d) => {
      const code = (d.code || '').trim();
      if (code.length < 16) { toast('同步码看起来不对', 'error'); return false; }
      try {
        await joinVault(code);
        toast('已连接，内容已拉取', 'success');
        if (onDone) onDone();
      } catch (err) {
        toast('连接失败：' + err.message, 'error');
        return false;
      }
    },
  });
}
