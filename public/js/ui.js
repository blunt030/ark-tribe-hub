import { t, timeAgo } from './i18n.js';

/** Kleiner DOM-Helfer. el('div.card', {onclick}, kinder...) */
export function el(spec, props = {}, ...children) {
  const [tagPart, ...classes] = spec.split('.');
  const node = document.createElement(tagPart || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = (node.className ? node.className + ' ' : '') + v;
    else if (k === 'html') node.innerHTML = v;
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
  return el('div.empty', {}, el('div.big', { text: title }), sub ? el('div', { text: sub }) : null);
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

/**
 * Bestellkarte. Zeigt laut Spezifikation Benutzer + Tribe im Kopf statt einer
 * Bestellnummer, die Positionen mit ihrem Einzelstatus und keine Teilmengen.
 */
export function orderCard(order, onOpen) {
  const items = order.items.map((it) =>
    el('div.line-item', {},
      el('span.dot.s-' + it.status),
      el('span.li-name', { text: `${it.emoji ? it.emoji + ' ' : ''}${it.item_name}` }),
      el('span.li-qty', { text: '× ' + it.quantity })
    )
  );

  return el('article.order-card.prio-' + order.priority, {
    onclick: () => onOpen(order.id),
    tabindex: '0',
    role: 'button',
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(order.id); } },
  },
    el('div.oc-top', {},
      el('div', {},
        el('div.oc-who', { text: orderTitle(order) }),
        el('div.oc-meta', { text: timeAgo(order.created_at) })
      ),
      el('div.chips', {}, priorityBadge(order.priority), statusBadge(order.status))
    ),
    el('div.oc-items', {}, items),
    el('div.oc-foot', {},
      el('span.oc-meta', {
        text: order.assigned_username
          ? t('order.assigned_to', { name: order.assigned_username })
          : t('order.unassigned'),
      })
    )
  );
}

/**
 * Horizontales News-Laufband. Rendert die Einträge zweimal hintereinander und
 * animiert exakt über die halbe Breite (-50%) - dadurch wirkt der Übergang nahtlos,
 * ohne dass am Ende sichtbar "zurückgesprungen" wird. Pausiert bei Hover UND bei
 * Touch (Mobilgeräte kennen kein :hover), damit man eine Nachricht in Ruhe lesen kann.
 */
export function newsTicker(items) {
  if (!items || items.length === 0) return null;

  const renderItem = (n) =>
    el('span.nt-item.' + n.priority, {},
      n.priority === 'urgent' ? '⚠️ ' : n.priority === 'high' ? '❗ ' : '',
      n.body
    );

  const sep = () => el('span.nt-sep', { text: '•' });

  function buildTrackChildren() {
    const out = [];
    items.forEach((n, i) => { out.push(renderItem(n)); if (i < items.length - 1) out.push(sep()); });
    return out;
  }

  const track = el('div.nt-track', {}, ...buildTrackChildren(), sep(), ...buildTrackChildren());

  // Geschwindigkeit an die Textmenge koppeln, damit lange wie kurze Laufbänder
  // ungefähr gleich schnell WIRKEN (mehr Text -> proportional länger Zeit).
  const totalChars = items.reduce((sum, n) => sum + n.body.length, 0);
  // Deutlich schnelleres Tempo (Nachrichtenlaufband im Fernsehen) und Dauerschleife.
  // Der Faktor 0.11 statt 0.28 laesst den Text rund 2,5x zuegiger durchlaufen;
  // Ober- und Untergrenze verhindern, dass sehr kurze News hetzen oder sehr
  // lange ewig brauchen. Die Wiederholung kommt aus animation-iteration-count:
  // infinite im CSS, zusammen mit der doppelt eingefuegten Inhaltsliste - dadurch
  // gibt es keinen sichtbaren Sprung beim Neustart.
  const duration = Math.max(14, Math.min(52, totalChars * 0.16));
  track.style.animationDuration = duration + 's';

  // Bewusst KEIN Anhalten bei Mauszeiger/Beruehrung: das Band soll ununterbrochen
  // weiterlaufen.
  const wrap = el('div.nt-track-wrap', {}, track);

  return el('div.news-ticker', {}, el('span.nt-label', { text: '🔴 NEWS' }), wrap);
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
