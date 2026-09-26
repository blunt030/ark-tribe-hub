import { el, spinner, emptyState, toast, confirmDialog, pageHead, pill, kebabMenu, tabBar, avatar, avatarSrc, panel, emptyBlock } from '../ui.js';
import { t, timeAgo, fmtDate, fmtStamp, isPastDay } from '../i18n.js';
import { api } from '../api.js';
import { itemArt } from '../icons.js';
import { uiIcon } from '../ui-icons.js';

const STATES = ['open', 'in_progress', 'done', 'cancelled'];
const TONE = { open: 'open', in_progress: 'progress', done: 'done', cancelled: 'muted' };
const PRIO_TONE = { urgent: 'urgent', high: 'high', normal: 'muted' };

function statusPill(status) { return pill(t('task.status.' + status), TONE[status] || 'open'); }

// Themenbild aus eindeutigen Begriffen im Titel/Text (z. B. "Rex", "Metall",
// "Tek"). Ohne klaren Treffer bleibt es bei einem Symbol - kein Zufallsbild.
const CREATURES = ['rex', 'argentavis', 'giganotosaurus', 'brontosaurus', 'direwolf', 'ankylosaurus', 'triceratops', 'spinosaurus',
  'pteranodon', 'quetzal', 'megalodon', 'mosasaurus', 'therizinosaurus', 'allosaurus', 'carnotaurus', 'yutyrannus', 'baryonyx',
  'dimorphodon', 'doedicurus', 'daeodon', 'megatherium', 'kaprosuchus', 'basilosaurus', 'managarmr', 'acrocanthosaurus', 'carcharodontosaurus'];
const TOPICS = [
  [/\btek\b|tek-/i, { key: 'tek_generator', product_type: 'structure' }],
  [/drohne|drone/i, { key: 'attack_drone', product_type: 'creature' }],
  [/metall|metal/i, { key: 'metal_foundation', product_type: 'structure' }],
  [/\bstein|stone|fundament|foundation|basis|base\b/i, { key: 'stone_foundation', product_type: 'structure' }],
  [/wand|mauer|wall/i, { key: 'metal_wall', product_type: 'structure' }],
  [/tresor|vault/i, { key: 'vault', product_type: 'structure' }],
  [/schmiede|forge/i, { key: 'industrial_forge', product_type: 'structure' }],
  [/geschütz|turret/i, { key: 'auto_turret', product_type: 'structure' }],
  [/kühlschrank|refrigerator|fridge/i, { key: 'refrigerator', product_type: 'structure' }],
  [/generator/i, { key: 'generator', product_type: 'structure' }],
  [/\beier?\b|\begg/i, { key: 'egg', product_type: 'egg' }],
];
function taskTopic(task) {
  const text = `${task.title || ''} ${task.description || ''}`;
  const lower = text.toLowerCase();
  const creature = CREATURES.find((c) => new RegExp(`\\b${c}\\b`).test(lower));
  if (creature) return { key: creature, product_type: 'creature' };
  return TOPICS.find(([re]) => re.test(text))?.[1] || null;
}
function taskThumb(task) {
  const topic = taskTopic(task);
  return topic
    ? el('span.task-thumb', {}, itemArt(topic))
    : el('span.task-thumb.is-icon', {}, uiIcon(task.status === 'done' ? 'check-circle' : 'clipboard-text'));
}
function dueLabel(task) {
  if (!task.due_date) return el('span.task-date', {}, uiIcon('calendar-blank'), el('span', { text: t('task.no_due') }));
  const overdue = !['done', 'cancelled'].includes(task.status) && isPastDay(task.due_date);
  return el('span.task-date' + (overdue ? '.is-overdue' : ''), { title: overdue ? t('task.overdue') : '' },
    uiIcon(overdue ? 'warning' : 'calendar-blank'), el('span', { text: fmtDate(task.due_date) }));
}

/* ========================================================================== */
/* Liste                                                                      */
/* ========================================================================== */

