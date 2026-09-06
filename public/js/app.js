import { el, clear, spinner, toast } from './ui.js';
import { t, getLang, setLang, LANGS } from './i18n.js';
import { api, setCsrf, ApiError } from './api.js';
import { renderAuth, renderPending } from './views/auth.js';
import { renderDashboard } from './views/dashboard.js';
import { renderOrders, renderNewOrder, renderOrderDetail } from './views/orders.js';
import {
  renderNotifications, renderProfile, renderMembers,
  renderAudit, renderTribes, renderUsers, renderCatalog, renderNews,
} from './views/misc.js';
import { renderDinos, renderDinoForm, renderDinoDetail } from './views/dinos.js';
import { renderServers, renderServerDetail } from './views/servers.js';
import { renderTasks, renderTaskForm, renderTaskDetail } from './views/tasks.js';
import { renderInventory } from './views/inventory.js';
import { renderVoice } from './views/voice.js';

const root = document.getElementById('root');
let user = null;
let unreadCount = 0;

/* -------------------------------------------------------------------------- */
/* Navigation – wird aus den Rollen abgeleitet.                               */
/* Wichtig: Das Ausblenden eines Eintrags ist reine Bequemlichkeit. Die        */
/* eigentliche Absicherung passiert im Backend; wer eine URL von Hand eingibt, */
/* bekommt dort eine 403/404 und sieht hier nur eine leere Seite mit Hinweis.  */
/* -------------------------------------------------------------------------- */

function navItems() {
  const isDev = user.roles.includes('developer');
  const isAdmin = user.roles.includes('admin');
  const isBreeder = user.roles.includes('breeder_crafter');

  // Reihenfolge bewusst so: Startseite -> Neue Bestellung -> Offene Bestellungen ->
  // Profil zuerst (die vier meistgenutzten Punkte), Mitteilungen danach. Admin-/
  // Developer-Bereiche stehen separat in eigenen Gruppen weiter unten.
  const main = [
    { path: '/', icon: '◈', label: t('nav.dashboard') },
    { path: '/orders/new', icon: '＋', label: t('nav.new'), primary: true },
    { path: '/profile', icon: '◐', label: t('nav.profile') },
    { path: '/notifications', icon: '◔', label: t('nav.notifications'), badge: () => unreadCount },
  ];

  // Geteilte Tribe-Werkzeuge. Bewusst NICHT mehr "!isDev": Ein Developer, der auch
  // einem Tribe angehört, soll die Werkzeuge genauso sehen - sonst wären alle
  // Module für ihn unsichtbar. Entscheidend ist allein, ob ein Tribe vorhanden ist,
  // denn die Werkzeuge arbeiten alle tribe-bezogen.
  const tools = [];
  if (user.tribeId) {
    tools.push({ path: '/dinos', icon: '🦖', label: t('nav.dinos') });
    tools.push({ path: '/servers', icon: '🗺️', label: t('nav.servers') });
    tools.push({ path: '/tasks', icon: '✓', label: t('nav.tasks') });
    tools.push({ path: '/inventory', icon: '📦', label: t('nav.inventory') });
    tools.push({ path: '/voice', icon: '🎙️', label: t('nav.voice') });
  } else if (isDev) {
    // Developer haben plattformweite Rechte, aber KEINEN eigenen Tribe - die
    // Werkzeuge arbeiten aber alle tribe-bezogen. Sie hier trotzdem zu zeigen ist
    // besser als sie spurlos wegzulassen: der Developer sieht, dass es sie gibt,
    // und die Seite erklärt dann, dass dafür ein Tribe-Konto nötig ist.
    tools.push({ path: '/dinos', icon: '🦖', label: t('nav.dinos') });
    tools.push({ path: '/servers', icon: '🗺️', label: t('nav.servers') });
    tools.push({ path: '/tasks', icon: '✓', label: t('nav.tasks') });
    tools.push({ path: '/inventory', icon: '📦', label: t('nav.inventory') });
    tools.push({ path: '/voice', icon: '🎙️', label: t('nav.voice') });
  }

  const tribe = [];
  if (isAdmin) {
    tribe.push({ path: '/members', icon: '⚌', label: t('nav.members') });
    tribe.push({ path: '/news', icon: '📰', label: t('nav.news') });
    tribe.push({ path: '/audit', icon: '⎙', label: t('nav.audit') });
  }

  const platform = [];
  if (isDev) {
    platform.push({ path: '/tribes', icon: '⬢', label: t('nav.tribes') });
    platform.push({ path: '/users', icon: '⚏', label: t('nav.users') });
    platform.push({ path: '/catalog', icon: '⌗', label: t('nav.catalog') });
  }

  return { main, tools, tribe, platform, isBreeder };
}

