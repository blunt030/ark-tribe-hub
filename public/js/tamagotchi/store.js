/**
 * Zustand des Dino-Tamagotchis im Browser.
 *
 * Lädt den Spielstand des Kontos, lässt die Zeit laufen (auch wenn die Seite
 * nicht offen ist, damit das Menü-Symbol Rufe anzeigen kann), führt Aktionen aus
 * und speichert sie gebündelt. Die Serverzeit gleicht falsch gehende Geräteuhren
 * aus; ein 409 bedeutet, dass ein anderes Gerät weitergespielt hat – dann wird
 * dessen neuerer Stand übernommen.
 */
import { api } from '../api.js';
import * as E from './engine.js';

const listeners = new Set();
const state = { doc: null, revision: 0, offset: 0, status: 'idle', userId: null, dirty: false, saving: false };
let loading = null;
let saveTimer = null;
let tickTimer = null;
let resave = false;

export const petState = state;
export const petNow = () => Date.now() + state.offset;

export function onPetChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event) {
  for (const fn of [...listeners]) {
    try { fn(state, event); } catch (err) { console.error(err); }
  }
}

/** Ältere oder unvollständige Spielstände auf das aktuelle Format bringen. */
function normalize(doc) {
  const d = doc && typeof doc === 'object' ? doc : E.newDoc();
  d.v = E.DOC_VERSION;
  d.dex ||= {};
  d.hall ||= [];
  d.settings = { shell: 'tek', retro: false, ...(d.settings || {}) };
  return d;
}

function snapshot(p) {
  if (!p) return null;
  return {
    id: p.id, stage: p.stage, variant: p.variant, end: Boolean(p.end), cryo: Boolean(p.cryo), sick: p.sick, poop: p.poop,
    asleep: p.asleep, request: p.request?.type || null, calling: E.calling(p, petNow()).join(','),
  };
}

function changes(a, b) {
  if (!a || !b || a.id !== b.id) return b ? ['new'] : [];
  const out = [];
  if (a.stage !== b.stage) out.push(b.stage === 'baby' ? 'hatch' : 'evolve');
  if (a.variant !== b.variant && b.variant === 'tek') out.push('secret');
  if (!a.end && b.end) out.push('end');
  if (!a.cryo && b.cryo) out.push('frozen');
  if (b.sick > a.sick) out.push('sick');
  if (b.poop > a.poop) out.push('poop');
  if (a.asleep !== b.asleep) out.push(b.asleep ? 'sleep' : 'wake');
  if (!a.request && b.request) out.push('request');
  if (b.calling && b.calling !== a.calling) out.push('call');
  return out;
}

export function loadPet(user, { force = false } = {}) {
  if (!force && state.status === 'ready' && state.userId === user.id) return Promise.resolve(state);
  if (loading) return loading;
  state.userId = user.id;
  state.status = 'loading';
  loading = api.pet()
    .then((res) => {
      state.offset = Number(res.serverTime) - Date.now() || 0;
      state.doc = normalize(res.doc);
      state.revision = res.revision;
      state.status = 'ready';
      E.advanceDoc(state.doc, petNow());
      startTicker();
      emit({ type: 'load', events: [] });
      return state;
    })
    .catch((err) => {
      state.status = 'error';
      state.error = err;
      emit({ type: 'error', err });
      throw err;
    })
    .finally(() => { loading = null; });
  return loading;
}

/** Zeit weiterlaufen lassen und Ereignisse (Schlüpfen, Entwicklung, Ruf …) melden. */
export function tickPet() {
  if (!state.doc) return [];
  const before = snapshot(state.doc.pet);
  E.advanceDoc(state.doc, petNow());
  const events = changes(before, snapshot(state.doc.pet));
  // Meilensteine sofort sichern, damit das Tribe-Gehege aktuell bleibt.
  if (events.some((e) => ['hatch', 'evolve', 'secret', 'end', 'frozen'].includes(e))) markDirty();
  emit({ type: 'tick', events });
  return events;
}

function startTicker() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => { if (document.visibilityState === 'visible') tickPet(); }, 20_000);
}

function markDirty(delay = 1200) {
  state.dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { savePet(); }, delay);
}

/**
 * Führt eine Aktion aus. fn(doc, now) arbeitet mit den Engine-Funktionen und
 * liefert { ok, code, … }. Nur erfolgreiche Aktionen werden gespeichert.
 */
export function petAct(fn) {
  if (!state.doc) return { ok: false, code: 'no_pet' };
  const before = snapshot(state.doc.pet);
  E.advanceDoc(state.doc, petNow());
  const res = fn(state.doc, petNow()) || { ok: true };
  E.syncDex(state.doc);
  if (res.ok !== false) markDirty();
  emit({ type: 'act', res, events: changes(before, snapshot(state.doc.pet)) });
  return res;
}

export async function savePet({ keepalive = false } = {}) {
  clearTimeout(saveTimer);
  if (!state.doc || !state.dirty) return;
  if (state.saving) { resave = true; return; }
  state.saving = true;
  state.dirty = false;
  try {
    const res = await api.savePet(state.doc, state.revision, { keepalive });
    state.revision = res.revision;
    state.offset = Number(res.serverTime) - Date.now() || state.offset;
    emit({ type: 'saved', events: [] });
  } catch (err) {
    if (err.status === 409 && err.data && 'doc' in err.data) {
      state.doc = normalize(err.data.doc);
      state.revision = err.data.revision;
      E.advanceDoc(state.doc, petNow());
      emit({ type: 'conflict', events: [] });
    } else {
      state.dirty = true;
      emit({ type: 'save-error', err, events: [] });
      if (!keepalive) saveTimer = setTimeout(() => { savePet(); }, 15_000);
    }
  } finally {
    state.saving = false;
    if (resave) { resave = false; markDirty(200); }
  }
}

/** Offene Änderungen noch mitnehmen, wenn der Tab in den Hintergrund geht. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') savePet({ keepalive: true });
    else if (state.status === 'ready') tickPet();
  });
}

/** Beim Abmelden alles vergessen. */
export function resetPet() {
  clearTimeout(saveTimer);
  clearInterval(tickTimer);
  Object.assign(state, { doc: null, revision: 0, offset: 0, status: 'idle', userId: null, dirty: false, saving: false });
  emit({ type: 'reset', events: [] });
}

/** Anzahl der Rufe für das Menü-Abzeichen. */
export function petCalls() {
  const p = state.doc?.pet;
  if (!p) return 0;
  return E.calling(p, petNow()).length + (E.needs(p, petNow()).includes('hatch') ? 1 : 0);
}
