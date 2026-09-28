import { el, clear, spinner, toast, installPasswordToggles } from './ui.js';
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
import { renderAlliances, renderChat } from './views/community.js';
import { renderVoice } from './views/voice.js';
import { loadPet, onPetChange, petCalls, resetPet, savePet } from './tamagotchi/store.js';
import { uiIcon } from './ui-icons.js';
import { avatar, avatarSrc, visibleRoles } from './ui.js';

const root = document.getElementById('root');
let user = null;
let unreadCount = 0;
let idleLogoutTimer = null;
let idleWarningTimer = null;
let idleWatchBound = false;
const IDLE_LOGOUT_MS = 30 * 60 * 1000;
const IDLE_WARNING_MS = 28 * 60 * 1000;

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
    { path: '/orders', icon: '▤', label: t('nav.orders') },
    ...(user.tribeId ? [{ path: '/tasks', icon: '☑', label: t('nav.tasks') }, { path: '/servers', icon: '◇', label: t('nav.servers') },
      { path: '/chat', icon: '☷', label: t('nav.chat') }, { path: '/voice', icon: '♩', label: t('nav.voice') },
      { path: '/members', icon: '♙', label: t('nav.members') }] : []),
    { path: '/tamagotchi', icon: 'egg-crack', label: t('nav.tamagotchi'), badge: () => petCalls() },
    { path: '/profile', icon: '◐', label: t('nav.profile') },
    { path: '/notifications', icon: '◔', label: t('nav.notifications'), badge: () => unreadCount },
  ];

  // Geteilte Tribe-Werkzeuge. Bewusst NICHT mehr "!isDev": Ein Developer, der auch
  // einem Tribe angehört, soll die Werkzeuge genauso sehen - sonst wären alle
  // Module für ihn unsichtbar. Entscheidend ist allein, ob ein Tribe vorhanden ist,
  // denn die Werkzeuge arbeiten alle tribe-bezogen.
  const tools = [];
  if (user.tribeId) {
    tools.push({ path: '/alliances', icon: '🤝', label: t('nav.alliances') });
    tools.push({ path: '/dinos', icon: '▥', label: t('nav.animal_stats') });
  } else if (isDev) {
    // Developer haben plattformweite Rechte, aber KEINEN eigenen Tribe - die
    // Werkzeuge arbeiten aber alle tribe-bezogen. Sie hier trotzdem zu zeigen ist
    // besser als sie spurlos wegzulassen: der Developer sieht, dass es sie gibt,
    // und die Seite erklärt dann, dass dafür ein Tribe-Konto nötig ist.
    tools.push({ path: '/alliances', icon: '🤝', label: t('nav.alliances') });
    tools.push({ path: '/chat', icon: '☏', label: t('nav.chat') });
    tools.push({ path: '/servers', icon: '🗺️', label: t('nav.servers') });
    tools.push({ path: '/tasks', icon: '✓', label: t('nav.tasks') });
    tools.push({ path: '/dinos', icon: '▥', label: t('nav.animal_stats') });
    tools.push({ path: '/members', icon: '⚌', label: t('nav.members') });
    tools.push({ path: '/voice', icon: '🎙️', label: t('nav.voice') });
  }

  const tribe = [];
  if (isAdmin) {
    tribe.push({ path: '/news', icon: '📰', label: t('nav.news') });
    tribe.push({ path: '/audit', icon: '⎙', label: t('nav.audit') });
  }

  const platform = [];
  if (isDev) {
    platform.push({ path: '/tribes', icon: '⬢', label: t('nav.tribes') });
    platform.push({ path: '/users', icon: '⚏', label: t('nav.users') });
    platform.push({ path: '/catalog', icon: '⌗', label: t('nav.catalog') });
    platform.push({ path: '/tamagotchi-admin', icon: 'sliders-horizontal', label: t('nav.tamagotchi_admin') });
  }

  return { main, tools, tribe, platform, isBreeder };
}

