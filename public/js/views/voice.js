import { el, spinner, emptyState, toast, confirmDialog } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';

export async function renderVoice(mount, ctx) {
  const { user } = ctx;
  mount.append(spinner());
  let channels = (await api.voiceChannels()).channels;

  const listBox = el('div.list');

  function myChannelId() {
    for (const ch of channels) if (ch.participants.some((p) => p.user_id === user.id)) return ch.id;
    return null;
  }

  function draw() {
    const mine = myChannelId();
    listBox.replaceChildren(
      ...(channels.length
        ? channels.map((ch) => {
            const iAmIn = ch.participants.some((p) => p.user_id === user.id);
            const me = ch.participants.find((p) => p.user_id === user.id);
            return el('div.card', { style: 'margin-bottom:12px' },
              el('div', { style: 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px' },
                el('div', {},
                  el('div', { style: 'font-family:var(--ff-display);font-weight:700', text: '🎙️ ' + ch.name }),
                  el('div.hint', { text: t('voice.participants_count', { n: ch.participants.length }) })
                ),
                el('div.chips', {},
                  iAmIn
                    ? el('button.btn.sm' + (me.is_muted ? '.primary' : ''), {
                        text: me.is_muted ? t('voice.unmute') : t('voice.mute'),
                        onclick: async () => { await api.voiceMute(ch.id, !me.is_muted); await reload(); },
                      })
                    : null,
                  iAmIn
                    ? el('button.btn.sm.danger', { text: t('voice.leave'), onclick: async () => { await api.voiceLeave(ch.id); await reload(); } })
                    : el('button.btn.sm.primary', {
                        text: t('voice.join'),
                        onclick: async () => {
                          try { await api.voiceJoin(ch.id); await reload(); }
                          catch (err) { toast(err.message, 'err'); }
                        },
                      }),
                  (user.roles.includes('admin') || user.roles.includes('developer'))
                    ? el('button.btn.sm.ghost', {
                        text: '✕',
                        'aria-label': t('common.delete'),
                        onclick: async () => {
                          const ok = await confirmDialog({ title: t('voice.delete_confirm', { name: ch.name }), danger: true });
                          if (!ok) return;
                          try { await api.deleteVoiceChannel(ch.id); toast(t('voice.deleted')); await reload(); }
                          catch (err) { toast(err.message, 'err'); }
                        },
                      })
                    : null
                )
              ),
              ch.participants.length
                ? el('div.chips', { style: 'margin-top:12px' },
                    ...ch.participants.map((p) =>
                      el('span.badge' + (p.user_id === user.id ? '.b-role' : ''), {
                        text: `${p.is_muted ? '🔇' : '🎤'} ${p.username}`,
                      })
                    )
                  )
                : null
            );
          })
        : [emptyState(t('voice.none'))])
    );
  }

  async function reload() {
    channels = (await api.voiceChannels()).channels;
    draw();
  }

  const newChannelInput = el('input', { type: 'text', placeholder: t('voice.new_ph') });
  const createBtn = el('button.btn.primary', {
    text: '+ ' + t('voice.new'),
    onclick: async () => {
      if (!newChannelInput.value.trim()) return;
      try {
        await api.createVoiceChannel({ name: newChannelInput.value.trim() });
        newChannelInput.value = '';
        await reload();
      } catch (err) { toast(err.message, 'err'); }
    },
  });

  mount.replaceChildren();
  mount.append(
    el('div.page-head', {}, el('div', {}, el('h1', { text: t('voice.title') }), el('p', { text: t('voice.sub') }))),
    el('div.card', {}, el('div', { style: 'display:flex;gap:8px' }, newChannelInput, createBtn)),
    el('div', { style: 'margin-top:16px' }, listBox)
  );
  draw();
}
