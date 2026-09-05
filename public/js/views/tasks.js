import { el, spinner, emptyState, toast, confirmDialog } from '../ui.js';
import { t, timeAgo } from '../i18n.js';
import { api } from '../api.js';

function statusBadge(status) {
  const cls = status === 'done' ? 'completed' : status === 'cancelled' ? 'cancelled' : status === 'in_progress' ? 'issued' : 'pending';
  return el('span.badge.b-' + cls, { text: t('task.status.' + status) });
}
function priorityBadge(p) {
  if (p === 'normal') return null;
  return el('span.badge.b-' + p, { text: t('prio.' + p) });
}

/* ========================================================================== */
/* Liste                                                                      */
/* ========================================================================== */

export async function renderTasks(mount, ctx) {
  const { go, user } = ctx;
  mount.append(spinner());
  const [{ tasks }, { members }] = await Promise.all([api.tasks(), api.members().catch(() => ({ members: [] }))]);

  let statusFilter = null;
  const listBox = el('div.list');

  function draw() {
    const filtered = tasks.filter((tk) => !statusFilter || tk.status === statusFilter);
    listBox.replaceChildren(
      ...(filtered.length
        ? filtered.map((tk) => {
            const assignee = members.find((m) => m.id === tk.assignee_id);
            return el('div.row', { style: 'cursor:pointer', onclick: () => go('/tasks/' + tk.id), role: 'button', tabindex: '0' },
              el('div.grow', {},
                el('div.rt', { text: tk.title }),
                el('div.rs', { text: [assignee?.username, tk.due_date ? t('task.due') + ' ' + tk.due_date : null].filter(Boolean).join(' · ') })
              ),
              priorityBadge(tk.priority),
              statusBadge(tk.status)
            );
          })
        : [emptyState(t('task.none'))])
    );
  }

  mount.replaceChildren();
  mount.append(
    el('div.page-head', {},
      el('div', {}, el('h1', { text: t('task.title') }), el('p', { text: t('task.sub', { n: tasks.length }) })),
      el('button.btn.primary', { text: '+ ' + t('task.new'), onclick: () => go('/tasks/new') })
    ),
    el('div.card', {},
      el('div.chips', {},
        el('button.btn.sm.primary', { text: t('common.all'), onclick: (e) => { statusFilter = null; setActive(e); draw(); } }),
        ...['open', 'in_progress', 'done', 'cancelled'].map((s) =>
          el('button.btn.sm', { text: t('task.status.' + s), onclick: (e) => { statusFilter = s; setActive(e); draw(); } })
        )
      )
    ),
    el('div', { style: 'margin-top:16px' }, listBox)
  );

  function setActive(e) {
    [...e.target.parentElement.children].forEach((b) => b.classList.remove('primary'));
    e.target.classList.add('primary');
  }

  draw();
}

/* ========================================================================== */
/* Anlegen / Bearbeiten                                                       */
/* ========================================================================== */

export async function renderTaskForm(mount, ctx, idParam) {
  const { go } = ctx;
  const editingId = idParam && idParam !== 'new' ? parseInt(idParam, 10) : null;
  mount.append(spinner());

  const [existing, { members }] = await Promise.all([
    editingId ? api.task(editingId) : Promise.resolve(null),
    api.members().catch(() => ({ members: [] })),
  ]);
  const tk = existing?.task || {};

  mount.replaceChildren();

  const title = el('input', { type: 'text', value: tk.title || '', required: true });
  const description = el('textarea', { value: tk.description || '' });
  const assignee = el('select', {}, el('option', { value: '', text: '—' }), ...members.map((m) => el('option', { value: m.id, text: m.username, selected: tk.assignee_id === m.id })));
  const priority = el('select', {}, ...['normal', 'high', 'urgent'].map((p) => el('option', { value: p, text: t('prio.' + p), selected: (tk.priority || 'normal') === p })));
  const status = el('select', {}, ...['open', 'in_progress', 'done', 'cancelled'].map((s) => el('option', { value: s, text: t('task.status.' + s), selected: (tk.status || 'open') === s })));
  const dueDate = el('input', { type: 'date', value: tk.due_date || '' });

  const submit = el('button.btn.primary.block', { text: editingId ? t('dino.save') : t('dino.create') });
  submit.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!title.value.trim()) { toast(t('common.name_required'), 'err'); return; }
    submit.disabled = true;
    const body = { title: title.value.trim(), description: description.value.trim(), assigneeId: assignee.value || null, priority: priority.value, status: status.value, dueDate: dueDate.value || null };
    try {
      const result = editingId ? await api.updateTask(editingId, body) : await api.createTask(body);
      toast(editingId ? t('dino.saved') : t('dino.created'));
      go('/tasks/' + result.task.id, true);
    } catch (err) { toast(err.message, 'err'); submit.disabled = false; }
  });

  mount.append(
    el('div.page-head', {}, el('button.btn.sm', { text: '← ' + t('common.back'), onclick: () => go(editingId ? '/tasks/' + editingId : '/tasks') })),
    el('h1', { text: editingId ? t('task.edit') : t('task.new') }),
    el('div.card', {},
      el('div.field', {}, el('label', { text: t('task.title_label') }), title),
      el('div.field', {}, el('label', { text: t('task.description') }), description),
      el('div.field', {}, el('label', { text: t('task.assignee') }), assignee),
      el('div.field', {}, el('label', { text: t('task.priority') }), priority),
      el('div.field', {}, el('label', { text: t('task.status_label') }), status),
      el('div.field', {}, el('label', { text: t('task.due_date') }), dueDate)
    ),
    el('div', { style: 'margin-top:18px' }, submit)
  );
}

