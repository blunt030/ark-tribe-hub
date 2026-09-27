import { el, spinner, toast, confirmDialog, pageHead, avatar, kebabMenu, emptyBlock } from '../ui.js';
import { api } from '../api.js';
import { t, fmtStamp } from '../i18n.js';
import { uiIcon } from '../ui-icons.js';

const RELATION_ICON = { alliance: 'handshake', friend: 'users', enemy: 'skull' };

export async function renderAlliances(mount, { user }) {
  mount.append(spinner());
  const { alliances } = await api.alliances();
  const canEdit = user.roles.some(r => ['admin', 'developer'].includes(r));
  const list = el('div.community-list');
  const editor = el('div');
  const RELATIONS = ['alliance', 'friend', 'enemy'];
  const draw = () => {
    const card = (a) => el('article.alliance-card.' + a.relationship, {},
      el('span.alliance-icon', {}, uiIcon(RELATION_ICON[a.relationship] || 'users')),
      el('div.alliance-copy', {},
        el('h3', { text: a.name }),
        el('p', {}, uiIcon('hard-drives'), el('span', { text: a.server })),
        el('p', {}, uiIcon('map'), el('span', { text: a.map }))),
      canEdit ? kebabMenu([
        { label: t('common.edit'), icon: 'pencil-simple', onclick: () => form(a) },
        { label: t('common.delete'), icon: 'trash', danger: true, onclick: async () => {
          if (!await confirmDialog({ title: t('alliance.delete'), body: a.name, danger: true })) return;
          try { await api.deleteAlliance(a.id); alliances.splice(alliances.indexOf(a), 1); draw(); }
          catch (e) { toast(e.message, 'err'); }
        } },
      ]) : null);
    list.replaceChildren(
      el('div.alliance-summary', {}, ...RELATIONS.map((rel) => el('div.alliance-stat.' + rel, {},
        el('span.alliance-icon', {}, uiIcon(RELATION_ICON[rel])),
        el('span.alliance-stat-copy', {}, el('strong', { text: String(alliances.filter((a) => a.relationship === rel).length) }), el('span', { text: t('alliance.' + rel) }))))),
      el('div.alliance-columns', {}, ...RELATIONS.map((rel) => {
        const rows = alliances.filter((a) => a.relationship === rel);
        return el('section.ark-panel.alliance-column.' + rel, {},
          el('header.ark-panel-head', {}, uiIcon(RELATION_ICON[rel], 'ark-panel-icon'), el('h2', { text: t('alliance.' + rel) }), el('span.ark-count', { text: String(rows.length) })),
          rows.length ? el('div.alliance-list', {}, ...rows.map(card))
            : el('p.alliance-empty', {}, uiIcon(RELATION_ICON[rel]), el('span', { text: t('alliance.empty') })));
      })));
  };
  function form(a = {}) {
    const name = el('input', { id: 'alliance-name', required: true, maxlength: 100, value: a.name || '' });
    const server = el('input', { id: 'alliance-server', required: true, maxlength: 100, value: a.server || '' });
    const map = el('input', { id: 'alliance-map', required: true, maxlength: 100, value: a.map || '' });
    const relation = el('select', { id: 'alliance-relation' }, ...['alliance', 'friend', 'enemy'].map(v => el('option', { value: v, text: t('alliance.' + v) })));
    relation.value = a.relationship || 'alliance';
    const save = el('button.btn.primary.lux', { type: 'submit' }, uiIcon('floppy-disk'), el('span', { text: t('community.save') }));
    const field = (key, input, cls = '') => el('div.field' + cls, {}, el('label', { for: input.id, text: t(key) }), input);
    editor.replaceChildren(el('form.ark-panel.community-form', { onsubmit: async e => {
      e.preventDefault(); save.disabled = true;
      const body = { name: name.value, server: server.value, map: map.value, relationship: relation.value };
      try {
        const { alliance } = await (a.id ? api.updateAlliance(a.id, body) : api.createAlliance(body));
        if (a.id) alliances.splice(alliances.indexOf(a), 1, alliance); else alliances.push(alliance);
        alliances.sort((x,y) => x.name.localeCompare(y.name));
        editor.replaceChildren(); draw();
      } catch (err) { toast(err.message, 'err'); }
      finally { save.disabled = false; }
    } },
    el('header.ark-panel-head', {}, uiIcon('handshake', 'ark-panel-icon'), el('h2', { text: t(a.id ? 'common.edit' : 'alliance.new') })),
    el('div.form-grid', {}, field('alliance.name', name), field('alliance.relation', relation), field('alliance.server', server), field('alliance.map', map)),
    el('div.form-actions', {}, el('button.btn.ghost', { type: 'button', text: t('common.cancel'), onclick: () => editor.replaceChildren() }), save)));
    name.focus();
    editor.scrollIntoView({ block: 'nearest' });
  }
  mount.replaceChildren(
    pageHead({ title: t('nav.alliances'), sub: t('page.alliances.sub'), icon: 'handshake',
      actions: [canEdit ? el('button.btn.primary.lux', { type: 'button', onclick: () => form() }, uiIcon('plus'), el('span', { text: t('alliance.new') })) : null] }),
    editor, list);
  draw();
}

