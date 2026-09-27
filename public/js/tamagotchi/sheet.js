/**
 * Dialog (Bottom-Sheet) des Tamagotchis mit Fokusfalle und Esc, dazu eine
 * Rückfrage. Eigene Datei, damit Kauf, Kiste und Panels sie ohne
 * Kreisbezüge nutzen können.
 */
import { el } from '../ui.js';
import { t } from '../i18n.js';
import { petState } from './store.js';

/* -------------------------------------------------------------------------- */
/* Dialog                                                                       */
/* -------------------------------------------------------------------------- */

export function sheet(title, content, { wide = false, onClose } = {}) {
  const root = document.getElementById('modal-root');
  const before = document.activeElement;
  const panel = el('div.tama-sheet' + (wide ? '.is-wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('header.tama-sheet-head', {}, el('h2', { text: title }),
      el('button.tama-sheet-close', { type: 'button', 'aria-label': t('tama.close'), onclick: () => close() }, '×')),
    el('div.tama-sheet-body', {}, content));
  const bg = el('div.tama-sheet-bg', { dataset: { shell: petState.doc?.settings?.shell || 'tek' }, onclick: (e) => { if (e.target === bg) close(); } }, panel);
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const items = [...panel.querySelectorAll('button:not([disabled]), input, select, a[href]')].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function close() {
    bg.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
    before?.focus?.();
  }
  root.append(bg);
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => panel.querySelector('.tama-sheet-close')?.focus());
  return { close, panel };
}

export function confirmSheet(text, { confirm = t('tama.confirm'), danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; s.close(); resolve(v); };
    const s = sheet(t('tama.confirm'), el('div.tama-confirm', {},
      el('p', { text }),
      el('div.tama-row-actions', {},
        el('button.btn.ghost', { type: 'button', text: t('common.cancel'), onclick: () => finish(false) }),
        el('button.btn' + (danger ? '.danger' : '.primary'), { type: 'button', text: confirm, onclick: () => finish(true) }))), { onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}
