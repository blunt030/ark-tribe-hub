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
import * as P from './progress.js';
import { setRoster } from './roster.js';

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

/** Ältere oder unvollständige Spielstände auf das aktuelle Format bringen (mit Spielerprofil). */
function normalize(doc) {
  return P.upgradeDoc(doc && typeof doc === 'object' ? doc : P.newGame(), petNow());
}

function snapshot(p) {
  if (!p) return null;
  return {
    id: p.id, stage: p.stage, variant: p.variant, end: Boolean(p.end), cryo: Boolean(p.cryo), sick: p.sick, poop: p.poop,
    asleep: p.asleep, request: p.request?.type || null, calling: E.calling(p, petNow()).join(','),
    away: E.isAway(p), loot: Boolean(p.exp?.done),
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
  if (!a.loot && b.loot) out.push('back');
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
      // Zuerst die Einstellungen des Betreibers (Startguthaben, Events, Arten)
      setRoster(res.config || null);
      rosterAt = Date.now();
      const upgrade = Boolean(res.doc?.pet) && !res.doc.player;
      state.doc = normalize(res.doc);
      state.revision = res.revision;
      state.status = 'ready';
      const notes = P.advanceGame(state.doc, petNow());
      startTicker();
      // Spielstände aus Version 1 bekommen ihr Spielerprofil gleich gesichert.
      if (upgrade || notes.some((n) => n.type !== 'day')) markDirty(2000);
      emit({ type: 'load', events: [], notes });
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

/**
 * Zeit weiterlaufen lassen und Ereignisse (Schlüpfen, Entwicklung, Ruf …) sowie
 * Fortschritts-Hinweise (neuer Tag, Erfolg …) melden.
 */
export function tickPet() {
  if (!state.doc) return [];
  const before = snapshot(state.doc.pet);
  const notes = P.advanceGame(state.doc, petNow());
  const events = changes(before, snapshot(state.doc.pet));
  // Meilensteine und Belohnungen sofort sichern, damit das Tribe-Gehege aktuell bleibt.
  if (events.some((e) => ['hatch', 'evolve', 'secret', 'end', 'frozen', 'back'].includes(e)) || notes.some((n) => n.type !== 'day')) markDirty();
  emit({ type: 'tick', events, notes });
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
 * Führt eine Aktion aus. fn(doc, now) arbeitet mit den Funktionen aus
 * progress.js (bzw. der Engine) und liefert { ok, code, given, notes, … }.
 * Nur erfolgreiche Aktionen werden gespeichert. Die Hinweise (`notes`) gehen
 * gesammelt an die Oberfläche, die sie einmal anzeigt.
 */
export function petAct(fn) {
  if (!state.doc) return { ok: false, code: 'no_pet' };
  const before = snapshot(state.doc.pet);
  const pre = P.advanceGame(state.doc, petNow());
  const res = fn(state.doc, petNow()) || { ok: true };
  E.syncDex(state.doc);
  if (res.ok !== false) markDirty();
  emit({ type: 'act', res, events: changes(before, snapshot(state.doc.pet)), notes: [...pre, ...(res.notes || [])] });
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
      adopt(err.data.doc, err.data.revision);
      emit({ type: 'conflict', events: [] });
    } else if (err.status === 403 && err.code === 'SPECIES_LOCKED') {
      // Art inzwischen nicht mehr frei (z. B. vom Betreiber geändert): Stand und Einstellungen neu laden
      const user = { id: state.userId };
      state.status = 'idle';
      loadPet(user, { force: true }).then(() => emit({ type: 'locked', events: [] })).catch(() => {});
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

/** Stand vom Server übernehmen (Konflikt, Geschenk). */
function adopt(doc, revision) {
  state.doc = normalize(doc);
  state.revision = revision;
  P.advanceGame(state.doc, petNow());
}

/** Einstellungen des Betreibers und Freischaltungen neu holen (z. B. nach einem Kauf). */
let rosterAt = 0;
export async function refreshRoster(config = null) {
  const cfg = config || (await api.petConfig()).config;
  rosterAt = Date.now();
  setRoster(cfg);
  emit({ type: 'roster', events: [] });
  return cfg;
}

/** Neue Geschenke, Ankündigungen und Events holen – höchstens alle paar Minuten. */
export function refreshRosterSoon(maxAge = 5 * 60_000) {
  if (state.status !== 'ready' || Date.now() - rosterAt < maxAge) return;
  rosterAt = Date.now();
  refreshRoster().catch(() => { rosterAt = 0; });
}

/**
 * Geschenk annehmen: erst offene Änderungen sichern, dann schreibt der Server
 * Splitter und Gegenstände in den Spielstand; der neue Stand wird übernommen.
 */
export async function claimGift(id) {
  if (!state.doc) throw new Error('no_doc');
  if (!state.revision) state.dirty = true;
  await savePet();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await api.claimPetGift(id, state.revision);
      adopt(res.doc, res.revision);
      state.offset = Number(res.serverTime) - Date.now() || state.offset;
      await refreshRoster();
      emit({ type: 'gift', events: [], given: res.given });
      return res.given;
    } catch (err) {
      if (err.status === 409 && err.data && 'doc' in err.data && attempt === 0) {
        adopt(err.data.doc, err.data.revision);
        emit({ type: 'conflict', events: [] });
        continue;
      }
      throw err;
    }
  }
  return null;
}

/** Offene Änderungen noch mitnehmen, wenn der Tab in den Hintergrund geht. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') savePet({ keepalive: true });
    else if (state.status === 'ready') { tickPet(); refreshRosterSoon(); }
  });
}

/** Beim Abmelden alles vergessen. */
export function resetPet() {
  clearTimeout(saveTimer);
  clearInterval(tickTimer);
  Object.assign(state, { doc: null, revision: 0, offset: 0, status: 'idle', userId: null, dirty: false, saving: false });
  emit({ type: 'reset', events: [] });
}

/**
 * Anzahl für das Menü-Abzeichen: Rufe des Tiers, Schlüpfen, mitgebrachte Beute
 * und – für alle, die schon spielen – die tägliche Versorgungskiste.
 */
export function petCalls() {
  const doc = state.doc;
  if (!doc) return 0;
  const now = petNow();
  const p = doc.pet;
  const drop = (p || doc.player?.lastDay) && P.dropReady(doc, now) ? 1 : 0;
  if (!p) return drop;
  const needs = E.needs(p, now);
  return drop + E.calling(p, now).length + (needs.includes('hatch') ? 1 : 0) + (needs.includes('loot') ? 1 : 0);
}
