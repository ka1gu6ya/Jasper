/* ============================================================
   share.js — 「分享行程」弹窗
   三种状态：未配置后端 / 未分享 / 已分享
   ============================================================ */

import { esc } from './util.js';

/** ISO 时间 → 本地「YYYY-MM-DD HH:mm」 */
function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
import { isSyncConfigured } from './config.js';
import { publishTrip, revokeShare, shareLink } from './sync.js';
import { icon, openModal, confirmDialog, toast } from './ui.js';

/* ---------------- 未配置：给一份手把手设置指引 ---------------- */

function setupBody() {
  return `
    <div class="share-intro">
      <div class="share-intro__icon">${icon('globe', 22)}</div>
      <div>
        <h3>先接一个免费的数据库</h3>
        <p>分享链接需要一个地方存快照。用 Supabase 的免费额度就够了——个人用基本永远用不完。</p>
      </div>
    </div>

    <ol class="steps">
      <li>
        <span class="steps__n">1</span>
        <div><b>注册</b> <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a>，新建一个项目（Region 选 Singapore 或 Tokyo，国内快一点）。</div>
      </li>
      <li>
        <span class="steps__n">2</span>
        <div><b>建表</b>：项目里打开 <code>SQL Editor</code>，把仓库里的 <code>supabase.sql</code> 全文粘进去，点 Run。</div>
      </li>
      <li>
        <span class="steps__n">3</span>
        <div><b>拿密钥</b>：<code>Project Settings → API</code>，复制 <code>Project URL</code> 和 <code>anon public</code>。</div>
      </li>
      <li>
        <span class="steps__n">4</span>
        <div><b>填进去</b>：打开 <code>js/config.js</code>，把两个值填到 <code>SUPABASE</code> 里，保存刷新。</div>
      </li>
    </ol>

    <div class="callout callout--info">
      ${icon('lock', 14)}
      <p><b>anon key 放在前端是安全的。</b>真正的权限控制在数据库的 RPC 里：
      别人拿到这个 key 也<b>列不出</b>你分享过的行程，只有拿到具体链接的人才能看那一趟。</p>
    </div>

    <div class="callout">
      ${icon('info', 14)}
      <p>不接也完全不影响使用——本地记录、离线、导出备份都照旧。</p>
    </div>`;
}

const isLocalHost = () =>
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);

/* ---------------- 已分享 / 未分享 ---------------- */

function shareBody(trip) {
  const share = trip.share;
  if (!share) {
    return `
      <div class="share-intro">
        <div class="share-intro__icon">${icon('share', 22)}</div>
        <div>
          <h3>生成一个只读链接</h3>
          <p>把这趟行程打包成快照，同行的人打开链接就能看完整计划——行程、装备清单和重量、花销明细都能看到，但改不了。</p>
        </div>
      </div>
      <div class="callout">
        ${icon('info', 14)}
        <p>链接里的内容是「发布那一刻」的。你改了行程之后，回来点一下「更新链接内容」就行。</p>
      </div>
      <button class="btn btn--primary btn--block" data-share-action="publish">
        ${icon('link', 15)}生成分享链接
      </button>`;
  }

  const url = shareLink(share.token);
  return `
    <div class="share-intro">
      <div class="share-intro__icon share-intro__icon--on">${icon('link', 22)}</div>
      <div>
        <h3>链接已生成</h3>
        <p>发给同行的人，用手机浏览器打开就能看。<b>任何人拿到链接都能查看</b>，别发到公开的地方。</p>
      </div>
    </div>

    <div class="sharelink">
      <input class="input sharelink__input" readonly value="${esc(url)}" data-share-url />
      <button class="btn btn--primary btn--sm" data-share-action="copy">${icon('copy', 13)}复制</button>
    </div>

    ${isLocalHost() ? `
      <div class="callout callout--warn">
        ${icon('alert', 14)}
        <p><b>这条链接指向本机（${esc(location.hostname)}），别人的手机打不开。</b>
        先把站点部署到云端，再从部署后的网址生成，链接里的域名就会自动变成对的。</p>
      </div>` : ''}

    <div class="share-meta">
      <span>${icon('refresh', 12)}第 ${esc(String(share.version || 1))} 版</span>
      <span>${icon('clock', 12)}${esc(fmtStamp(share.publishedAt))}</span>
    </div>

    <div class="share-actions">
      <button class="btn btn--ghost btn--sm" data-share-action="open">${icon('globe', 13)}预览</button>
      <button class="btn btn--ghost btn--sm" data-share-action="update">${icon('refresh', 13)}更新链接内容</button>
      <button class="btn btn--ghost btn--sm share-danger" data-share-action="revoke">${icon('trash', 13)}停止分享</button>
    </div>`;
}

/* ---------------- 弹窗 ---------------- */

export function openShareModal(ctx) {
  const { store, trip } = ctx;
  const configured = isSyncConfigured();

  const modal = openModal({
    title: '分享行程',
    subtitle: configured ? '只读链接 · 对方能看不能改' : '还差一步配置',
    size: 'md',
    hideFooter: true,
    body: `<div data-share-body>${configured ? shareBody(trip) : setupBody()}</div>
           <div class="modal__actions">
             <button class="btn btn--ghost btn--sm" data-close>关闭</button>
           </div>`,
  });

  const backdrop = modal.el;
  const bodyEl = backdrop.querySelector('[data-share-body]');

  const refresh = () => {
    bodyEl.innerHTML = shareBody(trip);
  };

  backdrop.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-share-action]');
    if (!btn) return;
    const action = btn.dataset.shareAction;

    if (action === 'copy') {
      const url = shareLink(trip.share.token);
      try {
        await navigator.clipboard.writeText(url);
        toast('链接已复制', 'success');
      } catch {
        const input = backdrop.querySelector('[data-share-url]');
        if (input) { input.select(); document.execCommand?.('copy'); }
        toast('请手动复制选中的链接', 'info');
      }
      return;
    }

    if (action === 'open') {
      window.open(shareLink(trip.share.token), '_blank', 'noopener');
      return;
    }

    if (action === 'publish' || action === 'update') {
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `${icon('refresh', 13)}${action === 'update' ? '更新中…' : '生成中…'}`;
      try {
        await publishTrip(store, trip);
        toast(action === 'update' ? '链接内容已更新' : '链接已生成', 'success');
        refresh();
      } catch (err) {
        toast('失败：' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = original;
      }
      return;
    }

    if (action === 'revoke') {
      const ok = await confirmDialog({
        title: '停止分享',
        message: '链接会立刻失效，已经拿到链接的人也打不开了。你自己本地的行程不受影响。',
        confirmText: '停止分享',
      });
      if (!ok) return;
      try {
        await revokeShare(store, trip);
        toast('已停止分享', 'success');
        refresh();
      } catch (err) {
        toast('失败：' + err.message, 'error');
      }
    }
  });
}
