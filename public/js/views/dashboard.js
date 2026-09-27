import { el, spinner, orderCard, panel, avatar, avatarSrc, emptyBlock, preferredServer, roleOf } from '../ui.js';
import { presenceBar } from './community.js';
import { t, timeAgo, fmtStamp, isPastDay } from '../i18n.js';
import { api } from '../api.js';
import { mitgeliefertesKartenbild } from '../map-images.js';
import { uiIcon } from '../ui-icons.js';
import { markerKind, MARKER_KINDS, mapBoard } from './servers.js';

/**
 * Startseite als Tribe-Kommandozentrale nach der freigegebenen Vorlage:
 * kompakter Hero, vier Kennzahlen, drei bebilderte Bestellungen, aktive Karte,
 * rechts Tribe-Status, Chat und letzte Aktivitaet. Alle Zahlen stammen aus der
 * API - fehlende Werte (z. B. Online-Status) werden nicht erfunden.
 */
export async function renderDashboard(mount, ctx) {
  const { user, go } = ctx;
  mount.append(spinner());
  const isAdmin = user.roles.includes('admin');
  const hasTribe = Boolean(user.tribeId);
  const [ordersRes, notificationsRes, membersRes, newsRes, tasksRes, serversRes, tribeRes, chatRes, voiceRes, presenceRes] = await Promise.all([
    api.orders().catch(() => ({ orders: [] })),
    api.notifications().catch(() => ({ notifications: [] })),
    hasTribe ? api.members().catch(() => ({ members: [] })) : Promise.resolve({ members: [] }),
    api.news().catch(() => ({ news: [] })),
    hasTribe ? api.tasks().catch(() => ({ tasks: [] })) : Promise.resolve({ tasks: [] }),
    hasTribe ? api.servers().catch(() => ({ servers: [] })) : Promise.resolve({ servers: [] }),
    hasTribe ? api.myTribe().catch(() => null) : Promise.resolve(null),
    hasTribe ? api.chatMessages({ limit: 3 }).catch(() => null) : Promise.resolve(null),
    hasTribe ? api.voiceChannels().catch(() => ({ channels: [] })) : Promise.resolve({ channels: [] }),
    hasTribe ? api.presence().catch(() => null) : Promise.resolve(null),
  ]);
  const all = ordersRes.orders || [];
  const notifications = notificationsRes.notifications || [];
  const members = membersRes.members || [];
  const tasks = tasksRes.tasks || [];
  const servers = serversRes.servers || [];
  const server = preferredServer(servers, user);
  // Im Hero stehen alle Server, die der Tribe als aktiv gefuehrt hat.
  const activeServers = servers.filter((s) => s.status === 'active');
  const serverDetail = server ? await api.server(server.id).catch(() => ({ server })) : null;
  const markers = serverDetail?.server?.markers || [];
  const channels = voiceRes.channels || [];
  const inVoice = channels.reduce((sum, c) => sum + (c.participants || []).length, 0);
  const openAll = all.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const unclaimed = openAll.filter((o) => !o.assigned_to);
  const urgent = openAll.filter((o) => o.priority === 'urgent');
  const openTasks = tasks.filter((task) => !['done', 'cancelled'].includes(task.status));
  const doneTasks = tasks.filter((task) => task.status === 'done');
  // "Meine Aufgaben" zaehlt ueberall dasselbe: mir zugewiesen und nicht erledigt.
  const myTasks = openTasks.filter((task) => Number(task.assignee_id) === Number(user.id));
  const myOverdue = myTasks.filter((task) => task.due_date && isPastDay(task.due_date));
  const pendingMembers = isAdmin ? members.filter((member) => member.status === 'pending_approval') : [];
  // Mitglieder ohne Verwaltungsrecht erhalten nur aktive Konten (ohne Statusfeld).
  const activeMembers = members.filter((member) => !member.status || member.status === 'active');
  const unread = notifications.filter((notification) => !notification.is_read).length;
  const tribeName = tribeRes?.tribe?.name || user.tribeName || t('dash.tribe');

  mount.replaceChildren();

  /* ---------------------------------------------------------------- Hero */
  const heroImg = el('img.dash-hero-art', { src: '/assets/command-hero-v3.webp', alt: '', fetchpriority: 'high', decoding: 'async' });
  heroImg.addEventListener('error', () => { heroImg.src = '/assets/dashboard-hero.png'; }, { once: true });
  mount.append(el('section.dash-hero', {},
    heroImg,
    el('div.dash-hero-content', {},
      el('h1.dash-tribe-name', { text: hasTribe ? tribeName : t('dash.platform') }),
      el('div.dash-eyebrow', { text: t('dash.command') }),
      el('div.dash-hero-meta', {},
        activeServers.length ? heroServers(activeServers) : null,
        !server ? el('span', { text: hasTribe ? t('dash.no_server') : t('dash.welcome_back', { name: user.username }) }) : null
      ),
      el('button.btn.primary.lux.dash-hero-cta', { type: 'button', onclick: () => go('/orders/new') }, uiIcon('plus'), el('span', { text: t('order.new') }))
    ),
    el('div.dash-motto', { 'aria-hidden': 'true' }, el('span', { text: 'SURVIVE' }), el('span', { text: 'BUILD' }), el('span', { text: 'TAME' }), el('span', { text: 'TOGETHER' }))
  ));

  // Admins/Developer ohne Zwei-Faktor-Anmeldung bekommen einen Hinweis.
  if (isAdmin || user.roles.includes('developer')) {
    const twoFa = await api.twoFactor().catch(() => ({ enabled: true }));
    if (!twoFa.enabled) mount.append(el('div.dash-security-hint', { role: 'status' }, uiIcon('shield-check'),
      el('span', { text: t('mfa.dash_hint') }),
      el('button.btn.sm.primary', { type: 'button', onclick: () => go('/profile') }, el('span', { text: t('mfa.dash_action') }))));
  }

  /* ------------------------------------------------------------- Kacheln */
  mount.append(el('section.dash-metrics', { 'aria-label': t('dash.overview') },
    metric('duo-clipboard-text', openAll.length, t('dash.orders_open'), t('dash.orders_sub'), () => go('/orders'), 'orders'),
    hasTribe ? metric('duo-check-square', myTasks.length, t('dash.my_tasks'),
      myOverdue.length ? t('dash.overdue_n', { n: myOverdue.length }) : t('dash.none_overdue'), () => go('/tasks'), 'tasks') : null,
    metric('duo-warning', urgent.length, t('dash.urgent'), t('dash.urgent_sub'), () => go('/orders'), 'urgent'),
    metric('duo-bell', unread, t('nav.notifications'), unread ? t('notif.unread_n', { n: unread }) : t('dash.alerts_sub'), () => go('/notifications'), 'alerts')
  ));

  /* ----------------------------------------------------------- Links */
  const featured = [...openAll].sort((a, b) => (b.priority === 'urgent') - (a.priority === 'urgent')).slice(0, 3);
  const work = el('div.dash-left-column', {},
    panel({ title: t('dash.open_jobs'), icon: 'clipboard-text', link: t('dash.show_all'), onLink: () => go('/orders'), className: 'dash-work' },
      featured.length
        ? el('div.dash-featured-orders', {}, ...featured.map((o) => orderCard(o, (id) => go('/orders/' + id), { illustrated: true, compact: true })))
        : emptyBlock('clipboard-text', t('orders.none_open'), t('orders.none_sub'),
          el('button.btn.primary.sm', { type: 'button', onclick: () => go('/orders/new') }, uiIcon('plus'), el('span', { text: t('order.new') })))
    ),
    hasTribe ? panel({
      title: t('dash.active_server'), icon: 'map', className: 'dash-map',
      link: server ? `${server.map_name} · ${server.name}` : t('nav.servers'), onLink: () => go(server ? '/servers/' + server.id : '/servers'),
    },
      server ? dashMap(server, markers, go) : emptyBlock('map', t('dash.no_server'), null,
        el('button.btn.sm', { type: 'button', onclick: () => go('/servers') }, el('span', { text: t('nav.servers') })))
    ) : null
  );

  /* ---------------------------------------------------------- Rechts */
  const donePct = tasks.length ? Math.round(doneTasks.length / Math.max(1, doneTasks.length + openTasks.length) * 100) : 0;
  const voiceNames = channels.filter((c) => (c.participants || []).length).map((c) => c.name);
  const aside = el('aside.dash-aside', {},
    hasTribe ? panel({ title: t('dash.tribe_status'), icon: 'users', link: t('dash.details'), onLink: () => go('/members'), className: 'dash-tribe' },
      statusLine('users', activeMembers.length, t('dash.members_active'), () => go('/members'),
        el('div.status-avatars', {}, ...activeMembers.slice(0, 5).map((m) => avatar(m.username, { size: 'sm', src: avatarSrc(m) })),
          activeMembers.length > 5 ? el('span.status-more', { text: '+' + (activeMembers.length - 5) }) : null)),
      statusLine('microphone', inVoice, t('dash.voice_active'), () => go('/voice'),
        voiceNames.length ? el('div.status-chips', {}, uiIcon('waveform', 'status-wave'), ...voiceNames.slice(0, 3).map((n) => el('span.status-chip', { text: n })))
          : el('small.status-note', { text: t('dash.voice_none') })),
      statusLine('check-square', openTasks.length, t('dash.open_tasks'), () => go('/tasks'),
        el('div.status-bar', {}, el('div.ark-progress.is-green', {}, el('span', { style: `width:${donePct}%` })),
          el('small', { text: t('dash.done_pct', { n: doneTasks.length, p: donePct }) }))),
      statusLine('package', openAll.length, t('dash.orders_open'), () => go('/orders'),
        el('div.status-bar', {}, el('div.ark-progress', {}, el('span', { style: `width:${openAll.length ? Math.round((openAll.length - unclaimed.length) / openAll.length * 100) : 0}%` })),
          el('small', { text: t('dash.orders_free', { n: unclaimed.length }) }))),
      pendingMembers.length ? el('button.status-alert', { type: 'button', onclick: () => go('/members') },
        uiIcon('warning'), el('span', { text: t('dash.pending_requests', { n: pendingMembers.length }) }), uiIcon('caret-right')) : null
    ) : null,
    hasTribe ? chatPanel(chatRes?.messages || [], user, go, presenceBar(members, presenceRes), members) : null,
    activityPanel(notifications, newsRes.news || [], go)
  );
  mount.append(el('div.dash-main-grid', {}, work, aside));
}

