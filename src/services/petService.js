import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { badRequest, payloadTooLarge } from '../lib/http.js';

/**
 * Dino-Tamagotchi: Spielstände speichern und prüfen.
 *
 * Die Simulation läuft im Browser (public/js/tamagotchi/engine.js). Der Server
 * bewahrt den Spielstand pro Konto auf, damit das Tier auf jedem Gerät dasselbe
 * ist, und zeigt ihn den Mitgliedern desselben Tribes im Gehege. Gespeichert wird
 * nur, was die Prüfung besteht: bekannte Arten, begrenzte Größe, saubere Namen.
 */

export const PET_STATE_MAX = 64 * 1024;

const SPECIES = new Set(
  JSON.parse(readFileSync(path.join(config.rootDir, 'data', 'catalog', 'creatures.json'), 'utf8')).creatures.map((c) => c[0])
);
const STAGES = ['egg', 'baby', 'juvenile', 'adolescent', 'adult', 'elder'];
const VARIANTS = ['alpha', 'loyal', 'feral', 'tek'];
const MODES = ['relaxed', 'classic'];
const SHELLS = ['tek', 'bronze', 'obsidian', 'amber', 'aberrant', 'ice'];
const METERS = ['hunger', 'happy', 'energy', 'health', 'discipline', 'imprint'];
const PERSONALITIES = ['glutton', 'playful', 'sleepy', 'robust', 'cheeky', 'clingy', 'nightowl'];
const COLOR = /^#[0-9a-f]{6}$/;
// Keine Steuerzeichen und keine unsichtbaren Bidi-/Trennzeichen in Namen.
const BAD_NAME = new RegExp('[\\p{Cc}' + [[0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]]
  .map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join('') + ']', 'u');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const time = (v) => num(v, 0, 1e14);
const optTime = (v) => v === null || v === undefined || time(v);
const petName = (v) => typeof v === 'string' && v.trim().length > 0 && Array.from(v).length <= 24 && !BAD_NAME.test(v);

function invalid(what) {
  return badRequest(`Ungültiger Spielstand (${what})`, 'VALIDATION_ERROR');
}

function checkColors(c) {
  if (c === null || c === undefined) return;
  if (!isObj(c)) throw invalid('colors');
  for (const [k, v] of Object.entries(c)) {
    if (!['0', '1', '2'].includes(k) || (v !== null && !COLOR.test(v))) throw invalid('colors');
  }
}

function checkPet(p) {
  if (!isObj(p)) throw invalid('pet');
  if (!SPECIES.has(p.species)) throw invalid('species');
  if (!petName(p.name)) throw invalid('name');
  if (!STAGES.includes(p.stage)) throw invalid('stage');
  if (p.variant !== null && p.variant !== undefined && !VARIANTS.includes(p.variant)) throw invalid('variant');
  if (!MODES.includes(p.mode)) throw invalid('mode');
  if (!PERSONALITIES.includes(p.personality)) throw invalid('personality');
  if (!num(p.gen, 1, 100000) || !num(p.seed, 0, 4294967295)) throw invalid('gen');
  for (const k of ['t', 'bornAt', 'hatchAt', 'stageAt']) if (!time(p[k])) throw invalid(k);
  if (!isObj(p.m)) throw invalid('meters');
  for (const k of METERS) if (!num(p.m[k], 0, 100)) throw invalid(k);
  if (!num(p.m.weight, 0, 10000)) throw invalid('weight');
  if (!num(p.poop, 0, 4) || !num(p.sick, 0, 2) || !num(p.cm, 0, 1e6) || !num(p.dm, 0, 1e6)) throw invalid('status');
  if (!Array.isArray(p.log) || p.log.length > 100) throw invalid('log');
  for (const entry of p.log) if (!isObj(entry) || !time(entry.t) || typeof entry.k !== 'string' || entry.k.length > 40) throw invalid('log');
  if (p.end !== null && p.end !== undefined && (!isObj(p.end) || !time(p.end.at) || typeof p.end.cause !== 'string' || p.end.cause.length > 20)) throw invalid('end');
  if (p.cryo !== null && p.cryo !== undefined && (!isObj(p.cryo) || !time(p.cryo.at))) throw invalid('cryo');
  for (const k of ['nextPoopAt', 'nextRequestAt', 'nextMisbehaveAt', 'sleptAt', 'napUntil', 'dazedUntil', 'sickSince']) if (!optTime(p[k])) throw invalid(k);
  checkColors(p.colors);
}

