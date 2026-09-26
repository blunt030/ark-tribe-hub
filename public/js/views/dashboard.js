import { el, spinner, orderCard, emptyState, newsTicker } from '../ui.js';
import { t, timeAgo } from '../i18n.js';
import { api } from '../api.js';
import { mitgeliefertesKartenbild } from '../map-images.js';
import { itemBild } from '../icons.js';
import { uiIcon } from '../ui-icons.js';

/** Existing data and routes, presented as a tribe command center. */
export async function renderDashboard(mount, ctx) {
  const { user, go } = ctx;
  mount.append(spinner());
  const isAdmin = user.roles.includes('admin');
  const hasTribe = Boolean(user.tribeId);
  const [ordersRes, notificationsRes, membersRes, newsRes, tasksRes, serversRes, tribeRes, chatRes, voiceRes] = await Promise.all([
    api.orders().catch(() => ({ orders: [] })),
    api.notifications().catch(() => ({ notifications: [] })),
    isAdmin && hasTribe ? api.members().catch(() => ({ members: [] })) : Promise.resolve({ members: [] }),
    api.news().catch(() => ({ news: [] })),
    hasTribe ? api.tasks().catch(() => ({ tasks: [] })) : Promise.resolve({ tasks: [] }),
    hasTribe ? api.servers().catch(() => ({ servers: [] })) : Promise.resolve({ servers: [] }),
    hasTribe ? api.myTribe().catch(() => null) : Promise.resolve(null),
    hasTribe ? api.chatMessages({ limit: 3 }).catch(() => null) : Promise.resolve(null),
    hasTribe ? api.voiceChannels().catch(() => ({ channels: [] })) : Promise.resolve({ channels: [] }),
  ]);
  const all = ordersRes.orders || [];
  const notifications = notificationsRes.notifications || [];
  const members = membersRes.members || [];
  const tasks = tasksRes.tasks || [];
  const servers = serversRes.servers || [];
  const server = servers.find((s) => s.status === 'active') || servers[0];
  const serverDetail = server ? await api.server(server.id).catch(() => ({ server })) : null;
  const markers = serverDetail?.server?.markers || [];
  const channels = voiceRes.channels || [];
  const speaking = new Set(channels.flatMap((channel) => (channel.participants || []).map((participant) => participant.user_id)));
  const fallback = mitgeliefertesKartenbild(server?.map_name);
  const mapImage = server?.map_image_path ? '/uploads/' + server.map_image_path : fallback;
  const mine = all.filter((o) => o.member_id === user.id);
  const openAll = all.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const unclaimed = openAll.filter((o) => !o.assigned_to);
  const claimedByMe = openAll.filter((o) => o.assigned_to === user.id);
  const urgent = openAll.filter((o) => o.priority === 'urgent');
  const myTasks = tasks.filter((task) => task.assignee_id === user.id && !['done', 'cancelled'].includes(task.status));
  const pendingMembers = members.filter((member) => member.status === 'pending_approval');
  const unread = notifications.filter((notification) => !notification.is_read).length;
  const tribeName = tribeRes?.tribe?.name || user.tribeName || t('dash.tribe');

  mount.replaceChildren();
  const ticker = newsTicker(newsRes.news);
  mount.append(el('section.dash-hero', {},
    mapArtwork('/assets/command-hero-v3.webp', '/assets/dashboard-hero.png', true),
    el('div.dash-hero-content', {},
      el('h1', { text: hasTribe ? tribeName : t('dash.platform') }),
      el('div.dash-eyebrow', { text: t('dash.command') }),
      el('div.dash-hero-meta', {},
        server ? el('span', { text: server.name + ' · ' + server.map_name }) : null,
        server ? el('span.dash-live' + (server.status === 'active' ? '.is-active' : ''), { text: t('srv.status.' + server.status) }) : null,
        !server ? el('span', { text: hasTribe ? t('dash.no_server') : t('dash.welcome_back', { name: user.username }) }) : null
      ),
      el('div.dash-hero-actions', {},
        el('button.btn.primary.dash-hero-cta', { type: 'button', onclick: () => go('/orders/new') }, uiIcon('plus'), el('span', { text: t('order.new') }))
      )
    )
  ));
  if (ticker) { ticker.classList.add('dash-news'); mount.append(ticker); }
  mount.append(el('section.dash-metrics', { 'aria-label': t('dash.overview') },
    metric('▤', t('dash.tile.orders'), openAll.length, t('dash.available_n', { n: unclaimed.length }), () => go('/orders'), 'orders'),
    hasTribe ? metric('☑', t('dash.tile.tasks'), myTasks.length, t('dash.tasks_open_n', { n: myTasks.length }), () => go('/tasks'), 'tasks') : null,
    metric('⚠', t('dash.urgent'), urgent.length, t('dash.open_jobs'), () => go('/orders'), 'urgent'),
    metric('♧', t('nav.notifications'), unread, t('dash.unread'), () => go('/notifications'), 'alerts')
  ));

  const work = el('div.dash-left-column', {},
    el('section.dash-panel.dash-work', {},
      heading(t('dash.open_jobs'), null, t('dash.show'), () => go('/orders'), '▤'),
      openAll.length
        ? el('div.dash-featured-orders', {}, ...openAll.slice(0, 3).map((o) => featuredOrder(o, go)))
        : emptyState(t('orders.none_open'))
    ),
    hasTribe ? el('section.dash-panel.dash-map', {},
      heading(t('dash.current_map'), null, t('dash.show'), () => go('/servers'), '◇'),
      server ? el('div.dash-map-canvas', {},
        mapImage ? mapArtwork(mapImage, fallback) : null,
        el('button.dash-map-caption', { type: 'button', onclick: () => go('/servers/' + server.id) },
          el('strong', { text: server.map_name }), el('span', { text: server.name + ' ↗' })
        ),
        ...markers.filter((m) => m.coord_x != null && m.coord_y != null && Number.isFinite(Number(m.coord_x)) && Number.isFinite(Number(m.coord_y)))
          .slice(0, 10).map((m) => el('button.dash-map-pin', {
            type: 'button', style: `left:${Math.min(100, Math.max(0, Number(m.coord_x)))}%;top:${Math.min(100, Math.max(0, Number(m.coord_y)))}%`,
            title: m.name, 'aria-label': m.name, onclick: () => go('/servers/' + server.id)
          }, uiIcon(markerIcon(m.category)), el('small', { text: m.name })))
      ) : el('div.dash-map-empty', {},
        el('p', { text: t('dash.no_server') }),
        el('button.btn.sm', { type: 'button', text: t('nav.servers'), onclick: () => go('/servers') })
      )
    ) : null
  );
  const aside = el('aside.dash-aside', {},
    hasTribe ? el('section.dash-panel.dash-tribe', {},
      heading(t('dash.tribe_status'), null, t('dash.show'), () => go('/members'), '♟'),
      isAdmin ? statusLine('♙', t('nav.members'), members.filter((m) => m.status === 'active').length, () => go('/members')) : null,
      statusLine('♩', t('nav.voice'), speaking.size, () => go('/voice'),
        channels.filter((c) => (c.participants || []).length).map((c) => c.name).join(' · ')),
      statusLine('☑', t('dash.tile.tasks'), tasks.filter((task) => !['done', 'cancelled'].includes(task.status)).length, () => go('/tasks'),
        tasks.length ? t('dash.completed_n', { n: tasks.filter((task) => task.status === 'done').length }) : ''),
      statusLine('▤', t('dash.tile.orders'), openAll.length, () => go('/orders'))
    ) : null,
    hasTribe ? chatPanel(chatRes?.messages || [], user, go) : null,
    el('section.dash-panel.dash-activity', {},
      heading(t('dash.activities'), null, t('dash.show'), () => go('/notifications'), '◷'),
      notifications.length ? el('div.dash-activity-list', {}, ...notifications.slice(0, 4).map((n) =>
        el('button.dash-activity-row', { type: 'button', onclick: () => go(n.payload?.orderId ? '/orders/' + n.payload.orderId : '/notifications') },
          uiIcon('clipboard-text', 'dash-activity-dot'),
          el('span', {}, el('strong', { text: t('n.' + n.type) }), el('small', { text: timeAgo(n.created_at) }))
        ))) : el('p.dash-empty-note', { text: t('dash.no_activities') })
    )
  );
  mount.append(el('div.dash-main-grid', {}, work, aside));

  if (pendingMembers.length) mount.append(el('section.dash-panel.dash-attention', {},
    heading(t('admin.pending'), pendingMembers.length, t('dash.show'), () => go('/members')),
    ...pendingMembers.slice(0, 4).map((member) => el('div.dash-task-row', {},
      el('strong', { text: member.username }), el('span', { text: timeAgo(member.created_at) })
    ))
  ));

  if (myTasks.length) mount.append(el('section.dash-panel.dash-section', {},
    heading(t('dash.tile.tasks'), myTasks.length, t('dash.show'), () => go('/tasks')),
    ...myTasks.slice(0, 5).map((task) => el('button.dash-task-row', { type: 'button', onclick: () => go('/tasks/' + task.id) },
      el('strong', { text: task.title }),
      el('span', { text: [t('task.status.' + task.status), task.due_date ? t('task.due') + ' ' + task.due_date : null].filter(Boolean).join(' · ') })
    ))
  ));
  if (claimedByMe.length) mount.append(el('section.dash-section', {},
    heading(t('dash.my_jobs'), claimedByMe.length),
    el('div.dash-order-list', {}, ...claimedByMe.map((o) => orderCard(o, (id) => go('/orders/' + id), { showImages: true })))
  ));
  mount.append(el('section.dash-section', {},
    heading(t('dash.recent'), null, t('dash.show'), () => go('/orders')),
    mine.length ? el('div.dash-order-list', {}, ...mine.slice(0, 4).map((o) => orderCard(o, (id) => go('/orders/' + id), { showImages: true })))
      : emptyState(t('orders.none'), t('orders.none_sub'))
  ));
}