function metric(icon, count, title, detail, onclick, kind) {
  return el('button.dash-metric.dash-metric-' + kind + (kind === 'urgent' && count ? '.is-urgent' : ''), { type: 'button', onclick },
    el('span.dash-metric-badge', {}, uiIcon(icon, 'dash-metric-icon')),
    el('span.dash-metric-copy', {}, el('strong', { text: String(count) }), el('span.dash-metric-label', { text: title }),
      el('span.dash-metric-detail', { text: detail })), uiIcon('caret-right', 'dash-metric-arrow'));
}

function statusLine(icon, count, title, onclick, side) {
  return el('button.dash-status-line', { type: 'button', onclick },
    uiIcon(icon, 'dash-status-icon'),
    el('span.dash-status-copy', {}, el('strong', { text: String(count) }), el('span', { text: title })),
    side || null);
}

function dashMap(server, markers, go) {
  const fallback = mitgeliefertesKartenbild(server.map_name);
  const src = server.map_image_path ? '/uploads/' + server.map_image_path : fallback;
  const used = [...new Set(markers.map((m) => markerKind(m.category)))];
  return el('div.dash-map-canvas', {},
    src ? mapBoard(src, fallback, markers.slice(0, 12), { onPin: () => go('/servers/' + server.id), labels: true, cover: true })
      : el('div.map-upload-empty', {}, el('strong', { text: t('srv.map_image_missing') })),
    el('div.map-compass', { 'aria-hidden': 'true' }, uiIcon('compass')),
    used.length ? el('div.map-legend', { 'aria-label': t('dash.legend') },
      ...used.map((kind) => el('span', {}, el('i.marker-dot.mk-' + kind, {}, uiIcon(MARKER_KINDS[kind].icon)), el('span', { text: t(MARKER_KINDS[kind].label) }))))
      : el('div.map-legend.is-empty', {}, el('span', { text: t('dash.no_markers') }))
  );
}