/* ========================================================================== */
/* Detailansicht mit Kommentaren                                              */
/* ========================================================================== */

export async function renderTaskDetail(mount, ctx, idParam) {
  const { go } = ctx;
  const id = parseInt(idParam, 10);
  mount.append(spinner());
  let data, members;
  try {
    [{ task: data }, { members }] = await Promise.all([api.task(id), api.members().catch(() => ({ members: [] }))]);
  } catch (err) {
    mount.replaceChildren(emptyState(err.message));
    return;
  }
  const assignee = members.find((m) => m.id === data.assignee_id);

  const commentsBox = el('div.list', { style: 'margin-top:10px' });
  const commentInput = el('input', { type: 'text', placeholder: t('order.comment_ph') });
  const sendBtn = el('button.btn', { text: t('order.send') });

  function drawComments() {
    commentsBox.replaceChildren(
      ...(data.comments.length
        ? data.comments.map((c) =>
            el('div.row', {}, el('div.grow', {}, el('div.rt', { text: c.author_name }), el('div.rs', { text: c.body })), el('div.rs', { text: timeAgo(c.created_at) }))
          )
        : [emptyState(t('order.no_comments'))])
    );
  }

  sendBtn.addEventListener('click', async () => {
    if (!commentInput.value.trim()) return;
    sendBtn.disabled = true;
    try {
      await api.addTaskComment(id, { body: commentInput.value.trim() });
      commentInput.value = '';
      data = (await api.task(id)).task;
      drawComments();
    } catch (err) { toast(err.message, 'err'); }
    finally { sendBtn.disabled = false; }
  });

  mount.replaceChildren();
  mount.append(
    el('div.page-head', {}, el('button.btn.sm', { text: '← ' + t('common.back'), onclick: () => go('/tasks') })),
    el('div.card', {},
      el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px' },
        el('div', {},
          el('div', { style: 'font-family:var(--ff-display);font-size:1.3rem;font-weight:700', text: data.title }),
          data.description ? el('p', { style: 'color:var(--muted);margin-top:6px', text: data.description }) : null,
          el('div.chips', { style: 'margin-top:8px' }, priorityBadge(data.priority), statusBadge(data.status))
        ),
        el('button.btn.sm', { text: t('common.edit'), onclick: () => go('/tasks/' + id + '/edit') })
      ),
      el('div', { style: 'margin-top:14px;color:var(--muted);font-size:.88rem' },
        `${t('task.assignee')}: ${assignee?.username || '—'}${data.due_date ? ' · ' + t('task.due') + ' ' + data.due_date : ''}`
      )
    ),
    el('div.section-title', { style: 'margin-top:18px' }, t('task.comments')),
    commentsBox,
    el('div', { style: 'display:flex;gap:8px;margin-top:10px' }, commentInput, sendBtn),
    el('div', { style: 'margin-top:20px' },
      el('button.btn.danger', {
        text: t('common.delete'),
        onclick: async () => {
          const ok = await confirmDialog({ title: t('task.delete_confirm', { title: data.title }), danger: true });
          if (!ok) return;
          try { await api.deleteTask(id); toast(t('task.deleted')); go('/tasks'); }
          catch (err) { toast(err.message, 'err'); }
        },
      })
    )
  );
  drawComments();
}