function buildShell() {
  const { main, tools, tribe, platform } = navItems();
  const collapsed = localStorage.getItem('ath_sidebar_collapsed') === '1';
  const roleText = visibleRoles(user.roles || []).map((r) => t('role.' + r)).join(' · ');

  const navLink = (item) => {
    const a = el('a', { href: '#' + item.path, dataset: { path: item.path }, title: item.label },
      uiIcon(item.icon, 'ico'),
      el('span.nav-label', { text: item.label })
    );
    const n = item.badge ? item.badge() : 0;
    if (n > 0) a.append(el('span.count', { text: String(n) }));
    return a;
  };

  // Seitenleiste nach Vorlage: Logo oben, Navigation, kompakter Fuss. Das
  // Camp-Motiv liegt als reiner Hintergrund in der Leiste (CSS) und kann weder
  // Menuepunkte ueberdecken noch Klicks abfangen. Das Logo gibt es genau einmal.
  const sidebar = el('aside.sidebar' + (collapsed ? '.collapsed' : ''), {},
    el('div.brand', {},
      el('button.brand-link', {
        title: t('nav.dashboard'),
        'aria-label': t('nav.dashboard'),
        onclick: () => go('/'),
      }, el('img', { src: '/assets/command-brand-v3.webp', alt: 'ARK Tribe Hub', width: '132', height: '132' })),
      el('button.sidebar-toggle', {
        title: t('nav.collapse'),
        'aria-label': t('nav.collapse'),
        onclick: () => {
          const nowCollapsed = !sidebar.classList.contains('collapsed');
          sidebar.classList.toggle('collapsed', nowCollapsed);
          localStorage.setItem('ath_sidebar_collapsed', nowCollapsed ? '1' : '0');
        },
      }, uiIcon('caret-left'))
    ),
    el('nav.nav', { 'aria-label': t('nav.dashboard') },
      ...main.map(navLink),
      ...(tools.length ? [el('div.nav-group-label', { text: t('nav.group.tools') }), ...tools.map(navLink)] : []),
      ...(tribe.length ? [el('div.nav-group-label', { text: t('nav.group.tribe') }), ...tribe.map(navLink)] : []),
      ...(platform.length ? [el('div.nav-group-label', { text: t('nav.group.platform') }), ...platform.map(navLink)] : [])
    ),
    el('div.sidebar-foot', {},
      el('button.who-card', { type: 'button', onclick: () => go('/profile'), title: t('nav.profile') },
        avatar(user.username, { src: avatarSrc(user) }),
        el('span.who-copy', {},
          el('b', { text: user.username }),
          el('small', { text: [user.tribeName, roleText].filter(Boolean).join(' · ') }))
      ),
      el('div.sidebar-tools', {},
        el('div.lang-switch', { role: 'group', 'aria-label': t('profile.language') },
          ...LANGS.map((l) =>
            el('button' + (getLang() === l.code ? '.on' : ''), {
              type: 'button',
              text: l.code.toUpperCase(),
              title: l.label,
              'aria-label': l.label,
              'aria-pressed': getLang() === l.code ? 'true' : 'false',
              onclick: () => { setLang(l.code); location.reload(); },
            })
          )
        ),
        el('button.logout-btn', { type: 'button', title: t('auth.logout'), 'aria-label': t('auth.logout'), onclick: signOut }, uiIcon('sign-out'))
      ),
      el('nav.legal-links', { 'aria-label': t('footer.legal') },
        el('a', { href: '/impressum.html', text: t('footer.imprint') }),
        el('a', { href: '/datenschutz.html', text: t('footer.privacy') }),
        el('a', { href: '/nutzungsbedingungen.html', text: t('footer.terms') })
      )
    )
  );

  const topbar = el('header.topbar', {},
    el('button.tb-brand', {
      title: t('nav.dashboard'),
      'aria-label': t('nav.dashboard'),
      onclick: () => go('/'),
    }, el('img', { src: '/assets/command-brand-v3.webp', alt: '' }), el('span', { text: 'ARK TRIBE HUB' })),
    el('button.tb-btn', {
      'aria-label': t('nav.notifications'),
      onclick: () => go('/notifications'),
    }, uiIcon('bell'), unreadCount > 0 ? el('span.count', { text: String(unreadCount) }) : null)
  );

  const content = el('main.content', { id: 'view' });

  // Mobile Tab-Leiste nach der freigegebenen Vorlage: Start, Bestellungen,
  // Aufgaben, Chat und "Mehr". Ohne Tribe (Developer) gibt es Aufgaben/Chat
  // nicht - dort stehen Neue Bestellung und Profil. Alles Weitere, inklusive
  // Profil, Sprache und Abmelden, liegt hinter "Mehr".
  const short = { '/': 'nav.short.home', '/orders': 'nav.short.orders', '/tasks': 'nav.short.tasks', '/chat': 'nav.short.chat' };
  const MOBIL_FEST = user.tribeId ? ['/', '/orders', '/tasks', '/chat'] : ['/', '/orders/new', '/orders', '/profile'];
  const everything = [...main, ...tools, ...tribe, ...platform].filter((item, i, all) => all.findIndex((x) => x.path === item.path) === i);
  const bottomMain = MOBIL_FEST.map((p) => everything.find((m) => m.path === p)).filter(Boolean);
  const bottomExtra = everything.filter((m) => !MOBIL_FEST.includes(m.path));

  const bottomLink = (item) => {
    const a = el('a', { href: '#' + item.path, dataset: { path: item.path } },
      uiIcon(item.icon, 'ico'),
      el('span', { text: short[item.path] ? t(short[item.path]) : item.label })
    );
    const n = item.badge ? item.badge() : 0;
    if (n > 0) a.append(el('span.count', { text: String(n) }));
    return a;
  };

  const moreBtn = el('button.more-btn', { type: 'button', 'aria-haspopup': 'dialog' },
    uiIcon('dots-three', 'ico'),
    el('span', { text: t('nav.more') })
  );
  // Ungelesene Mitteilungen und Rufe des Tamagotchis liegen mobil hinter "Mehr" -
  // der Zähler gehört deshalb auch an den "Mehr"-Knopf.
  const moreCount = unreadCount + petCalls();
  if (moreCount > 0) moreBtn.append(el('span.count', { text: String(moreCount) }));

  moreBtn.addEventListener('click', () => {
    const closeMenu = () => { sheet.remove(); moreBtn.focus(); };
    const sheet = el('div.sheet-bg.command-menu', {
      onclick: (e) => { if (e.target === sheet) closeMenu(); },
      onkeydown: (e) => {
        if (e.key === 'Escape') closeMenu();
        if (e.key === 'Tab') {
          const controls = [...sheet.querySelectorAll('a,button')];
          const first = controls[0], last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      },
    },
      el('div.sheet.command-menu-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('nav.more') },
        el('div.command-menu-brand', {},
          avatar(user.username, { src: avatarSrc(user) }),
          el('span.who-copy', {}, el('b', { text: user.username }), el('small', { text: [user.tribeName, roleText].filter(Boolean).join(' · ') })),
          el('button.command-menu-close', { type: 'button', 'aria-label': t('common.close'), onclick: closeMenu }, uiIcon('x'))
        ),
        el('div.command-menu-grid', {},
          ...bottomExtra.map((item) =>
            el('a.sheet-item', { href: '#' + item.path, onclick: () => sheet.remove() },
              uiIcon(item.icon, 'ico'),
              el('span', { text: item.label }),
              item.badge && item.badge() > 0 ? el('span.count', { text: String(item.badge()) }) : null
            )
          )
        ),
        el('div.command-menu-foot', {},
          el('div.lang-switch', { role: 'group', 'aria-label': t('profile.language') },
            ...LANGS.map((l) => el('button' + (getLang() === l.code ? '.on' : ''), {
              type: 'button', text: l.code.toUpperCase(), 'aria-label': l.label,
              onclick: () => { setLang(l.code); location.reload(); },
            }))),
          el('button.btn.sm.ghost', { type: 'button', onclick: () => { sheet.remove(); signOut(); } }, uiIcon('sign-out'), el('span', { text: t('auth.logout') }))
        ),
        el('nav.legal-links', { 'aria-label': t('footer.legal') },
          el('a', { href: '/impressum.html', text: t('footer.imprint') }),
          el('a', { href: '/datenschutz.html', text: t('footer.privacy') }),
          el('a', { href: '/nutzungsbedingungen.html', text: t('footer.terms') }))
      )
    );
    document.getElementById('modal-root').append(sheet);
    sheet.querySelector('a,button')?.focus();
  });

  const bottomnav = el('nav.bottomnav', { 'aria-label': t('nav.more') },
    ...bottomMain.map(bottomLink),
    bottomExtra.length ? moreBtn : null
  );

  clear(root);
  root.append(el('div.app.ark-theme', {}, sidebar, el('div.main', {}, topbar, content, bottomnav)));
  return content;
}

// Genau EIN Navigationspunkt ist aktiv: der mit dem laengsten passenden Pfad.
// Vorher waren bei #/orders/new "Neue Bestellung" UND "Offene Bestellungen"
// gleichzeitig markiert, weil beide mit /orders beginnen.
function markActive(path) {
  const links = [...document.querySelectorAll('[data-path]')];
  const matches = (p) => p === path || (p !== '/' && path.startsWith(p + '/'));
  const best = links.map((a) => a.dataset.path).filter(matches).sort((a, b) => b.length - a.length)[0];
  // Detailseiten gehoeren zu ihrer Liste - nicht zu einem Schwesterpunkt wie /orders/new.
  const owner = best === '/orders/new' && path !== '/orders/new' ? '/orders' : best;
  links.filter((a) => !a.closest('.bottomnav')).forEach((a) => a.classList.toggle('active', a.dataset.path === owner));
  // Untere Leiste: der laengste passende Eintrag der Leiste selbst (z. B.
  // /orders/new -> "Bestellungen"); sonst ist die Seite ueber "Mehr" erreicht.
  const bottom = links.filter((a) => a.closest('.bottomnav'));
  const bottomBest = bottom.map((a) => a.dataset.path).filter((p) => p === path || (p !== '/' && path.startsWith(p + '/'))).sort((a, b) => b.length - a.length)[0];
  bottom.forEach((a) => a.classList.toggle('active', a.dataset.path === bottomBest));
  const more = document.querySelector('.bottomnav .more-btn');
  if (more) more.classList.toggle('active', !bottomBest);
}

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

const ROUTES = [
  { re: /^\/alliances$/, view: renderAlliances },
  { re: /^\/chat$/, view: renderChat },
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
  { re: /^\/voice$/, view: renderVoice },
  { re: /^\/audit$/, view: renderAudit },
  { re: /^\/tribes$/, view: renderTribes },
  { re: /^\/users$/, view: renderUsers },
  { re: /^\/catalog$/, view: renderCatalog },
  { re: /^\/tamagotchi(?:\/(shop|awards|dossier|hall|tribe))?$/, view: renderTamagotchi },
  { re: /^\/tamagotchi-admin(?:\/(overview|species|sale|game|gifts|players))?(?:\?.*)?$/, view: renderTamagotchiAdmin, dev: true },
];

// Das Tamagotchi bringt eigene Grafik- und Spielmodule mit. Sie werden erst beim
// ersten Besuch der Seite geladen, damit der Start der App schlank bleibt.
function renderTamagotchi(...args) {
  return import('./views/tamagotchi.js').then((m) => m.renderTamagotchi(...args));
}

// Tamagotchi-Verwaltung nur für Developer (das Backend prüft die Rolle ebenfalls).
function renderTamagotchiAdmin(mount, context, ...args) {
  if (!context.user.roles.includes('developer')) {
    mount.append(el('div.empty', {}, el('div.big', { text: '403' })));
    return null;
  }
  return import('./views/tamagotchi-admin.js').then((m) => m.renderTamagotchiAdmin(mount, context, ...args));
}

export function go(path, replace = false) {
  if (location.hash === '#' + path) { route(); return; }
  if (replace) location.replace('#' + path);
  else location.hash = path;
}

async function route() {
  if (!user) return;
  const path = location.hash.slice(1) || '/';
  const match = ROUTES.find((r) => r.re.test(path));

  const view = document.getElementById('view') || buildShell();
  // Jeder Seitenaufruf bekommt einen EIGENEN Container. Views laden ihre Daten
  // asynchron nach und schreiben erst danach in ihren Container. Ohne diese
  // Trennung schrieben zwei schnell aufeinanderfolgende Aufrufe in denselben
  // Knoten: der spaetere leerte ihn, der fruehere haengte sein Ergebnis
  // hinterher hinein - je nach Reihenfolge blieb die Seite leer oder zeigte
  // Inhalte der vorherigen Seite. Ein abgeloester Container faellt beim
  // naechsten replaceChildren einfach heraus.
  const seite = el('div.view-page');
  seite.dataset.section = path.split('/')[1] || 'dashboard';
  view.replaceChildren(seite);
  markActive(path);
  (document.querySelector('.main') || window).scrollTo(0, 0);

  if (!match) { seite.append(el('div.empty', {}, el('div.big', { text: '404' }))); return; }

  // Tribe-Werkzeuge brauchen einen Tribe. Ein Developer hat plattformweite Rechte,
  // aber kein eigenes Tribe-Konto - statt einer leeren oder kaputten Seite bekommt
  // er hier eine klare Erklärung, warum das so ist und was zu tun ist.
  const TRIBE_ONLY = /^\/(dinos|servers|tasks|voice|alliances|chat|members)(\/|$)/;
  if (TRIBE_ONLY.test(path) && !user.tribeId) {
    seite.append(
      el('div.empty', {},
        el('div.big', { text: t('tools.needs_tribe_title') }),
        el('p', { text: t('tools.needs_tribe_body') })
      )
    );
    return;
  }

  const params = path.match(match.re).slice(1);
  try {
    await match.view(seite, ctx(), ...params);
  } catch (err) {
    seite.replaceChildren(
      el('div.empty', {},
        el('div.big', { text: err instanceof ApiError ? err.message : t('common.error') })
      )
    );
  }
}

function ctx() {
  return { user, go, onSignOut: signOut, refreshBadges, reloadUser: loadUser };
}

function paintCount(node, n) {
  node.querySelector('.count')?.remove();
  if (n > 0) node.append(el('span.count', { text: String(n) }));
}

// Das Tamagotchi ruft wie das Original von 1996: Braucht es etwas, zeigt der
// Menüpunkt einen Zähler - auch wenn man gerade auf einer anderen Seite ist.
function refreshPetBadge() {
  const n = petCalls();
  document.querySelectorAll('[data-path="/tamagotchi"]').forEach((a) => paintCount(a, n));
  const more = document.querySelector('.bottomnav .more-btn');
  if (more) paintCount(more, unreadCount + n);
}

let petWatch = null;
function watchPet() {
  petWatch ||= onPetChange(refreshPetBadge);
  loadPet(user).catch(() => { /* Das Tamagotchi ist optional */ });
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
    refreshPetBadge();
  } catch { /* Zähler ist nicht kritisch */ }
}