function buildShell() {
  const { main, tools, tribe, platform } = navItems();
  const collapsed = localStorage.getItem('ath_sidebar_collapsed') === '1';

  const navLink = (item) => {
    const a = el('a', { href: '#' + item.path, dataset: { path: item.path } },
      el('span.ico', { text: item.icon }),
      el('span', { text: item.label })
    );
    const n = item.badge ? item.badge() : 0;
    if (n > 0) a.append(el('span.count', { text: String(n) }));
    return a;
  };

  const sidebar = el('aside.sidebar' + (collapsed ? '.collapsed' : ''), {},
    el('div.brand', {},
      el('button.brand-link', {
        title: t('nav.dashboard'),
        'aria-label': t('nav.dashboard'),
        onclick: () => go('/'),
      }, el('img', { src: '/assets/logo.png', alt: 'ARK Tribe Hub', width: '42', height: '42' })),
      // Tribe und eigener Rang direkt neben dem Logo (Punkt 19). Beides kommt aus
      // der aktuellen Sitzung, nichts fest verdrahtet. Beim eingeklappten
      // Seitenmenue wird der Block per CSS ausgeblendet.
      el('div.brand-ident', {},
        el('div.bi-tribe', { text: user.tribeName || t('nav.group.platform') }),
        el('div.bi-role', { text: (user.roles || []).map((r) => t('role.' + r)).join(', ') })
      ),
      el('button.sidebar-toggle', {
        title: t('nav.collapse'),
        'aria-label': t('nav.collapse'),
        onclick: () => {
          const nowCollapsed = !sidebar.classList.contains('collapsed');
          sidebar.classList.toggle('collapsed', nowCollapsed);
          localStorage.setItem('ath_sidebar_collapsed', nowCollapsed ? '1' : '0');
        },
      }, '«')
    ),
    el('nav.nav', {},
      ...main.map(navLink),
      ...tools.map(navLink),
      ...(tribe.length ? [el('div.nav-group-label', { text: t('nav.group.tribe') }), ...tribe.map(navLink)] : []),
      ...(platform.length ? [el('div.nav-group-label', { text: t('nav.group.platform') }), ...platform.map(navLink)] : [])
    ),
    el('div.sidebar-foot', {},
      el('div.who', {}, el('b', { text: user.username }),
        el('span', { text: user.roles.map((r) => t('role.' + r)).join(', ') })
      ),
      el('div.chips', {},
        ...LANGS.map((l) =>
          el('button.btn.sm.ghost' + (getLang() === l.code ? ' primary' : ''), {
            text: l.code.toUpperCase(),
            title: l.label,
            'aria-label': l.label,
            onclick: () => { setLang(l.code); location.reload(); },
          })
        )
      ),
      el('button.btn.sm.ghost.logout-btn', { title: t('auth.logout'), onclick: signOut }, el('span', { text: t('auth.logout') })),
      el('p', { style: 'color:var(--faint);font-size:.7rem;margin:0', text: t('footer.by') })
    )
  );

  const topbar = el('header.topbar', {},
    el('button.tb-brand', {
      title: t('nav.dashboard'),
      'aria-label': t('nav.dashboard'),
      onclick: () => go('/'),
    }, el('img', { src: '/assets/logo.png', alt: 'ARK Tribe Hub' })),
    el('button.tb-btn', {
      'aria-label': t('nav.notifications'),
      onclick: () => go('/notifications'),
    }, '◔', unreadCount > 0 ? el('span.count', { text: String(unreadCount) }) : null)
  );

  const content = el('main.content', { id: 'view' });

  // Mobile Bottom-Nav: immer dieselben fünf Einträge, damit die Bedienung sich
  // nicht je nach Rolle verschiebt. Wichtig: Das Profil bleibt immer erreichbar -
  // dort hängen Sprache und Abmelden. Admin- und Plattformbereiche werden auf der
  // Profilseite verlinkt, statt einen der fünf Plätze zu verdrängen.
  // Mobile Leiste bewusst auf VIER feste Punkte begrenzt plus einen "Mehr"-Knopf.
  // Vorher standen dort fünf Punkte mit langen deutschen Labels nebeneinander -
  // auf schmalen Geräten wurde der letzte ("Mitteilungen") am rechten Rand
  // abgeschnitten. Mit den neuen Modulen wären es zehn geworden, was gar nicht
  // mehr in eine Zeile passt; alles Weitere liegt deshalb hinter "Mehr".
  const bottomMain = main.slice(0, 4);
  const bottomExtra = [...main.slice(4), ...tools, ...tribe, ...platform];

  const bottomLink = (item) => {
    const a = el('a', { href: '#' + item.path, dataset: { path: item.path } },
      el('span.ico', { text: item.icon }),
      el('span', { text: item.label })
    );
    const n = item.badge ? item.badge() : 0;
    if (n > 0) a.append(el('span.count', { text: String(n) }));
    return a;
  };

  const moreBtn = el('button.more-btn', { type: 'button' },
    el('span.ico', { text: '⋯' }),
    el('span', { text: t('nav.more') })
  );
  // Ungelesene Mitteilungen liegen jetzt hinter "Mehr" - der Zähler muss deshalb
  // auch am "Mehr"-Knopf auftauchen, sonst würde man sie auf dem Handy übersehen.
  if (unreadCount > 0) moreBtn.append(el('span.count', { text: String(unreadCount) }));

  moreBtn.addEventListener('click', () => {
    const sheet = el('div.sheet-bg', { onclick: (e) => { if (e.target === sheet) sheet.remove(); } },
      el('div.sheet', {},
        el('div.sheet-grip'),
        ...bottomExtra.map((item) =>
          el('a.sheet-item', { href: '#' + item.path, onclick: () => sheet.remove() },
            el('span.ico', { text: item.icon }),
            el('span', { text: item.label }),
            item.badge && item.badge() > 0 ? el('span.count', { text: String(item.badge()) }) : null
          )
        )
      )
    );
    document.getElementById('modal-root').append(sheet);
  });

  const bottomnav = el('nav.bottomnav', {},
    ...bottomMain.map(bottomLink),
    bottomExtra.length ? moreBtn : null
  );

  clear(root);
  root.append(el('div.app', {}, sidebar, el('div.main', {}, topbar, content, bottomnav)));
  return content;
}