export async function renderTasks(mount, ctx) {
  const { go, user } = ctx;
  const isAdmin = user.roles.includes('admin') || user.roles.includes('developer');
  mount.append(spinner());
  let [{ tasks }, { members }] = await Promise.all([api.tasks(), api.members().catch(() => ({ members: [] }))]);

  let statusFilter = 'all';
  const search = el('input', { type: 'search', placeholder: t('common.search'), 'aria-label': t('common.search') });
  const groupsBox = el('div.task-groups');
  const tabsSlot = el('div');

  const who = (tk) => members.find((m) => Number(m.id) === Number(tk.assignee_id));

  async function reloadTasks() {
    tasks = (await api.tasks()).tasks;
    drawTabs();
    draw();
  }

  function taskMenu(tk) {
    return kebabMenu([
      { label: t('task.open_detail'), icon: 'arrow-right', onclick: () => go('/tasks/' + tk.id) },
      !tk.assignee_id && tk.status === 'open' ? { label: t('task.claim'), icon: 'check-circle', onclick: async () => {
        try { await api.claimTask(tk.id); toast(t('task.claimed')); go('/tasks/' + tk.id); }
        catch (err) { toast(err.message, 'err'); }
      } } : null,
      isAdmin ? { label: t('common.edit'), icon: 'pencil-simple', onclick: () => go('/tasks/' + tk.id + '/edit') } : null,
      isAdmin ? { label: t('common.delete'), icon: 'trash', danger: true, onclick: async () => {
        const ok = await confirmDialog({ title: t('task.delete_confirm', { title: tk.title }), danger: true });
        if (!ok) return;
        try { await api.deleteTask(tk.id); toast(t('task.deleted')); await reloadTasks(); }
        catch (err) { toast(err.message, 'err'); }
      } } : null,
    ], t('task.more'));
  }

  function taskRow(tk) {
    const assignee = who(tk);
    const open = () => go('/tasks/' + tk.id);
    return el('div.task-row', {
      role: 'link', tabindex: '0', onclick: open,
      onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } },
    },
      taskThumb(tk),
      el('div.task-copy', {},
        el('strong', { text: tk.title }),
        tk.description ? el('small.task-desc', { text: tk.description }) : null,
        el('small.task-meta', {}, el('span', { text: assignee?.username || t('task.unassigned') }), ' · ', dueLabel(tk))),
      el('div.task-who', {},
        assignee ? avatar(assignee.username, { size: 'sm', src: avatarSrc(assignee) }) : el('span.ark-avatar.av-sm.av-tone-0', { text: '–', 'aria-hidden': 'true' }),
        el('span.task-who-copy', {},
          el('b' + (assignee ? '' : '.is-none'), { text: assignee?.username || t('task.unassigned') }),
          dueLabel(tk))),
      statusPill(tk.status),
      el('div.task-actions', { onclick: (e) => e.stopPropagation() },
        tk.priority !== 'normal' ? el('span.prio-flag', { title: t('prio.' + tk.priority) }, pill(t('prio.' + tk.priority), PRIO_TONE[tk.priority])) : null,
        taskMenu(tk)));
  }

  function drawTabs() {
    tabsSlot.replaceChildren(tabBar([
      { key: 'all', label: t('common.all') },
      ...STATES.filter((s) => s !== 'cancelled' || tasks.some((tk) => tk.status === 'cancelled'))
        .map((s) => ({ key: s, label: t('task.status.' + s), count: tasks.filter((tk) => tk.status === s).length })),
    ], statusFilter, (key) => { statusFilter = key; draw(); }));
  }

  function draw() {
    const q = search.value.trim().toLocaleLowerCase();
    const visible = tasks.filter((tk) => (statusFilter === 'all' || tk.status === statusFilter)
      && (!q || [tk.title, tk.description, who(tk)?.username].join(' ').toLocaleLowerCase().includes(q)));
    if (!visible.length) {
      groupsBox.replaceChildren(tasks.length
        ? emptyBlock('magnifying-glass', t('task.none'))
        : emptyBlock('check-square', t('task.none'), null, isAdmin
          ? el('button.btn.primary.sm', { type: 'button', onclick: () => go('/tasks/new') }, uiIcon('plus'), el('span', { text: t('task.new') })) : null));
      return;
    }
    groupsBox.replaceChildren(...STATES.map((state) => {
      const rows = visible.filter((tk) => tk.status === state);
      if (!rows.length) return null;
      return el('section.ark-panel.task-group', {},
        el('h2.task-group-head.st-' + state, {}, el('span.ring', { 'aria-hidden': 'true' }),
          el('span', { text: `${t('task.status.' + state)} (${rows.length})` })),
        ...rows.map(taskRow));
    }).filter(Boolean));
  }

  search.addEventListener('input', draw);
  mount.replaceChildren(
    pageHead({
      title: t('task.title'), sub: t('page.tasks.sub'), icon: 'check-square',
      actions: [isAdmin ? el('button.btn.primary.lux', { type: 'button', onclick: () => go('/tasks/new') }, uiIcon('plus'), el('span', { text: t('task.new') })) : null],
    }),
    el('div.task-toolbar', {}, tabsSlot, el('div.search-field', {}, uiIcon('magnifying-glass'), search)),
    groupsBox
  );
  drawTabs();
  draw();
}

