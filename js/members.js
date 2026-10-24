/* ============================================================
   members.js — 同行成员管理
   多人行程里，装备要按「谁背」记、花销要按「谁付 / 谁分摊」记。
   ============================================================ */

import { esc, uid } from './util.js';
import { MEMBER_COLORS, MEMBER_ROLE_SUGGESTIONS, memberInitial } from './calc.js';
import { icon, openModal, toast, confirmDialog } from './ui.js';

/** 成员被删掉后，清理装备 / 账目上的引用 */
export function syncMemberRefs(store, tripId) {
  const trip = store.trip(tripId);
  const ids = new Set((trip?.members || []).map((m) => m.id));
  store.commit((s) => {
    for (const g of s.gear) {
      if (g.tripId === tripId && g.ownerId && !ids.has(g.ownerId)) g.ownerId = null;
    }
    for (const e of s.expenses) {
      if (e.tripId !== tripId) continue;
      if (e.paidBy && !ids.has(e.paidBy)) e.paidBy = null;
      if (Array.isArray(e.splitWith)) {
        e.splitWith = e.splitWith.filter((id) => ids.has(id));
      }
    }
  }, { action: 'members.sync', entity: 'trip', id: tripId });
}

function rowHTML(m) {
  return `
    <div class="memrow" data-member-row="${esc(m.id)}" data-color="${esc(m.color)}">
      <span class="memrow__dot" style="background:${esc(m.color)}">${esc(memberInitial(m.name))}</span>
      <input class="input" name="name" value="${esc(m.name)}" placeholder="名字" autocomplete="off" />
      <input class="input memrow__role" name="role" value="${esc(m.role || '')}"
             placeholder="角色，如 领队" list="member-roles" autocomplete="off" />
      <button type="button" class="icon-btn" data-remove title="移除">${icon('x', 15)}</button>
    </div>`;
}

export function openMembersModal(ctx) {
  const { store, trip, rerender } = ctx;
  const existing = (trip.members || []).map((m) => ({ ...m }));
  const startRows = existing.length ? existing : [{ id: uid('mb_'), name: '', role: '', color: MEMBER_COLORS[0] }];

  openModal({
    title: '同行成员',
    subtitle: '添加之后，装备可以按「谁背」记，花销可以按「谁付、谁分摊」结算',
    size: 'md',
    submitText: '保存成员',
    body: `
      <div class="memrows" data-rows>
        ${startRows.map(rowHTML).join('')}
      </div>
      <datalist id="member-roles">
        ${MEMBER_ROLE_SUGGESTIONS.map((r) => `<option value="${esc(r)}"></option>`).join('')}
      </datalist>
      <button type="button" class="btn btn--ghost btn--sm" data-add-member>
        ${icon('plus', 13)}添加成员
      </button>
      <p class="field__hint" style="margin-top:12px">
        角色只是标签，随便写。只有填了名字的成员才会被保存。
        只有 1 个人的时候，装备和花销界面不会出现人员选项；加到 2 个人以上才会解锁分摊结算。
      </p>
    `,
    onMount: (backdrop) => {
      const rowsEl = backdrop.querySelector('[data-rows]');
      let seq = startRows.length;

      const bindRow = (row) => {
        const nameInput = row.querySelector('[name=name]');
        const dot = row.querySelector('.memrow__dot');
        nameInput.addEventListener('input', () => {
          dot.textContent = memberInitial(nameInput.value);
        });
        row.querySelector('[data-remove]').addEventListener('click', () => {
          if (rowsEl.children.length <= 1) {
            nameInput.value = '';
            row.querySelector('[name=role]').value = '';
            return;
          }
          row.remove();
        });
      };

      [...rowsEl.children].forEach(bindRow);

      backdrop.querySelector('[data-add-member]').addEventListener('click', () => {
        const m = {
          id: uid('mb_'),
          name: '',
          role: '',
          color: MEMBER_COLORS[seq % MEMBER_COLORS.length],
        };
        seq += 1;
        rowsEl.insertAdjacentHTML('beforeend', rowHTML(m));
        bindRow(rowsEl.lastElementChild);
        rowsEl.lastElementChild.querySelector('[name=name]').focus();
      });
    },
    onSubmit: (_data, form) => {
      const rows = [...form.querySelectorAll('[data-member-row]')];
      const next = rows
        .map((r) => ({
          id: r.dataset.memberRow,
          color: r.dataset.color,
          name: r.querySelector('[name=name]').value.trim(),
          role: r.querySelector('[name=role]').value.trim(),
        }))
        .filter((m) => m.name);

      if (!next.length) {
        toast('至少留一个成员，或者直接关掉', 'error');
        return false;
      }

      store.commit((s) => {
        const t = s.trips.find((x) => x.id === trip.id);
        if (t) t.members = next;
      }, { action: 'trip.members', entity: 'trip', id: trip.id });

      syncMemberRefs(store, trip.id);
      toast(next.length >= 2 ? `已保存 ${next.length} 位成员，分摊结算已开启` : '已保存成员', 'success');
      rerender();
    },
  });
}