function markActive(path) {
  const base = '/' + (path.split('/')[1] || '');
  document.querySelectorAll('[data-path]').forEach((a) => {
    const p = a.dataset.path;
    const isActive = p === path || (p !== '/' && base === p) || (p === '/' && path === '/');
    a.classList.toggle('active', isActive);
  });
}

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

const ROUTES = [
  { re: /^\/$/, view: renderDashboard },
  { re: /^\/orders$/, view: renderOrders },
  { re: /^\/orders\/new$/, view: renderNewOrder },
  { re: /^\/orders\/(\d+)$/, view: renderOrderDetail },
  { re: /^\/notifications$/, view: renderNotifications },
  { re: /^\/profile$/, view: renderProfile },
  { re: /^\/members$/, view: renderMembers },
  { re: /^\/news$/, view: renderNews },
  { re: /^\/dinos$/, view: renderDinos },
  { re: /^\/dinos\/new$/, view: renderDinoForm },
  { re: /^\/dinos\/(\d+)\/edit$/, view: renderDinoForm },
  { re: /^\/dinos\/(\d+)$/, view: renderDinoDetail },
  { re: /^\/servers$/, view: renderServers },
  { re: /^\/servers\/(\d+)$/, view: renderServerDetail },
  { re: /^\/tasks$/, view: renderTasks },
  { re: /^\/tasks\/new$/, view: renderTaskForm },
  { re: /^\/tasks\/(\d+)\/edit$/, view: renderTaskForm },
  { re: /^\/tasks\/(\d+)$/, view: renderTaskDetail },
  { re: /^\/inventory$/, view: renderInventory },
  { re: /^\/voice$/, view: renderVoice },
  { re: /^\/audit$/, view: renderAudit },
  { re: /^\/tribes$/, view: renderTribes },
  { re: /^\/users$/, view: renderUsers },
  { re: /^\/catalog$/, view: renderCatalog },
];