function chatPanel(messages, user, go, presence, members = []) {
  const previewMessages = [...messages];
  const previewLog = el('div.dashboard-chat-log', { role: 'log', 'aria-live': 'polite' });
  const chatStatus = el('p.hint', { role: 'status' });
  const chatInput = el('input', { id: 'dashboard-chat-body', type: 'text', maxlength: 2000, required: true, placeholder: t('chat.placeholder'), 'aria-label': t('chat.message'), autocomplete: 'off' });
  const chatSend = el('button.send-btn', { type: 'submit', 'aria-label': t('chat.send'), title: t('chat.send') }, uiIcon('paper-plane-tilt'));
  function drawChatPreview() {
    previewLog.replaceChildren(...(previewMessages.length
      ? previewMessages.slice(-3).map((message) => {
        const role = roleOf(members.find((m) => Number(m.id) === Number(message.author_id)));
        return el('div.dash-chat-row.role-' + role, {},
        avatar(message.author_name, { size: 'sm' }),
        el('span.dash-chat-copy', {}, el('span.dash-chat-meta', {}, el('strong', { text: message.author_name }), el('span.role-tag', { text: t('role.' + role) }),
          el('small', { text: fmtStamp(message.created_at) })), el('span', { text: message.body }))
      ); }) : [el('p.dash-empty-note', { text: t('chat.empty') })]));
  }
  drawChatPreview();
  return el('section.card.dashboard-chat-card.ark-panel', {},
    el('header.ark-panel-head', {}, uiIcon('chat-circle-dots', 'ark-panel-icon'), el('h2', { text: t('nav.chat') }),
      el('button.ark-panel-link', { type: 'button', onclick: () => go('/chat') }, el('span', { text: t('dash.all_messages') }), uiIcon('arrow-right'))),
    previewLog,
    el('form.dashboard-chat-composer', { onsubmit: async (event) => {
      event.preventDefault();
      const body = chatInput.value.trim();
      if (!body || chatSend.disabled) return;
      chatSend.disabled = true;
      chatInput.readOnly = true;
      try {
        const { message } = await api.sendChatMessage(body);
        previewMessages.push(message);
        chatInput.value = '';
        chatStatus.textContent = '';
        drawChatPreview();
      } catch (err) {
        chatStatus.textContent = err.message;
      } finally {
        chatSend.disabled = false;
        chatInput.readOnly = false;
        chatInput.focus();
      }
    } }, chatInput, chatSend, chatStatus),
    presence
  );
}

