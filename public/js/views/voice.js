import { el, spinner, emptyState, toast, confirmDialog } from '../ui.js';
import { t } from '../i18n.js';
import { api } from '../api.js';

export async function renderVoice(mount, ctx) {
  const { user } = ctx;
  mount.append(spinner());

  const [{ channels: initialChannels }, rtcConfig] = await Promise.all([
    api.voiceChannels(),
    api.voiceConfig().catch(() => ({ iceServers: [], turnConfigured: false })),
  ]);
  let channels = initialChannels;
  let activeChannelId = null;
  let localStream = null;
  let lastSignalId = 0;
  let polling = false;
  let pollTimer = null;
  let shuttingDown = false;
  const peers = new Map();
  const audioStage = el('div.voice-audio-stage', { 'aria-live': 'polite' });
  const listBox = el('div.voice-channel-list');
  const connectionState = el('p.voice-state.hint', { role: 'status', text: t('voice.ready') });

  const channelForMe = () => channels.find((channel) =>
    channel.participants.some((participant) => Number(participant.user_id) === Number(user.id))
  );

  function stopPeer(peerId) {
    const normalizedPeerId = Number(peerId);
    const entry = peers.get(normalizedPeerId);
    if (!entry) return;
    peers.delete(normalizedPeerId);
    entry.pc.ontrack = null;
    entry.pc.onicecandidate = null;
    entry.pc.onconnectionstatechange = null;
    entry.pc.close();
    entry.audio.remove();
  }

  async function signal(recipientId, type, payload) {
    if (!activeChannelId) return;
    try { await api.sendVoiceSignal(activeChannelId, recipientId, type, payload); }
    catch (err) {
      if (![400, 404].includes(err.status)) connectionState.textContent = err.message;
    }
  }

  function ensurePeer(peerId) {
    peerId = Number(peerId);
    if (peers.has(peerId)) return peers.get(peerId);
    const pc = new RTCPeerConnection({ iceServers: rtcConfig.iceServers || [] });
    for (const track of localStream?.getTracks() || []) pc.addTrack(track, localStream);

    const audio = el('audio', { autoplay: true, playsinline: true, dataset: { peerId: String(peerId) } });
    audioStage.append(audio);
    const entry = { pc, audio, offered: false, pendingIce: [] };
    peers.set(peerId, entry);

    pc.ontrack = (event) => {
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      audio.play().catch(() => { connectionState.textContent = t('voice.tap_to_hear'); });
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) signal(peerId, 'ice', event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') connectionState.textContent = t('voice.connected');
      if (['failed', 'disconnected'].includes(pc.connectionState)) connectionState.textContent = t('voice.connection_problem');
      if (pc.connectionState === 'closed') stopPeer(peerId);
    };
    return entry;
  }

  async function makeOffer(peerId) {
    const entry = ensurePeer(peerId);
    if (entry.offered || entry.pc.signalingState !== 'stable') return;
    entry.offered = true;
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    await signal(peerId, 'offer', entry.pc.localDescription.toJSON());
  }

  async function reconcilePeers() {
    const channel = channels.find((item) => Number(item.id) === Number(activeChannelId));
    if (!channel || !localStream) return;
    const current = new Set(channel.participants
      .map((participant) => Number(participant.user_id))
      .filter((id) => id !== Number(user.id)));
    for (const peerId of [...peers.keys()]) if (!current.has(peerId)) stopPeer(peerId);
    for (const peerId of current) {
      ensurePeer(peerId);
      if (Number(user.id) < peerId) await makeOffer(peerId);
    }
  }

  async function handleSignal(message) {
    const peerId = Number(message.senderId);
    if (message.type === 'bye') { stopPeer(peerId); return; }
    const entry = ensurePeer(peerId);
    if (message.type === 'offer') {
      await entry.pc.setRemoteDescription(message.payload);
      for (const candidate of entry.pendingIce.splice(0)) await entry.pc.addIceCandidate(candidate).catch(() => {});
      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      await signal(peerId, 'answer', entry.pc.localDescription.toJSON());
    } else if (message.type === 'answer') {
      if (entry.pc.signalingState === 'have-local-offer') {
        await entry.pc.setRemoteDescription(message.payload);
        for (const candidate of entry.pendingIce.splice(0)) await entry.pc.addIceCandidate(candidate).catch(() => {});
      }
    } else if (message.type === 'ice' && message.payload) {
      if (!entry.pc.remoteDescription) entry.pendingIce.push(message.payload);
      else await entry.pc.addIceCandidate(message.payload).catch(() => { /* stale candidate */ });
    }
  }

  async function pollVoice() {
    if (polling || shuttingDown || !activeChannelId || !mount.isConnected) return;
    polling = true;
    try {
      const [{ signals }, channelResult] = await Promise.all([
        api.voiceSignals(activeChannelId, lastSignalId),
        api.voiceChannels(),
      ]);
      channels = channelResult.channels;
      for (const message of signals) {
        lastSignalId = Math.max(lastSignalId, Number(message.id));
        await handleSignal(message);
      }
      await reconcilePeers();
      draw();
    } catch (err) {
      connectionState.textContent = err.message;
      if ([401, 403, 404].includes(err.status)) await stopLocal(false);
    } finally {
      polling = false;
      if (activeChannelId && mount.isConnected && !shuttingDown) pollTimer = setTimeout(pollVoice, 1800);
    }
  }

  async function join(channelId) {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      toast(t('voice.unsupported'), 'err');
      return;
    }
    connectionState.textContent = t('voice.mic_request');
    try {
      if (activeChannelId) await stopLocal(true);
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      await api.voiceJoin(channelId);
      activeChannelId = Number(channelId);
      lastSignalId = 0;
      connectionState.textContent = t('voice.joined_audio');
      channels = (await api.voiceChannels()).channels;
      draw();
      await reconcilePeers();
      pollVoice();
    } catch (err) {
      localStream?.getTracks().forEach((track) => track.stop());
      localStream = null;
      connectionState.textContent = err?.name === 'NotAllowedError' ? t('voice.mic_denied') : (err.message || t('common.error'));
      toast(connectionState.textContent, 'err');
    }
  }

  async function stopLocal(notifyServer = true) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearTimeout(pollTimer);
    pollTimer = null;
    const channelId = activeChannelId;
    const otherIds = [...peers.keys()];
    if (notifyServer && channelId) {
      await Promise.all(otherIds.map((id) => signal(id, 'bye', null))).catch(() => {});
      await api.voiceLeave(channelId).catch(() => {});
    }
    for (const id of otherIds) stopPeer(id);
    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;
    activeChannelId = null;
    lastSignalId = 0;
    shuttingDown = false;
    connectionState.textContent = t('voice.ready');
  }

  async function setMuted(channelId, muted) {
    localStream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    await api.voiceMute(channelId, muted);
    channels = (await api.voiceChannels()).channels;
    draw();
  }

  function draw() {
    const mine = channelForMe();
    if (mine && localStream) activeChannelId = Number(mine.id);
    listBox.replaceChildren(
      ...(channels.length ? channels.map((channel) => {
        const me = channel.participants.find((participant) => Number(participant.user_id) === Number(user.id));
        const iAmIn = Boolean(me) && Number(activeChannelId) === Number(channel.id) && Boolean(localStream);
        return el('article.voice-channel' + (iAmIn ? '.active' : ''), {},
          el('div.voice-channel-main', {},
            el('div', {},
              el('h2', { text: channel.name }),
              el('div.hint', { text: t('voice.participants_count', { n: channel.participants.length }) })
            ),
            el('div.chips', {},
              iAmIn ? el('button.btn.sm', {
                text: me.is_muted ? t('voice.unmute') : t('voice.mute'),
                onclick: () => setMuted(channel.id, !me.is_muted),
              }) : null,
              iAmIn ? el('button.btn.sm.danger', {
                text: t('voice.leave'), onclick: async () => { await stopLocal(true); channels = (await api.voiceChannels()).channels; draw(); },
              }) : el('button.btn.sm.primary', { text: t('voice.join'), onclick: () => join(channel.id) }),
              (user.roles.includes('admin') || user.roles.includes('developer')) ? el('button.btn.sm.ghost', {
                text: '✕', 'aria-label': t('common.delete'), onclick: async () => {
                  if (!await confirmDialog({ title: t('voice.delete_confirm', { name: channel.name }), danger: true })) return;
                  try { await api.deleteVoiceChannel(channel.id); channels = (await api.voiceChannels()).channels; draw(); }
                  catch (err) { toast(err.message, 'err'); }
                },
              }) : null
            )
          ),
          channel.participants.length ? el('div.voice-participants', {}, ...channel.participants.map((participant) =>
            el('span.badge' + (Number(participant.user_id) === Number(user.id) ? '.b-role' : ''), {
              text: `${participant.is_muted ? '🔇' : '🎤'} ${participant.username}`,
            })
          )) : null
        );
      }) : [emptyState(t('voice.none'))])
    );
  }

  const newChannelInput = el('input', { type: 'text', placeholder: t('voice.new_ph') });
  const createButton = el('button.btn.primary', {
    text: '+ ' + t('voice.new'),
    onclick: async () => {
      if (!newChannelInput.value.trim()) return;
      try {
        await api.createVoiceChannel({ name: newChannelInput.value.trim() });
        newChannelInput.value = '';
        channels = (await api.voiceChannels()).channels;
        draw();
      } catch (err) { toast(err.message, 'err'); }
    },
  });

  mount.replaceChildren(...[
    el('div.page-head', {}, el('div', {}, el('h1', { text: t('voice.title') }), el('p', { text: t('voice.audio_sub') }))),
    !rtcConfig.turnConfigured ? el('div.notice.note', { text: t('voice.turn_hint') }) : null,
    connectionState,
    el('div.card.voice-create', {}, newChannelInput, createButton),
    listBox,
    audioStage
  ].filter(Boolean));
  draw();

  const lifecycle = setInterval(() => {
    if (!mount.isConnected) {
      clearInterval(lifecycle);
      stopLocal(true);
    }
  }, 1000);
}
