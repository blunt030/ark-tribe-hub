import { el, spinner, toast, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { t, getLang } from '../i18n.js';

export async function renderAlliances(mount, { user }) {
  mount.append(spinner());
  const { alliances } = await api.alliances();
  const canEdit = user.roles.some(r => ['admin', 'developer'].includes(r));
  const list = el('div.community-list');
  const editor = el('div');
  const draw = () => {
    list.replaceChildren(...alliances.map(a => el('article.card.relationship.' + a.relationship, {},
      el('span.relationship-label', { text: t('alliance.' + a.relationship) }),
      el('h2', { text: a.name }),
      el('p', { text: a.server + ' · ' + a.map }),
      canEdit ? el('div.actions', {},
        el('button.btn', { text: t('common.edit'), onclick: () => form(a) }),
        el('button.btn.danger', { text: t('common.delete'), onclick: async () => {
          if (!await confirmDialog({ title: t('alliance.delete'), body: a.name, danger: true })) return;
          try { await api.deleteAlliance(a.id); alliances.splice(alliances.indexOf(a), 1); draw(); }
          catch (e) { toast(e.message, 'err'); }
        } })
      ) : null
    )));
    if (!alliances.length) list.append(el('p.hint', { text: t('alliance.empty') }));
  };
  function form(a = {}) {
    const name = el('input', { id: 'alliance-name', required: true, maxlength: 100, value: a.name || '' });
    const server = el('input', { id: 'alliance-server', required: true, maxlength: 100, value: a.server || '' });
    const map = el('input', { id: 'alliance-map', required: true, maxlength: 100, value: a.map || '' });
    const relation = el('select', { id: 'alliance-relation' }, ...['alliance', 'friend', 'enemy'].map(v => el('option', { value: v, text: t('alliance.' + v) })));
    relation.value = a.relationship || 'alliance';
    const save = el('button.btn.primary', { type: 'submit', text: t('community.save') });
    const field = (key, input) => el('div.field', {}, el('label', { for: input.id, text: t(key) }), input);
    editor.replaceChildren(el('form.card.community-form', { onsubmit: async e => {
      e.preventDefault(); save.disabled = true;
      const body = { name: name.value, server: server.value, map: map.value, relationship: relation.value };
      try {
        const { alliance } = await (a.id ? api.updateAlliance(a.id, body) : api.createAlliance(body));
        if (a.id) alliances.splice(alliances.indexOf(a), 1, alliance); else alliances.push(alliance);
        alliances.sort((x,y) => x.name.localeCompare(y.name));
        editor.replaceChildren(); draw();
      } catch (err) { toast(err.message, 'err'); }
      finally { save.disabled = false; }
    } }, el('h2', { text: t(a.id ? 'common.edit' : 'alliance.new') }),
    field('alliance.name', name), field('alliance.relation', relation), field('alliance.server', server), field('alliance.map', map),
    el('div.actions', {}, save, el('button.btn', { type: 'button', text: t('common.cancel'), onclick: () => editor.replaceChildren() }))));
    name.focus();
    editor.scrollIntoView({ block: 'nearest' });
  }
  mount.replaceChildren(el('div.page-head', {}, el('div', {}, el('h1', { text: t('nav.alliances') }), el('p', { text: t('alliance.scope') })),
    canEdit ? el('button.btn.primary', { text: t('alliance.new'), onclick: () => form() }) : null), editor, list);
  draw();
}

export function chatMessage(m, currentUserId = null) {
  const mine = currentUserId != null && Number(m.author_id) === Number(currentUserId);
  const colorIndex = Math.abs(Number(m.author_id) || 0) % 6;
  return el(`article.chat-message.author-color-${colorIndex}${mine ? '.mine' : ''}`, { dataset: { messageId: m.id } },
    el('div.chat-meta', {}, el('strong', { text: m.author_name }),
      mine ? el('span.chat-me', { text: t('chat.me') }) : null,
      el('time', { datetime: m.created_at, text: new Date(m.created_at).toLocaleString(getLang()) })),
    el('p', { text: m.body })); // User content is always textContent, never HTML.
}

export async function renderChat(mount, { user }) {
  mount.append(spinner());
  const initial = await api.chatMessages();
  const messages = new Map(initial.messages.map(m => [m.id, m]));
  let latest = initial.messages.at(-1)?.id || 0;
  let olderAvailable = initial.hasMore;
  let sending = false;
  const log = el('div.chat-log', { role: 'log', 'aria-label': t('nav.chat'), 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const status = el('p.hint', { role: 'status' });
  const empty = el('p.hint', { text: t('chat.empty') });
  const input = el('textarea', { id: 'chat-body', rows: 3, maxlength: 2000, required: true, placeholder: t('chat.placeholder') });
  const send = el('button.btn.primary', { type: 'submit', text: t('chat.send') });
  const older = el('button.btn.chat-older', { text: t('chat.older'), onclick: async () => {
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
  } });
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
  const composer = el('form.card.chat-composer', { onsubmit: async e => {
    e.preventDefault();
    if (sending || !input.value.trim()) return;
    sending = true; send.disabled = true; input.readOnly = true;
    try {
      const { message } = await api.sendChatMessage(input.value);
      merge([message]); input.value = ''; status.textContent = '';
      // Do not advance the polling cursor here: concurrent messages from other
      // authors between the previous poll and this post must still be fetched.
      log.scrollTop = log.scrollHeight;
    } catch (err) { status.textContent = err.message; }
    finally { sending = false; send.disabled = false; input.readOnly = false; }
  } }, el('label', { for: 'chat-body', text: t('chat.message') }), input,
  el('div.actions', {}, el('span.hint', { text: t('chat.limits') }), send));
  mount.replaceChildren(el('div.page-head', {}, el('div', {}, el('h1', { text: t('nav.chat') + ' · General' }), el('p', { text: t('chat.scope') }))), older, empty, log, status, composer);
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