/* -------------------------------------------------------------------------- */
/* Sitzung                                                                     */
/* -------------------------------------------------------------------------- */

function stopIdleWatch() {
  clearTimeout(idleLogoutTimer);
  clearTimeout(idleWarningTimer);
  idleLogoutTimer = null;
  idleWarningTimer = null;
}

function resetIdleWatch() {
  if (!user) return;
  stopIdleWatch();
  idleWarningTimer = setTimeout(() => toast(t('auth.idle_warning')), IDLE_WARNING_MS);
  idleLogoutTimer = setTimeout(() => signOut(true), IDLE_LOGOUT_MS);
}

function startIdleWatch() {
  if (!idleWatchBound) {
    for (const eventName of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
      window.addEventListener(eventName, resetIdleWatch, { passive: true });
    }
    idleWatchBound = true;
  }
  resetIdleWatch();
}

async function signOut(wasIdle = false) {
  stopIdleWatch();
  await savePet();
  try { await api.logout(); } catch { /* egal, lokal trotzdem abmelden */ }
  resetPet();
  user = null;
  setCsrf(null);
  location.hash = '';
  showAuth();
  if (wasIdle === true) toast(t('auth.idle_logout'));
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
  startIdleWatch();
  if (user.status !== 'active') {
    renderPending(root, { user, onSignOut: signOut });
    return;
  }
  await refreshBadgesInitial();
  buildShell();
  watchPet();
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
  // Link aus "Passwort vergessen" immer auf der Anmeldeseite öffnen.
  if (new URLSearchParams(location.search).has('reset')) { showAuth(); return; }
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
installPasswordToggles();
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
