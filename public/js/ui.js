import { t, timeAgo } from './i18n.js';
import { itemBild, itemArt } from './icons.js';
import { uiIcon } from './ui-icons.js';

/** Kleiner DOM-Helfer. el('div.card', {onclick}, kinder...) */
export function el(spec, props = {}, ...children) {
  const [tagPart, ...classes] = spec.split('.');
  const node = document.createElement(tagPart || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = (node.className ? node.className + ' ' : '') + v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

const MAX_TOASTS = 3;

export function toast(message, kind = 'ok') {
  const box = document.getElementById('toasts');
  // Bei mehreren schnellen Aktionen (z.B. mehrere Positionen kurz hintereinander
  // ausgeben) sollen sich Toasts nicht endlos stapeln und Inhalte verdecken -
  // die ältesten verschwinden vorzeitig, sobald mehr als MAX_TOASTS sichtbar sind.
  while (box.children.length >= MAX_TOASTS) box.firstChild.remove();

  const node = el('div.toast' + (kind === 'err' ? '.err' : ''), { text: message, role: 'status' });
  box.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .2s';
    setTimeout(() => node.remove(), 220);
  }, 2600);
}

export function confirmDialog({ title, body, confirmLabel, danger }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const close = (val) => { clear(root); resolve(val); };

    const bg = el('div.modal-bg', {
      onclick: (e) => { if (e.target === bg) close(false); },
    },
      el('div.modal', { role: 'dialog', 'aria-modal': 'true' },
        el('h3', { text: title }),
        body ? el('p', { text: body }) : null,
        el('div.modal-actions', {},
          el('button.btn.ghost', { text: t('common.cancel'), onclick: () => close(false) }),
          el('button.btn' + (danger ? '.danger' : '.primary'), {
            text: confirmLabel || t('common.confirm'),
            onclick: () => close(true),
          })
        )
      )
    );
    clear(root);
    root.append(bg);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(false); }
    });
    bg.querySelector('.btn.primary, .btn.danger')?.focus();
  });
}

export function spinner() { return el('div.spinner', { 'aria-label': t('common.loading') }); }

export function statusBadge(status) {
  return el('span.badge.b-' + status, { text: t('status.' + status) });
}

export function priorityBadge(priority) {
  if (priority === 'normal') return null;
  return el('span.badge.b-' + priority, { text: t('prio.' + priority) });
}

export function typeTag(productType) {
  return el('span.type-tag.t-' + productType, { text: t('type.' + productType) });
}

export function emptyState(title, sub) {
  return el('div.empty', {}, uiIcon('info', 'empty-icon'), el('div.big', { text: title }), sub ? el('div', { text: sub }) : null);
}

/**
 * Kopfzeile einer Bestellung: Benutzer und Tribe statt einer Bestellnummer.
 *
 * ARK-Charakternamen tragen den Tribe oft schon im Namen ("Blunt OaO"). Wird der
 * Tribe dann stur angehaengt, steht dort "Blunt OaO OaO". Deshalb wird er nur
 * ergaenzt, wenn er nicht ohnehin schon im Namen steckt.
 */