function activityPanel(notifications, news, go) {
  // News des Tribes stehen hier als Eintraege statt als Laufband ueber der Seite.
  const rows = [
    ...news.slice(0, 2).map((n) => ({ at: n.created_at, icon: 'newspaper', tone: n.priority === 'urgent' ? 'urgent' : n.priority === 'high' ? 'high' : 'news',
      label: t('dash.news'), text: n.body, onclick: () => go('/notifications') })),
    ...notifications.slice(0, 5).map((n) => ({ at: n.created_at, icon: activityIcon(n.type), tone: n.is_read ? 'read' : 'unread',
      text: t('n.' + n.type), detail: n.payload?.title || '', onclick: () => go(n.payload?.orderId ? '/orders/' + n.payload.orderId : n.payload?.taskId ? '/tasks/' + n.payload.taskId : '/notifications') })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5);
  return panel({ title: t('dash.last_activity'), icon: 'clock', link: t('dash.show_all'), onLink: () => go('/notifications'), className: 'dash-activity' },
    rows.length ? el('div.dash-activity-list', {}, ...rows.map((row) =>
      el('button.dash-activity-row.tone-' + row.tone, { type: 'button', onclick: row.onclick },
        uiIcon(row.icon, 'dash-activity-icon'),
        el('span.dash-activity-text', {}, row.label ? el('b', { text: row.label + ': ' }) : null, el('span', { text: row.text }),
          row.detail ? el('em', { text: ' · ' + row.detail }) : null),
        el('small', { text: timeAgo(row.at) })
      ))) : el('p.dash-empty-note', { text: t('dash.no_activities') }));
}

function activityIcon(type) {
  if (type.startsWith('task')) return 'check-square';
  if (type.startsWith('member')) return 'users';
  if (type === 'new_comment') return 'chat-circle-dots';
  if (type === 'order_completed') return 'check-circle';
  return 'clipboard-text';
}

// Kompakte Leiste der aktiven Server: Anzahl, hoechstens vier Eintraege,
// Map nur dann, wenn sie sich vom Servernamen unterscheidet.
function heroServers(list) {
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const shown = list.slice(0, 4);
  return el('div.hero-servers', {},
    el('div.hero-servers-head', {}, uiIcon('map'), el('span', { text: t('dash.active_servers') }), el('b', { text: String(list.length) })),
    el('div.hero-servers-list', {},
      ...shown.map((s) => el('a.hero-server-item', { href: '#/servers/' + s.id, title: `${s.name} · ${s.map_name}` },
        el('i', { 'aria-hidden': 'true' }), el('b', { text: s.name }), same(s.name, s.map_name) ? null : el('small', { text: s.map_name }))),
      list.length > shown.length ? el('a.hero-server-item.is-more', { href: '#/servers' }, el('span', { text: t('dash.more_servers', { n: list.length - shown.length }) })) : null));
}