export function chatMessage(m, currentUserId = null) {
  const mine = currentUserId != null && Number(m.author_id) === Number(currentUserId);
  const colorIndex = Math.abs(Number(m.author_id) || 0) % 6;
  return el(`article.chat-message.author-color-${colorIndex}${mine ? '.mine' : ''}`, { dataset: { messageId: m.id } },
    avatar(m.author_name, { size: 'md' }),
    el('div.chat-meta', {}, el('strong', { text: m.author_name }),
      mine ? el('span.chat-me', { text: t('chat.me') }) : null,
      el('time', { datetime: m.created_at, text: fmtStamp(m.created_at) })),
    el('p', { text: m.body })); // User content is always textContent, never HTML.
}

export async function renderChat(mount, { user }) {
  mount.append(spinner());
  const initial = await api.chatMessages();
  const messages = new Map(initial.messages.map(m => [m.id, m]));
  let latest = initial.messages.at(-1)?.id || 0;
  let olderAvailable = initial.hasMore;
  let sending = false;
  const log = el('div.chat-log', { role: 'log', 'aria-label': t('nav.chat'), 'aria-live': 'polite', 'aria-relevant': 'additions', tabindex: '0' });
  const status = el('p.hint', { role: 'status' });
  const empty = el('div', {}, emptyBlock('chat-circle-dots', t('chat.empty')));
  const input = el('input', { id: 'chat-body', type: 'text', maxlength: 2000, required: true, placeholder: t('chat.placeholder'), 'aria-label': t('chat.message'), autocomplete: 'off', enterkeyhint: 'send' });
  const send = el('button.send-btn', { type: 'submit', 'aria-label': t('chat.send'), title: t('chat.send') }, uiIcon('paper-plane-tilt'));
  const older = el('button.btn.sm.ghost.chat-older', { type: 'button', onclick: async () => {
    older.disabled = true;
    const previousHeight = log.scrollHeight;
    const previousTop = log.scrollTop;
    try {
      const result = await api.chatMessages({ before: Math.min(...messages.keys()) });
      merge(result.messages);
      olderAvailable = result.hasMore;
      log.scrollTop = previousTop + log.scrollHeight - previousHeight;
      older.hidden = !olderAvailable;
    } catch (e) { status.textContent = e.message; }
    finally { older.disabled = false; }
  } }, uiIcon('caret-up'), el('span', { text: t('chat.older') }));
  const chatWindow = el('section.chat-window', { 'aria-label': t('nav.chat') },
    el('header.ark-panel-head', {}, uiIcon('chat-circle-dots', 'ark-panel-icon'), el('h2', { text: t('nav.chat') + ' · General' }), older),
    empty, log, status);
  function merge(rows) {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    for (const m of rows) {
      if (messages.has(m.id) && log.querySelector(`[data-message-id="${m.id}"]`)) continue;
      messages.set(m.id, m);
      const node = chatMessage(m, user.id);
      const next = [...log.children].find(n => Number(n.dataset.messageId) > m.id);
      log.insertBefore(node, next || null);
    }
    empty.hidden = messages.size > 0;
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }
  const composer = el('form.ark-panel.chat-composer', { onsubmit: async e => {
    e.preventDefault();
    if (sending || !input.value.trim()) return;
    sending = true; send.disabled = true; input.readOnly = true;
    try {
      const { message } = await api.sendChatMessage(input.value);
      merge([message]); input.value = ''; status.textContent = '';
      // Den Abfrage-Cursor hier bewusst nicht verschieben: Nachrichten anderer
      // zwischen letzter Abfrage und diesem Senden muessen noch geholt werden.
      log.scrollTop = log.scrollHeight;
    } catch (err) { status.textContent = err.message; }
    finally { sending = false; send.disabled = false; input.readOnly = false; input.focus(); }
  } }, uiIcon('chat-circle-dots', 'composer-icon'), input, send);
  mount.replaceChildren(
    pageHead({ title: t('nav.chat'), sub: t('page.chat.sub'), icon: 'chat-circle-dots' }),
    el('div.chat-page', {}, chatWindow, composer,
      el('p.chat-foot', {}, el('span', { text: t('chat.scope') }), el('span', { text: t('chat.limits') }))));
  older.hidden = !olderAvailable;
  merge(initial.messages);
  log.scrollTop = log.scrollHeight;
  async function poll() {
    if (!mount.isConnected) return;
    if (document.visibilityState === 'visible') {
      try {
        const result = await api.chatMessages(latest ? { after: latest } : {});
        if (!mount.isConnected) return;
        merge(result.messages);
        latest = result.messages.at(-1)?.id || latest;
        status.textContent = '';
      } catch (e) {
        status.textContent = e.message;
        if ([401, 403].includes(e.status)) return;
      }
    }
    if (mount.isConnected) setTimeout(poll, 5000);
  }
  if (mount.isConnected) setTimeout(poll, 5000);
}