export function orderTitle(order) {
  const name = order.member_username || '';
  const tribe = order.tribe_name || '';
  if (!tribe) return name;
  const hasTribe = new RegExp(`(^|\\s)${tribe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(name);
  return hasTribe ? name : `${name} ${tribe}`;
}

/** Summen fuer den Fortschritt einer Bestellung: ausgegebene Stueck / alle Stueck. */
export function orderProgress(order) {
  const items = order.items || [];
  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const issued = items.filter((it) => it.status === 'issued').reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  return { issued, total, pct: total ? Math.round(issued / total * 100) : 0 };
}

/** Statusfarbe einer Bestellung fuer das Abzeichen oben links auf der Karte. */
export function orderTone(order) {
  if (order.status === 'completed') return 'done';
  if (order.status === 'cancelled') return 'muted';
  if (order.priority === 'urgent') return 'urgent';
  if (order.assigned_to || ['partially_prepared', 'partially_issued'].includes(order.status)) return 'progress';
  return 'open';
}
export function orderToneLabel(order) {
  const tone = orderTone(order);
  if (tone === 'urgent') return t('prio.urgent');
  if (tone === 'progress' && order.status === 'open') return t('task.status.in_progress');
  return t('status.' + order.status);
}

/**
 * Bestellkarte im Stil der freigegebenen Vorlage: vollflaechiges Bild,
 * Statusabzeichen oben links, Titel, Mengenfortschritt, Besteller.
 * Die Kopfzeile nennt Benutzer + Tribe statt einer Bestellnummer.
 */
export function orderCard(order, onOpen, { showImages = false, illustrated = false, compact = false } = {}) {
  if (!illustrated) {
    const items = order.items.map((it) =>
      el('div.line-item', {},
        showImages ? itemBild(it, 36) : el('span.dot.s-' + it.status),
        el('span.li-name', { text: it.item_name }),
        el('span.li-qty', { text: '× ' + it.quantity })
      )
    );
    return el('article.order-card.prio-' + order.priority, {
      onclick: () => onOpen(order.id), tabindex: '0', role: 'button',
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(order.id); } },
    },
      el('div.oc-top', {},
        el('div', {}, el('div.oc-who', { text: orderTitle(order) }), el('div.oc-meta', { text: timeAgo(order.created_at) })),
        el('div.chips', {}, priorityBadge(order.priority), statusBadge(order.status))),
      el('div.oc-items', {}, items));
  }
  const first = order.items[0];
  const more = order.items.length - 1;
  const { issued, total, pct } = orderProgress(order);
  const tone = orderTone(order);
  const title = first ? first.item_name + (more > 0 ? ` +${more}` : '') : t('nav.orders');
  return el('article.ark-order-card' + (compact ? '.is-compact' : '') + '.tone-' + tone, {
    onclick: () => onOpen(order.id), tabindex: '0', role: 'link', 'aria-label': title,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(order.id); } },
  },
    el('div.aoc-art', {},
      first ? itemArt(first) : null,
      el('span.tone-pill.tone-' + tone, { text: orderToneLabel(order) }),
      uiIcon('caret-right', 'aoc-chevron')),
    el('div.aoc-body', {},
      el('h3.aoc-title', { text: title }),
      el('div.aoc-progress-row', {},
        first ? el('span.aoc-type', { text: t('type.' + first.product_type) }) : null,
        el('span.aoc-count', {}, el('b', { text: `${issued} / ${total}` }), ' ', el('span', { text: t('istatus.issued').toLowerCase() }))),
      el('div.ark-progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
        el('span', { style: `width:${pct}%` })),
      el('div.aoc-foot', {},
        avatar(order.member_username, { size: 'sm' }),
        el('span.aoc-who', {},
          el('small', { text: t('dash.requested_by') + ': ' }), el('b', { text: order.member_username || '—' }),
          el('small.aoc-time', { text: timeAgo(order.created_at) })))));
}

/* ------------------------------------------------------------------------ */
/* Gemeinsame Bausteine der Member-Seiten                                   */
/* ------------------------------------------------------------------------ */

/**
 * Einheitlicher Seitenkopf mit seitenspezifischem Bildbanner. Das Bild kommt
 * aus CSS (data-section der Seite), damit jede Seite ihr eigenes Motiv hat.
 */
export function pageHead({ title, sub, icon, back, actions = [], extra = null, className = '' }) {
  return el('header.page-head.page-banner' + (className ? '.' + className : ''), {},
    el('div.page-banner-copy', {},
      back ? el('button.banner-back', { type: 'button', onclick: back.onclick, 'aria-label': back.label || t('common.back') },
        uiIcon('arrow-left'), el('span', { text: back.label || t('common.back') })) : null,
      el('div.page-banner-title', {}, icon ? uiIcon(icon, 'page-banner-icon') : null, el('h1', { text: title })),
      sub ? el('p', { text: sub }) : null,
      extra),
    actions.filter(Boolean).length ? el('div.page-banner-actions', {}, ...actions.filter(Boolean)) : null);
}

/** Bildpfad eines Mitglieds (eigenes Profil: avatarPath, Listen: avatar_path). */
export function avatarSrc(member) {
  const path = member?.avatarPath || member?.avatar_path;
  return path ? '/uploads/' + path : null;
}

const AVATAR_TONES = 6;
/** Initialen-Avatar; zeigt ein hochgeladenes Bild, wenn vorhanden. Nie erfundene Portraits. */
export function avatar(name, { size = 'md', src = null, online = null } = {}) {
  const clean = String(name || '?').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase();
  let hash = 0;
  for (const ch of clean) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const node = el('span.ark-avatar.av-' + size + '.av-tone-' + (hash % AVATAR_TONES), { 'aria-hidden': 'true' });
  if (src) {
    const img = el('img', { src, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => { img.remove(); node.textContent = initials; }, { once: true });
    node.append(img);
  } else node.textContent = initials;
  if (online !== null) node.append(el('span.av-dot' + (online ? '.is-on' : '')));
  return node;
}

/** Kleines farbiges Status-Etikett. tone: open | progress | done | urgent | high | muted | role */
export function pill(text, tone = 'open', icon = null) {
  return el('span.tone-pill.tone-' + tone, {}, icon ? uiIcon(icon) : null, el('span', { text }));
}

let openMenu = null;
function closeOpenMenu() {
  if (!openMenu) return;
  openMenu.panel.remove();
  openMenu.button.setAttribute('aria-expanded', 'false');
  openMenu = null;
}
document.addEventListener('click', (e) => { if (openMenu && !openMenu.panel.contains(e.target) && e.target !== openMenu.button && !openMenu.button.contains(e.target)) closeOpenMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenu) { const b = openMenu.button; closeOpenMenu(); b.focus(); } });
window.addEventListener('hashchange', closeOpenMenu);

/**
 * ⋯-Menue fuer Nebenaktionen. items: [{ label, onclick, danger, icon }]
 * Rendert nichts, wenn keine Aktion erlaubt ist.
 */
export function kebabMenu(items, label = t('common.more')) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  const button = el('button.kebab', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label, title: label }, uiIcon('dots-three'));
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openMenu?.button === button) { closeOpenMenu(); return; }
    closeOpenMenu();
    const panel = el('div.kebab-menu', { role: 'menu' },
      ...list.map((item) => el('button' + (item.danger ? '.is-danger' : ''), {
        type: 'button', role: 'menuitem',
        onclick: (ev) => { ev.stopPropagation(); closeOpenMenu(); item.onclick(); },
      }, item.icon ? uiIcon(item.icon) : null, el('span', { text: item.label }))));
    document.body.append(panel);
    const r = button.getBoundingClientRect();
    const w = Math.max(220, panel.offsetWidth);
    panel.style.top = Math.min(window.innerHeight - panel.offsetHeight - 8, r.bottom + 6) + 'px';
    panel.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    button.setAttribute('aria-expanded', 'true');
    openMenu = { button, panel };
    panel.querySelector('button')?.focus();
  });
  return button;
}

/** Segmentierte Reiter mit optionalem Zaehler. tabs: [{ key, label, count }] */
export function tabBar(tabs, active, onChange, className = '') {
  const bar = el('div.ark-tabs' + (className ? '.' + className : ''), { role: 'tablist' });
  const draw = (current) => bar.replaceChildren(...tabs.map((tab) => el('button' + (tab.key === current ? '.on' : ''), {
    type: 'button', role: 'tab', 'aria-selected': tab.key === current ? 'true' : 'false',
    onclick: () => { draw(tab.key); onChange(tab.key); },
  }, el('span', { text: tab.label }), tab.count !== undefined && tab.count !== null ? el('small', { text: `(${tab.count})` }) : null)));
  draw(active);
  bar.setActive = draw;
  return bar;
}

/** Panel mit Kopfzeile im Stil der Vorlage (Icon, Titel, Link rechts). */
export function panel({ title, icon, link, onLink, className = '', count = null }, ...children) {
  return el('section.ark-panel' + (className ? '.' + className : ''), {},
    el('header.ark-panel-head', {},
      icon ? uiIcon(icon, 'ark-panel-icon') : null,
      el('h2', { text: title }),
      count !== null ? el('span.ark-count', { text: String(count) }) : null,
      link && onLink ? el('button.ark-panel-link', { type: 'button', onclick: onLink }, el('span', { text: link }), uiIcon('arrow-right')) : null),
    ...children);
}

/** Leerer Zustand mit Symbol statt nacktem Text. */
export function emptyBlock(icon, title, sub, action = null) {
  return el('div.ark-empty', {}, uiIcon(icon, 'ark-empty-icon'), el('strong', { text: title }), sub ? el('p', { text: sub }) : null, action);
}

/** Liest eine Datei als Base64 (ohne data:-Präfix) für den Bild-Upload. */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

const ROLE_ORDER = ['developer', 'admin', 'breeder', 'crafter', 'breeder_crafter', 'member'];
/**
 * Sichtbare Rollen: breeder_crafter wird nur als alte, kombinierte Rolle
 * angezeigt - bei getrennten Rollen ist es lediglich die Berechtigung dahinter.
 */
export function visibleRoles(roles = []) {
  const list = roles.includes('breeder') || roles.includes('crafter') ? roles.filter((r) => r !== 'breeder_crafter') : [...roles];
  return list.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
}

/** Server, den dieses Geraet als "meinen" Server anzeigt (reine Ansichtswahl). */
export function preferredServer(servers, user) {
  let saved = null;
  try { saved = localStorage.getItem('ath_server'); } catch { /* optional */ }
  const byId = servers.find((s) => String(s.id) === saved);
  if (byId) return byId;
  const norm = (v) => String(v || '').trim().toLowerCase();
  return servers.find((s) => user?.server && norm(s.name) === norm(user.server))
    || servers.find((s) => s.status === 'active') || servers[0] || null;
}
export function rememberServer(id) {
  try { localStorage.setItem('ath_server', String(id)); } catch { /* optional */ }
}

/** Hauptrolle fuer Farbe/Etikett (Chat usw.): Admin > Breeder > Crafter > Mitglied. */
export function roleOf(member) {
  const r = member?.roles || [];
  if (r.includes('developer')) return 'developer';
  if (r.includes('admin')) return 'admin';
  if (r.includes('breeder') && r.includes('crafter')) return 'breeder';
  if (r.includes('breeder')) return 'breeder';
  if (r.includes('crafter')) return 'crafter';
  if (r.includes('breeder_crafter')) return 'breeder_crafter';
  return 'member';
}