/* ========================================================================== */
/* Anlegen / Bearbeiten                                                       */
/* ========================================================================== */

export async function renderTaskForm(mount, ctx, idParam) {
  const { go, user } = ctx;
  if (!user.roles.some((r) => ['admin', 'developer'].includes(r))) {
    mount.replaceChildren(pageHead({ title: t('task.title'), back: { onclick: () => go('/tasks') } }), emptyState(t('task.admin_only')));
    return;
  }
  const editingId = idParam && idParam !== 'new' ? parseInt(idParam, 10) : null;
  mount.append(spinner());

  const [existing, { members }] = await Promise.all([
    editingId ? api.task(editingId) : Promise.resolve(null),
    api.members().catch(() => ({ members: [] })),
  ]);
  const tk = existing?.task || {};

  const title = el('input', { type: 'text', value: tk.title || '', required: true, id: 'tk-title', maxlength: 200 });
  const description = el('textarea', { id: 'tk-desc', rows: 4 });
  description.value = tk.description || '';
  const assignee = el('select', { id: 'tk-assignee' }, el('option', { value: '', text: t('task.unassigned') }),
    ...members.filter((m) => m.status !== 'pending_approval').map((m) => el('option', { value: m.id, text: m.username, selected: Number(tk.assignee_id) === Number(m.id) })));
  const priority = el('select', { id: 'tk-prio' }, ...['normal', 'high', 'urgent'].map((p) => el('option', { value: p, text: t('prio.' + p), selected: (tk.priority || 'normal') === p })));
  const status = el('select', { id: 'tk-status' }, ...STATES.map((s) => el('option', { value: s, text: t('task.status.' + s), selected: (tk.status || 'open') === s })));
  const dueDate = el('input', { type: 'date', value: tk.due_date || '', id: 'tk-due' });

  const back = () => go(editingId ? '/tasks/' + editingId : '/tasks');
  const submit = el('button.btn.primary.lux', { type: 'submit' }, uiIcon('floppy-disk'), el('span', { text: editingId ? t('dino.save') : t('dino.create') }));
  const form = el('form.ark-panel.task-form', { onsubmit: async (e) => {
    e.preventDefault();
    if (!title.value.trim()) { toast(t('common.name_required'), 'err'); return; }
    submit.disabled = true;
    const body = { title: title.value.trim(), description: description.value.trim(), assigneeId: assignee.value || null, priority: priority.value, status: status.value, dueDate: dueDate.value || null };
    try {
      const result = editingId ? await api.updateTask(editingId, body) : await api.createTask(body);
      toast(editingId ? t('task.saved') : t('task.created'));
      go('/tasks/' + result.task.id, true);
    } catch (err) { toast(err.message, 'err'); submit.disabled = false; }
  } },
    el('header.ark-panel-head', {}, uiIcon(editingId ? 'pencil-simple' : 'plus-circle', 'ark-panel-icon'), el('h2', { text: editingId ? t('task.edit') : t('task.new') })),
    el('div.form-grid', {},
      el('div.field.span-2', {}, el('label', { for: 'tk-title', text: t('task.title_label') }), title),
      el('div.field.span-2', {}, el('label', { for: 'tk-desc', text: t('task.description') }), description),
      el('div.field', {}, el('label', { for: 'tk-assignee', text: t('task.assignee') }), assignee),
      el('div.field', {}, el('label', { for: 'tk-due', text: t('task.due_date') }), dueDate),
      el('div.field', {}, el('label', { for: 'tk-prio', text: t('task.priority') }), priority),
      el('div.field', {}, el('label', { for: 'tk-status', text: t('task.status_label') }), status)),
    el('div.form-actions', {}, el('button.btn.ghost', { type: 'button', text: t('common.cancel'), onclick: back }), submit));

  mount.replaceChildren(
    pageHead({ title: editingId ? t('task.edit') : t('task.new'), sub: t('task.form_sub'), icon: 'check-square', back: { onclick: back } }),
    form
  );
  title.focus();
}