export function go(path, replace = false) {
  if (replace) location.replace('#' + path);
  else location.hash = path;
  if (('#' + path) === location.hash) route();
}

async function route() {
  if (!user) return;
  const path = location.hash.slice(1) || '/';
  const match = ROUTES.find((r) => r.re.test(path));

  const view = document.getElementById('view') || buildShell();
  view.replaceChildren();
  markActive(path);
  window.scrollTo(0, 0);

  if (!match) { view.append(el('div.empty', {}, el('div.big', { text: '404' }))); return; }

  // Tribe-Werkzeuge brauchen einen Tribe. Ein Developer hat plattformweite Rechte,
  // aber kein eigenes Tribe-Konto - statt einer leeren oder kaputten Seite bekommt
  // er hier eine klare Erklärung, warum das so ist und was zu tun ist.
  const TRIBE_ONLY = /^\/(dinos|servers|tasks|inventory|voice)(\/|$)/;
  if (TRIBE_ONLY.test(path) && !user.tribeId) {
    view.append(
      el('div.empty', {},
        el('div.big', { text: t('tools.needs_tribe_title') }),
        el('p', { text: t('tools.needs_tribe_body') })
      )
    );
    return;
  }

  const params = path.match(match.re).slice(1);
  try {
    await match.view(view, ctx(), ...params);
  } catch (err) {
    view.replaceChildren(
      el('div.empty', {},
        el('div.big', { text: err instanceof ApiError ? err.message : t('common.error') })
      )
    );
  }
}

function ctx() {
  return { user, go, onSignOut: signOut, refreshBadges, reloadUser: loadUser };
}

async function refreshBadges() {
  try {
    const { notifications } = await api.notifications();
    unreadCount = notifications.filter((n) => !n.is_read).length;
    // Zähler an Ort und Stelle aktualisieren, ohne die ganze Seite neu zu bauen.
    document.querySelectorAll('[data-path="/notifications"]').forEach((a) => {
      a.querySelector('.count')?.remove();
      if (unreadCount > 0) a.append(el('span.count', { text: String(unreadCount) }));
    });
    const tb = document.querySelector('.topbar .tb-btn');
    if (tb) {
      tb.querySelector('.count')?.remove();
      if (unreadCount > 0) tb.append(el('span.count', { text: String(unreadCount) }));
    }
  } catch { /* Zähler ist nicht kritisch */ }
}

/* -------------------------------------------------------------------------- */
/* Sitzung                                                                     */
/* -------------------------------------------------------------------------- */

async function signOut() {
  try { await api.logout(); } catch { /* egal, lokal trotzdem abmelden */ }
  user = null;
  setCsrf(null);
  location.hash = '';
  showAuth();
}

function showAuth() {
  renderAuth(root, {
    onSignedIn: async (u) => {
      user = u;
      await afterSignIn();
    },
  });
}

async function afterSignIn() {
  if (user.status !== 'active') {
    renderPending(root, { user, onSignOut: signOut });
    return;
  }
  await refreshBadgesInitial();
  buildShell();
  await route();
}

async function refreshBadgesInitial() {
  try {
    const { notifications } = await api.notifications();
    unreadCount = notifications.filter((n) => !n.is_read).length;
  } catch { unreadCount = 0; }
}

async function loadUser() {
  const res = await api.me();
  user = res.user;
  if (res.csrfToken) setCsrf(res.csrfToken);
  return user;
}

async function boot() {
  try {
    // Die Session lebt im HttpOnly-Cookie und übersteht einen Reload; das
    // CSRF-Token kommt hier zurück, damit Aktionen sofort wieder funktionieren.
    await loadUser();
    await afterSignIn();
  } catch {
    showAuth();
  }
}

window.addEventListener('hashchange', route);
boot();

// Alle zwei Minuten den Mitteilungszähler nachziehen, solange der Tab sichtbar ist.
setInterval(() => {
  if (user && document.visibilityState === 'visible') refreshBadges();
}, 120000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA ist optional */ });
  });
}