/** Wirft 400/413, wenn der Spielstand nicht gespeichert werden darf; liefert sonst den JSON-Text. */
export function validatePetDoc(doc) {
  if (!isObj(doc) || doc.v !== 1) throw invalid('version');
  if (doc.pet !== null && doc.pet !== undefined) checkPet(doc.pet);
  if (!isObj(doc.dex)) throw invalid('dex');
  for (const [key, e] of Object.entries(doc.dex)) {
    if (!SPECIES.has(key) || !isObj(e) || !num(e.h, 0, 1e6) || !num(e.a, 0, 1e6) || !Array.isArray(e.v) || e.v.length > 4 || e.v.some((v) => !VARIANTS.includes(v))) throw invalid('dex');
  }
  if (!Array.isArray(doc.hall) || doc.hall.length > 30) throw invalid('hall');
  for (const h of doc.hall) {
    if (!isObj(h) || !SPECIES.has(h.species) || !petName(h.name) || !num(h.gen, 1, 100000) || typeof h.cause !== 'string' || h.cause.length > 20) throw invalid('hall');
    if (!STAGES.includes(h.stage) || (h.variant != null && !VARIANTS.includes(h.variant)) || !num(h.age, 0, 1e14) || !time(h.at)) throw invalid('hall');
    checkColors(h.colors);
  }
  if (!isObj(doc.settings) || !SHELLS.includes(doc.settings.shell) || typeof doc.settings.retro !== 'boolean') throw invalid('settings');
  const state = JSON.stringify(doc);
  if (state.length > PET_STATE_MAX) throw payloadTooLarge('Spielstand zu groß');
  return state;
}

/** Was Tribe-Mitglieder vom Tier eines anderen sehen: der Zustand, nicht das Protokoll. */
export function publicPet(p) {
  if (!isObj(p)) return null;
  const { log, dex, snacks, cool, ...rest } = p;
  return rest;
}

export async function loadPet(db, userId) {
  const row = await db.get('SELECT state, revision FROM pets WHERE user_id = ?', [userId]);
  return row ? { doc: JSON.parse(row.state), revision: Number(row.revision) } : { doc: null, revision: 0 };
}

/**
 * Speichert mit optimistischer Sperre: Nur wer die aktuelle Revision kennt, darf
 * schreiben. Sonst kommt der neuere Stand zurück und der Browser übernimmt ihn.
 */
export async function savePet(db, userId, state, baseRevision) {
  const now = new Date().toISOString();
  return db.transaction(async (tx) => {
    const row = baseRevision === 0
      ? await tx.get('INSERT INTO pets (user_id, state, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (user_id) DO NOTHING RETURNING revision', [userId, state, now])
      : await tx.get('UPDATE pets SET state = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision', [state, now, userId, baseRevision]);
    if (row) return { ok: true, revision: Number(row.revision) };
    const current = await tx.get('SELECT state, revision FROM pets WHERE user_id = ?', [userId]);
    return { ok: false, doc: current ? JSON.parse(current.state) : null, revision: current ? Number(current.revision) : 0 };
  });
}

export async function tribePets(db, tribeId) {
  const rows = await db.all(
    `SELECT u.id AS user_id, u.username, p.state, p.updated_at
       FROM pets p JOIN users u ON u.id = p.user_id
      WHERE u.tribe_id = ? AND u.status = 'active'
      ORDER BY p.updated_at DESC LIMIT 100`,
    [tribeId]
  );
  const out = [];
  for (const r of rows) {
    let doc;
    try { doc = JSON.parse(r.state); } catch { continue; }
    if (!doc?.pet) continue;
    out.push({
      userId: r.user_id,
      username: r.username,
      pet: publicPet(doc.pet),
      raised: Object.values(doc.dex || {}).filter((e) => e.a > 0).length,
      updatedAt: r.updated_at,
    });
  }
  return out;
}