/* ========================================================================== */
/* Detailansicht mit Kommentaren                                              */
/* ========================================================================== */

export async function renderTaskDetail(mount, ctx, idParam) {
  const { go, user } = ctx;
  const isAdmin = user.roles.includes('admin') || user.roles.includes('developer');
  const id = parseInt(idParam, 10);
  mount.append(spinner());
  let data, members;
  try {
    [{ task: data }, { members }] = await Promise.all([api.task(id), api.members().catch(() => ({ members: [] }))]);
  } catch (err) {
    mount.replaceChildren(pageHead({ title: t('task.title'), back: { onclick: () => go('/tasks') } }), emptyState(err.message));
    return;
  }
  const assignee = members.find((m) => Number(m.id) === Number(data.assignee_id));
  const canClaim = !data.assignee_id && data.status === 'open';
  const canComplete = ['open', 'in_progress'].includes(data.status) && (isAdmin || Number(data.assignee_id) === Number(user.id));

  const commentsBox = el('div.comment-list');
  const commentInput = el('input', { type: 'text', placeholder: t('order.comment_ph'), 'aria-label': t('order.comment_ph'), maxlength: 1000 });
  const sendBtn = el('button.send-btn', { type: 'submit', 'aria-label': t('order.send'), title: t('order.send') }, uiIcon('paper-plane-tilt'));

  function drawComments() {
    commentsBox.replaceChildren(
      ...(data.comments.length
        ? data.comments.map((c) => el('div.comment-row' + (Number(c.author_id) === Number(user.id) ? '.mine' : ''), {},
            avatar(c.author_name, { size: 'sm' }),
            el('div.comment-copy', {},
              el('div.comment-meta', {}, el('strong', { text: c.author_name }), el('small', { text: fmtStamp(c.created_at) })),
              el('p', { text: c.body }))))
        : [el('p.comment-empty', {}, uiIcon('chat-circle-dots'), el('span', { text: t('order.no_comments') }))])
    );
  }

  const composer = el('form.inline-composer', { onsubmit: async (e) => {
    e.preventDefault();
    if (!commentInput.value.trim()) return;
    sendBtn.disabled = true;
    try {
      await api.addTaskComment(id, { body: commentInput.value.trim() });
      commentInput.value = '';
      data = (await api.task(id)).task;
      drawComments();
    } catch (err) { toast(err.message, 'err'); }
    finally { sendBtn.disabled = false; }
  } }, commentInput, sendBtn);

  const partnerBoxes = members
    .filter((m) => Number(m.id) !== Number(user.id) && m.status !== 'pending_approval')
    .map((m) => {
      const box = el('input', { type: 'checkbox', value: String(m.id), id: 'partner-' + m.id });
      return { id: m.id, node: el('label.task-partner', { for: 'partner-' + m.id }, box, avatar(m.username, { size: 'sm' }), el('span', { text: m.username })), box };
    });
  const finishPanel = canComplete
    ? panel({ title: t('task.complete_title'), icon: 'check-circle', className: 'task-finish' },
        el('p.hint', { text: t('task.partners_hint') }),
        partnerBoxes.length ? el('div.task-partners', {}, ...partnerBoxes.map((p) => p.node)) : null,
        el('button.btn.primary.lux', {
          type: 'button',
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            try {
              await api.completeTask(id, partnerBoxes.filter((p) => p.box.checked).map((p) => p.id));
              toast(t('task.completed'));
              go('/tasks/' + id, true);
            } catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
          },
        }, uiIcon('check-circle'), el('span', { text: t('task.complete') }))
      )
    : null;

  const claimBtn = canClaim ? el('button.btn.primary.lux', {
    type: 'button', onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { await api.claimTask(id); toast(t('task.claimed')); go('/tasks/' + id, true); }
      catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
    },
  }, uiIcon('check-circle'), el('span', { text: t('task.claim') })) : null;

  const menu = isAdmin ? kebabMenu([
    { label: t('common.edit'), icon: 'pencil-simple', onclick: () => go('/tasks/' + id + '/edit') },
    { label: t('common.delete'), icon: 'trash', danger: true, onclick: async () => {
      const ok = await confirmDialog({ title: t('task.delete_confirm', { title: data.title }), danger: true });
      if (!ok) return;
      try { await api.deleteTask(id); toast(t('task.deleted')); go('/tasks'); }
      catch (err) { toast(err.message, 'err'); }
    } },
  ], t('task.more')) : null;

  const fact = (label, value) => el('div.fact', {}, el('dt', { text: label }), el('dd', {}, value));

  mount.replaceChildren(
    pageHead({ title: data.title, sub: `${t('task.status_label')}: ${t('task.status.' + data.status)}`, icon: 'check-square', back: { onclick: () => go('/tasks') }, actions: [claimBtn, menu] }),
    el('div.task-detail-grid', {},
      el('div.task-detail-main', {},
        panel({ title: t('task.info'), icon: 'clipboard-text' },
          el('div.task-summary', {},
            taskThumb(data),
            el('div', {},
              el('h2', { text: data.title }),
              data.description ? el('p', { text: data.description }) : null,
              el('div.chips', {}, statusPill(data.status), data.priority !== 'normal' ? pill(t('prio.' + data.priority), PRIO_TONE[data.priority]) : null)))),
        finishPanel,
        panel({ title: t('task.comments'), icon: 'chat-circle-dots', count: data.comments.length }, commentsBox, composer)),
      el('aside.task-detail-side', {},
        panel({ title: t('order.status_label'), icon: 'info' },
          el('dl.fact-list', {},
            fact(t('task.status_label'), statusPill(data.status)),
            fact(t('task.priority'), pill(t('prio.' + data.priority), PRIO_TONE[data.priority] || 'muted')),
            fact(t('task.assignee'), assignee
              ? el('span.fact-person', {}, avatar(assignee.username, { size: 'sm' }), el('span', { text: assignee.username }))
              : el('span.fact-muted', { text: t('task.unassigned') })),
            fact(t('task.due_date'), dueLabel(data)),
            data.partners?.length ? fact(t('task.partners'), el('span', { text: data.partners.map((p) => p.username).join(', ') })) : null,
            data.created_at ? fact(t('order.created_at'), el('span', { text: timeAgo(data.created_at) })) : null))))
  );
  drawComments();
}
