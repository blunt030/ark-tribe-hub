import { el, spinner, orderCard, emptyState, newsTicker } from '../ui.js';
import { t, timeAgo } from '../i18n.js';
import { api } from '../api.js';
import { chatMessage } from './community.js';

/**
 * Startseite nach dem Entwurf: Begruessung, Kacheln mit den wichtigsten Zahlen
 * (offene Bestellungen, eigene Aufgaben, Ungelesenes), Aktivitaetsverlauf,
 * Tribe- und Serverkachel sowie Schnellzugriff. Darunter weiterhin die
 * rollenabhaengigen Bestelllisten - ein Breeder/Crafter arbeitet genau daraus.
 *
 * Ein Benutzer kann mehrere Rollen gleichzeitig haben (z. B. Admin +
 * Breeder/Crafter) - dann werden die passenden Abschnitte untereinander gezeigt,
 * statt ihn zwischen getrennten Ansichten wechseln zu lassen.
 */
export async function renderDashboard(mount, ctx) {
  const { user, go } = ctx;
  mount.append(spinner());

  const isDev = user.roles.includes('developer');
  const isAdmin = user.roles.includes('admin');
  const isBreeder = user.roles.includes('breeder_crafter');
  // Tribe-Inhalte hängen vom tatsächlichen Tribe-Kontext ab, auch bei Developern.
  const hatTribe = Boolean(user.tribeId);

  const [orders, notifications, members, newsRes, tasksRes, serversRes, tribeRes, chatRes] = await Promise.all([
    api.orders().catch(() => ({ orders: [] })),
    api.notifications().catch(() => ({ notifications: [] })),
    isAdmin && hatTribe ? api.members().catch(() => ({ members: [] })) : Promise.resolve({ members: [] }),
    api.news().catch(() => ({ news: [] })),
    hatTribe ? api.tasks().catch(() => ({ tasks: [] })) : Promise.resolve({ tasks: [] }),
    hatTribe ? api.servers().catch(() => ({ servers: [] })) : Promise.resolve({ servers: [] }),
    hatTribe ? api.myTribe().catch(() => null) : Promise.resolve(null),
    hatTribe ? api.chatMessages({ limit: 3 }).catch(() => null) : Promise.resolve(null),
  ]);

  const all = orders.orders;
  const unread = notifications.notifications.filter((n) => !n.is_read).length;
  const pendingMembers = members.members.filter((m) => m.status === 'pending_approval');

  mount.replaceChildren();

  const ticker = newsTicker(newsRes.news);
  if (ticker) mount.append(ticker);

  const sub = isDev ? 'dash.sub_dev' : isAdmin ? 'dash.sub_admin' : isBreeder ? 'dash.sub_breeder' : 'dash.sub_member';

  // --- Begruessung ---------------------------------------------------------
  // Der Name bleibt in der h1: sie ist die Ueberschrift der Seite, und genau
  // daran erkennt man beim Anmelden sofort, mit welchem Konto man drin ist.
  mount.append(
    el('div.page-head', {},
      el('div', {},
        el('h1', { text: t('dash.welcome_back', { name: user.username }) }),
        el('p', { text: t(sub) })
      ),
      el('button.btn.primary', { text: '+ ' + t('order.new'), onclick: () => go('/orders/new') })
    )
  );

  const mine = all.filter((o) => o.member_id === user.id);
  const openAll = all.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const unclaimed = openAll.filter((o) => !o.assigned_to);
  const claimedByMe = all.filter((o) => o.assigned_to === user.id && !['completed', 'cancelled'].includes(o.status));
  const urgent = openAll.filter((o) => o.priority === 'urgent');

  // Zugewiesene Aufgaben MUESSEN beim Zustaendigen auftauchen - vorher gab es
  // dafuer auf der Startseite keinen Platz, man musste die Aufgabenseite oeffnen
  // und selbst suchen.
  const meineAufgaben = tasksRes.tasks.filter(
    (tk) => tk.assignee_id === user.id && !['done', 'cancelled'].includes(tk.status)
  );

  // --- Kacheln -------------------------------------------------------------
  mount.append(
    el('div.tiles', {},
      kachel({
        head: t('dash.tile.orders'),
        value: openAll.length,
        sub: t('dash.orders_n', { n: openAll.length }),
        link: t('dash.show'),
        onclick: () => go('/orders'),
      }),
      hatTribe
        ? kachel({
            head: t('dash.tile.tasks'),
            value: meineAufgaben.length,
            sub: t('dash.tasks_open_n', { n: meineAufgaben.length }),
            link: t('dash.show'),
            onclick: () => go('/tasks'),
          })
        : null,
      kachel({
        head: t('dash.unread'),
        value: unread,
        sub: t('nav.notifications'),
        link: t('dash.show'),
        onclick: () => go('/notifications'),
      }),
      urgent.length
        ? kachel({
            head: t('dash.urgent'),
            value: urgent.length,
            sub: t('dash.orders_n', { n: urgent.length }),
            link: t('dash.show'),
            onclick: () => go('/orders'),
          })
        : null
    )
  );

  // --- Meine Aufgaben ------------------------------------------------------
  if (meineAufgaben.length) {
    mount.append(el('div.section-title', {}, t('dash.tile.tasks'), el('span.c', { text: meineAufgaben.length })));
    mount.append(
      el('div.list', {},
        ...meineAufgaben.slice(0, 5).map((tk) =>
          el('div.row', { style: 'cursor:pointer', role: 'button', tabindex: '0', onclick: () => go('/tasks/' + tk.id) },
            el('div.grow', {},
              el('div.rt', { text: tk.title }),
              el('div.rs', {
                text: [t('task.status.' + tk.status), tk.due_date ? t('task.due') + ' ' + tk.due_date : null]
                  .filter(Boolean).join(' · '),
              })
            )
          )
        )
      )
    );
  }

  // --- Aktivitaeten --------------------------------------------------------
  // Speist sich aus den eigenen Mitteilungen: genau dort steht, wer eine
  // Bestellung angelegt hat, was zugewiesen und was erledigt wurde.
  const aktivitaeten = notifications.notifications.slice(0, 6);
  mount.append(el('div.section-title', {}, t('dash.activities')));
  mount.append(
    el('div.card', {},
      aktivitaeten.length
        ? el('div.feed', {},
            ...aktivitaeten.map((n) =>
              el('div.feed-item' + (n.is_read ? '' : '.unread'), {},
                el('span.fi-dot'),
                el('div.fi-body', {},
                  el('div.fi-text', { text: t('n.' + n.type) }),
                  el('div.fi-time', { text: timeAgo(n.created_at) })
                )
              )
            )
          )
        : el('p.hint', { style: 'padding:4px 0', text: t('dash.no_activities') })
    )
  );

  if (hatTribe) {
    mount.append(el('div.section-title', {}, t('nav.chat') + ' · General'),
      el('div.card', {}, ...(chatRes?.messages || []).map(chatMessage),
        chatRes && !chatRes.messages.length ? el('p.hint', { text: t('chat.empty') }) : null,
        el('button.btn', { text: t('dash.show'), onclick: () => go('/chat') })));
  }

  // --- Tribe und Server ----------------------------------------------------
  if (hatTribe) {
    const server = serversRes.servers[0];
    mount.append(
      el('div.tiles', { style: 'margin-top:16px' },
        kachel({
          head: t('dash.tribe'),
          value: tribeRes?.tribe?.name || '—',
          // Die Mitgliederzahl steht nur Admins zur Verfuegung; erfunden wird
          // hier nichts. Wer sie nicht abrufen darf, sieht stattdessen die Rolle.
          sub: isAdmin ? t('dash.members_n', { n: members.members.length }) : t('role.' + user.roles[0]),
          link: isAdmin ? t('dash.show') : null,
          onclick: isAdmin ? () => go('/members') : null,
        }),
        kachel({
          head: t('dash.server'),
          value: server?.map_name || '—',
          sub: server?.name || t('dash.no_server'),
          link: t('dash.show'),
          onclick: () => go('/servers'),
        })
      )
    );
  }

  // --- Hinweis für Admins: wartende Mitglieder -----------------------------
  if (isAdmin && pendingMembers.length > 0) {
    mount.append(
      el('div.section-title', {}, t('admin.pending'), el('span.c', { text: pendingMembers.length })),
      el('div.list', {},
        ...pendingMembers.slice(0, 4).map((m) =>
          el('div.row', {},
            el('div.grow', {}, el('div.rt', { text: m.username }), el('div.rs', { text: timeAgo(m.created_at) })),
            el('button.btn.sm', { text: t('admin.members'), onclick: () => go('/members') })
          )
        )
      )
    );
  }

  // --- Offene Aufträge (Breeder/Crafter, Admin) ----------------------------
  if (isBreeder || isAdmin || isDev) {
    mount.append(el('div.section-title', {}, t('dash.open_jobs'), el('span.c', { text: unclaimed.length })));
    mount.append(
      unclaimed.length
        ? el('div.grid.cols2', {}, ...unclaimed.slice(0, 6).map((o) => orderCard(o, (id) => go('/orders/' + id))))
        : emptyState(t('orders.none_open'))
    );

    if (claimedByMe.length) {
      mount.append(el('div.section-title', {}, t('dash.my_jobs'), el('span.c', { text: claimedByMe.length })));
      mount.append(el('div.grid.cols2', {}, ...claimedByMe.map((o) => orderCard(o, (id) => go('/orders/' + id)))));
    }
  }

  // --- Eigene Bestellungen -------------------------------------------------
  const recentMine = mine.slice(0, 4);
  mount.append(el('div.section-title', {}, t('dash.recent')));
  mount.append(
    recentMine.length
      ? el('div.grid.cols2', {}, ...recentMine.map((o) => orderCard(o, (id) => go('/orders/' + id))))
      : emptyState(t('orders.none'), t('orders.none_sub'))
  );

  // --- Schnellzugriff ------------------------------------------------------
  const schnell = [['/orders/new', t('order.new')], ['/orders', t('nav.orders')]];
  if (hatTribe) {
    schnell.push(
      ['/tasks', t('nav.tasks')],
      ['/inventory', t('nav.inventory')],
      ['/servers', t('nav.servers')],
      ['/voice', t('nav.voice')],
      ['/chat', t('nav.chat')],
      ['/alliances', t('nav.alliances')]
    );
  }
  schnell.push(['/profile', t('nav.profile')]);

  mount.append(
    el('div.section-title', {}, t('dash.quick')),
    el('div.quick', {},
      ...schnell.map(([pfad, label]) =>
        el('button.quick-btn', { type: 'button', onclick: () => go(pfad) },
          el('span', { text: label })
        )
      )
    )
  );
}

function kachel({ head, value, sub, link, onclick }) {
  return el('div.tile', {},
    el('div.t-head', {}, el('span', { text: head })),
    el('div.t-val', { text: String(value) }),
    sub ? el('div.t-sub', { text: sub }) : null,
    link && onclick ? el('button.t-link', { type: 'button', text: link + ' →', onclick }) : null
  );
}
