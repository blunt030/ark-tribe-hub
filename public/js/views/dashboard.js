import { el, spinner, orderCard, emptyState, statusBadge, priorityBadge } from '../ui.js';
import { t, timeAgo } from '../i18n.js';
import { api } from '../api.js';

/**
 * Ein Dashboard, das sich nach den Rollen richtet. Ein Benutzer kann mehrere
 * Rollen gleichzeitig haben (z. B. Admin + Breeder/Crafter) – dann werden die
 * passenden Abschnitte untereinander gezeigt, statt ihn zu zwingen, zwischen
 * getrennten Ansichten zu wechseln.
 */
export async function renderDashboard(mount, ctx) {
  const { user, go } = ctx;
  mount.append(spinner());

  const isDev = user.roles.includes('developer');
  const isAdmin = user.roles.includes('admin');
  const isBreeder = user.roles.includes('breeder_crafter');

  const [orders, notifications, members] = await Promise.all([
    api.orders().catch(() => ({ orders: [] })),
    api.notifications().catch(() => ({ notifications: [] })),
    isAdmin && !isDev ? api.members().catch(() => ({ members: [] })) : Promise.resolve({ members: [] }),
  ]);

  const all = orders.orders;
  const unread = notifications.notifications.filter((n) => !n.is_read).length;
  const pendingMembers = members.members.filter((m) => m.status === 'pending_approval');

  mount.replaceChildren();

  const sub = isDev ? 'dash.sub_dev' : isAdmin ? 'dash.sub_admin' : isBreeder ? 'dash.sub_breeder' : 'dash.sub_member';

  mount.append(
    el('div.page-head', {},
      el('div', {},
        el('h1', { text: t('dash.welcome', { name: user.username }) }),
        el('p', { text: t(sub) })
      ),
      el('button.btn.primary', { text: '+ ' + t('order.new'), onclick: () => go('/orders/new') })
    )
  );

  // --- Kennzahlen, je nach Rolle unterschiedlich zusammengesetzt ------------
  const mine = all.filter((o) => o.member_id === user.id);
  const openAll = all.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const unclaimed = openAll.filter((o) => !o.assigned_to);
  const claimedByMe = all.filter((o) => o.assigned_to === user.id && !['completed', 'cancelled'].includes(o.status));
  const urgent = openAll.filter((o) => o.priority === 'urgent');

  const stats = [];
  if (isBreeder || isAdmin || isDev) {
    stats.push(stat(unclaimed.length, t('dash.open_jobs'), 'accent-gold'));
    stats.push(stat(claimedByMe.length, t('dash.mine')));
    stats.push(stat(urgent.length, t('dash.urgent'), 'accent-red'));
  } else {
    stats.push(stat(mine.filter((o) => !['completed', 'cancelled'].includes(o.status)).length, t('dash.active'), 'accent-gold'));
    stats.push(stat(mine.filter((o) => o.status === 'completed').length, t('dash.done'), 'accent-green'));
  }
  stats.push(stat(unread, t('dash.unread'), unread > 0 ? 'accent-blue' : ''));
  if (isAdmin && !isDev) {
    stats.push(stat(pendingMembers.length, t('dash.pending_members'), pendingMembers.length ? 'accent-red' : ''));
  }
  mount.append(el('div.grid.stats', {}, ...stats));

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
}

function stat(n, label, accent = '') {
  return el('div.stat' + (accent ? '.' + accent : ''), {},
    el('div.n', { text: String(n) }),
    el('div.l', { text: label })
  );
}