function mapArtwork(src, fallback, eager = false) {
  const image = el('img.dash-map-art', { src, alt: '', loading: eager ? 'eager' : 'lazy', fetchpriority: eager ? 'high' : 'auto' });
  image.addEventListener('error', () => {
    if (fallback && image.getAttribute('src') !== fallback) image.src = fallback;
    else image.remove();
  });
  return image;
}
function heading(title, count, action, onclick, icon) {
  return el('div.dash-heading', {}, icon ? uiIcon(icon, 'dash-heading-icon') : null, el('h2', { text: title }),
    count !== null && count !== undefined ? el('span.dash-count', { text: String(count) }) : null,
    action && onclick ? el('button.dash-heading-link', { type: 'button', onclick }, el('span', { text: action }), uiIcon('arrow-right')) : null);
}
function metric(icon, title, count, detail, onclick, kind) {
  return el('button.dash-metric.dash-metric-' + kind + (kind === 'urgent' && count ? '.is-urgent' : ''), { type: 'button', onclick },
    uiIcon(icon, 'dash-metric-icon'),
    el('span.dash-metric-copy', {}, el('strong', { text: String(count) }), el('span.dash-metric-label', { text: title }),
      el('span.dash-metric-detail', { text: detail })), uiIcon('caret-right', 'dash-metric-arrow'));
}
function featuredOrder(order, go) {
  const first = order.items?.[0];
  const title = first?.item_name || t('nav.orders');
  const image = first?.item_key === 'rex_egg' && !first.image_path
    ? el('img.dash-order-special', { src: '/assets/rex_egg_dashboard.webp', alt: '', loading: 'lazy' })
    : first ? itemBild(first, 120) : null;
  const opened = () => go('/orders/' + order.id);
  const issued = order.items?.filter((it) => it.status === 'issued').length || 0;
  const total = order.items?.length || 1;
  return el('article.dash-featured-order', { role: 'button', tabindex: '0', 'aria-label': title,
    onclick: opened, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opened(); } } },
    el('div.dash-order-art', {}, image,
      el('span.dash-order-type', { text: first ? t('type.' + first.product_type) : t('nav.orders') })),
    el('div.dash-order-body', {},
      el('strong.dash-order-title', { text: title }),
      el('span.dash-order-amount', { text: first ? '× ' + first.quantity + (total > 1 ? '  ·  +' + (total - 1) : '') : '' }),
      el('div.dash-order-progress', {}, el('span', { style: `width:${Math.round(issued / total * 100)}%` })),
      el('div.dash-order-foot', {}, el('span.dash-avatar', { 'aria-hidden': 'true', text: (order.member_username || '?').slice(0, 1).toUpperCase() }),
        el('span', { text: order.member_username || '' }), el('small', { text: timeAgo(order.created_at) }))
    )
  );
}
function markerIcon(category) {
  return { base: 'house', resource: 'mountains', cave: 'diamond', dino: 'skull', boss: 'warning', loot: 'diamond' }[category] || 'map';
}
function statusLine(icon, title, count, onclick, detail) {
  return el('button.dash-status-line', { type: 'button', onclick },
    uiIcon(icon, 'dash-status-icon'),
    el('span.dash-status-copy', {}, el('strong', { text: String(count) }), el('span', { text: title }),
      detail ? el('small', { text: detail }) : null));
}
function chatPanel(messages, user, go) {
  const previewMessages = [...messages];
  const previewLog = el('div.dashboard-chat-log', { role: 'log', 'aria-live': 'polite' });
  const chatStatus = el('p.hint', { role: 'status' });
  const chatInput = el('textarea', { id: 'dashboard-chat-body', rows: 1, maxlength: 2000, required: true, placeholder: t('chat.placeholder'), 'aria-label': t('chat.message') });
  const chatSend = el('button.btn.sm.primary', { type: 'submit', 'aria-label': t('chat.send') }, uiIcon('paper-plane-tilt'));
  function drawChatPreview() {
    previewLog.replaceChildren(...(previewMessages.length
      ? previewMessages.slice(-3).map((message) => el('div.dash-chat-row', {},
        el('span.dash-avatar', { 'aria-hidden': 'true', text: (message.author_name || '?').slice(0, 1).toUpperCase() }),
        el('span.dash-chat-copy', {}, el('span', {}, el('strong', { text: message.author_name }),
          el('small', { text: timeAgo(message.created_at) })), el('span', { text: message.body }))
      )) : [el('p.dash-empty-note', { text: t('chat.empty') })]));
  }
  drawChatPreview();
  return el('section.card.dashboard-chat-card.dash-panel', {},
    heading(t('nav.chat'), null, t('dash.show'), () => go('/chat'), '☷'),
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
    } }, chatInput, chatSend, chatStatus)
  );
}
