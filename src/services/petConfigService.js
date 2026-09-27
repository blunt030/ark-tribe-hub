import { badRequest, conflict, notFound, ApiError } from '../lib/http.js';
import { BUNDLED, cleanArtMeta } from '../../public/js/tamagotchi/artwork.js';
import { artKeys, freeKeys, speciesInDoc } from '../../public/js/tamagotchi/access.js';
import { ITEMS, EVENTS } from '../../public/js/tamagotchi/catalog.js';
import { SPECIES as SPECIES_LIST } from '../../public/js/tamagotchi/species.js';
import { KNOWN_SPECIES, validatePetDoc } from './petService.js';
import { stripeStatus } from './stripeService.js';

/**
 * Tamagotchi-Verwaltung: Einstellungen des Betreibers (Gratis-Arten, Preise,
 * Verkauf, Events, Ankündigung), hochgeladene Tierbilder, Freischaltungen je
 * Konto, Käufe und Geschenke. Die Spiel-Simulation selbst läuft im Browser.
 */

/** 20 Arten mit Bild, die ohne Kauf ausgebrütet werden können (bis der Betreiber es ändert). */
export const DEFAULT_FREE = [
  'rex', 'triceratops', 'brontosaurus', 'ankylosaurus', 'argentavis', 'pteranodon', 'dimorphodon', 'direwolf',
  'doedicurus', 'daeodon', 'megatherium', 'carnotaurus', 'allosaurus', 'baryonyx', 'kaprosuchus', 'basilosaurus',
  'therizinosaurus', 'yutyrannus', 'acrocanthosaurus', 'megalodon',
];

export const DEFAULT_SETTINGS = Object.freeze({
  roster: { free: DEFAULT_FREE, off: [], prices: {} },
  sale: { enabled: false, price: 199, terms: '', withdrawal: '' },
  game: { news: null, events: { off: [], weekend: true }, custom: [], startShards: 30 },
});

export const PRICE_MIN = 50;
export const PRICE_MAX = 100_000;
const MULTS = [1, 1.5, 2, 3];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Keine Steuerzeichen und keine unsichtbaren Bidi-/Trennzeichen (wie bei Tiernamen).
const INVISIBLE = [[0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]]
  .map(([a, b]) => String.fromCodePoint(a) + '-' + String.fromCodePoint(b)).join('');
const CONTROL = new RegExp('[\\p{Cc}' + INVISIBLE + ']', 'u');
const HIDDEN = new RegExp('[' + INVISIBLE + ']', 'u');
const NAMES = new Map(SPECIES_LIST.map((s) => [s.key, s.name]));

export const speciesName = (key) => NAMES.get(key) || key;
const nowIso = () => new Date().toISOString();

/* -------------------------------------------------------------------------- */
/* Einstellungen                                                                 */
/* -------------------------------------------------------------------------- */

// Kurzer Zwischenspeicher: Einstellungen und Bildliste werden bei jedem
// Speichern eines Spielstands gebraucht, ändern sich aber selten. Änderungen
// über die Verwaltung leeren ihn sofort.
let cache = null;
const CACHE_MS = 30_000;
export function invalidatePetConfig() { cache = null; }

async function cached(db) {
  if (cache && cache.db === db && Date.now() - cache.at < CACHE_MS) return cache;
  const [settings, art] = await Promise.all([readSettings(db), readArt(db)]);
  cache = { db, at: Date.now(), settings, art };
  return cache;
}

async function readSettings(db) {
  const out = structuredClone(DEFAULT_SETTINGS);
  const rows = await db.all("SELECT key, value FROM pet_settings WHERE key IN ('roster', 'sale', 'game')");
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value);
      if (v && typeof v === 'object') out[r.key] = { ...out[r.key], ...v };
    } catch { /* kaputter Eintrag: Standardwerte */ }
  }
  out.game.events = { ...DEFAULT_SETTINGS.game.events, ...(out.game.events || {}) };
  return out;
}

export async function loadSettings(db) {
  return structuredClone((await cached(db)).settings);
}

async function writeSetting(db, key, value, userId) {
  await db.run(
    `INSERT INTO pet_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), userId, nowIso()]
  );
  invalidatePetConfig();
}

const invalid = (what) => badRequest(`Ungültige Einstellung (${what})`, 'VALIDATION_ERROR');
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function speciesList(list, what) {
  if (!Array.isArray(list) || list.length > KNOWN_SPECIES.size) throw invalid(what);
  const out = [...new Set(list)];
  if (out.some((k) => !KNOWN_SPECIES.has(k))) throw invalid(what);
  return out.sort();
}

/** Link zu AGB/Widerruf: https-Adresse oder eigene Seite (/…). */
export function cleanLink(v, what) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || v.length > 300 || CONTROL.test(v)) throw invalid(what);
  const s = v.trim();
  if (/^\/(?!\/)[^\s]*$/.test(s)) return s;
  let url;
  try { url = new URL(s); } catch { throw invalid(what); }
  if (url.protocol !== 'https:') throw invalid(what);
  return url.href;
}

function cleanText(v, max, what) {
  if (typeof v !== 'string') throw invalid(what);
  const s = v.trim();
  if (!s || s.length > max || /[\p{Cc}]/u.test(s.replace(/\n/g, '')) || HIDDEN.test(s)) throw invalid(what);
  return s;
}

export function cleanRoster(input, current) {
  const next = { ...current };
  if (input.free !== undefined) next.free = speciesList(input.free, 'free');
  if (input.off !== undefined) next.off = speciesList(input.off, 'off');
  if (input.prices !== undefined) {
    if (!input.prices || typeof input.prices !== 'object' || Array.isArray(input.prices)) throw invalid('prices');
    const prices = {};
    for (const [k, v] of Object.entries(input.prices)) {
      if (!KNOWN_SPECIES.has(k)) throw invalid('prices');
      if (v === null) continue;
      if (!intIn(v, PRICE_MIN, PRICE_MAX)) throw invalid('prices');
      prices[k] = v;
    }
    next.prices = prices;
  }
  return next;
}

export function cleanSale(input, current) {
  const next = { ...current };
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') throw invalid('enabled');
    next.enabled = input.enabled;
  }
  if (input.price !== undefined) {
    if (!intIn(input.price, PRICE_MIN, PRICE_MAX)) throw invalid('price');
    next.price = input.price;
  }
  if (input.terms !== undefined) next.terms = cleanLink(input.terms, 'terms');
  if (input.withdrawal !== undefined) next.withdrawal = cleanLink(input.withdrawal, 'withdrawal');
  return next;
}

function validDay(s) {
  if (typeof s !== 'string' || !DAY.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function cleanGame(input, current) {
  const next = { ...current, events: { ...current.events } };
  if (input.news !== undefined) {
    if (input.news === null || input.news.text === '') next.news = null;
    else {
      if (typeof input.news !== 'object') throw invalid('news');
      const text = cleanText(input.news.text, 300, 'news');
      const link = cleanLink(input.news.link, 'news');
      // Neues Datum nur bei neuem Inhalt: So sehen Spieler eine geänderte Nachricht wieder.
      const same = current.news && current.news.text === text && (current.news.link || '') === link;
      next.news = { text, link, at: same ? current.news.at : nowIso() };
    }
  }
  if (input.events !== undefined) {
    const ev = input.events;
    if (!ev || typeof ev !== 'object') throw invalid('events');
    if (ev.off !== undefined) {
      const ids = new Set(EVENTS.map((e) => e.id));
      if (!Array.isArray(ev.off) || ev.off.some((id) => !ids.has(id))) throw invalid('events');
      next.events.off = [...new Set(ev.off)];
    }
    if (ev.weekend !== undefined) {
      if (typeof ev.weekend !== 'boolean') throw invalid('events');
      next.events.weekend = ev.weekend;
    }
  }
  if (input.custom !== undefined) {
    if (!Array.isArray(input.custom) || input.custom.length > 12) throw invalid('custom');
    next.custom = input.custom.map((c, i) => {
      if (!c || typeof c !== 'object') throw invalid('custom');
      const name = cleanText(c.name, 40, 'custom');
      if (!validDay(c.from) || !validDay(c.to) || c.from > c.to) throw invalid('custom');
      if ((Date.parse(c.to) - Date.parse(c.from)) / 86_400_000 > 60) throw invalid('custom');
      const mult = {};
      for (const k of ['xp', 'shards', 'bond']) {
        const v = c.mult?.[k] ?? 1;
        if (!MULTS.includes(v)) throw invalid('custom');
        if (v !== 1) mult[k] = v;
      }
      if (!Object.keys(mult).length) throw invalid('custom');
      const id = typeof c.id === 'string' && /^c[a-z0-9]{1,12}$/.test(c.id) ? c.id : 'c' + (Date.now() + i).toString(36);
      return { id, name, from: c.from, to: c.to, mult };
    });
  }
  if (input.startShards !== undefined) {
    if (!intIn(input.startShards, 0, 1000)) throw invalid('startShards');
    next.startShards = input.startShards;
  }
  return next;
}

/** Speichert geänderte Bereiche (nur die übergebenen Felder); liefert die neuen Einstellungen. */
export async function updateSettings(db, input, userId) {
  if (!input || typeof input !== 'object') throw invalid('body');
  const current = await loadSettings(db);
  const next = { ...current };
  if (input.roster !== undefined) next.roster = cleanRoster(input.roster || {}, current.roster);
  if (input.sale !== undefined) next.sale = cleanSale(input.sale || {}, current.sale);
  if (input.game !== undefined) next.game = cleanGame(input.game || {}, current.game);
  if (next.sale.enabled && !current.sale.enabled) {
    const missing = saleMissing(next.sale);
    if (missing.length) throw badRequest(`Verkauf kann noch nicht starten: ${missing.join(', ')}`, 'SALE_NOT_READY');
  }
  for (const key of ['roster', 'sale', 'game']) {
    if (input[key] !== undefined) await writeSetting(db, key, next[key], userId);
  }
  return next;
}

/** Was vor dem Verkaufsstart noch fehlt (leer = bereit). */
export function saleMissing(sale, stripe = stripeStatus()) {
  const out = [];
  if (!stripe.configured) out.push('STRIPE_SECRET_KEY');
  if (!stripe.webhook) out.push('STRIPE_WEBHOOK_SECRET');
  if (!sale.terms) out.push('AGB-Link');
  if (!sale.withdrawal) out.push('Widerrufsbelehrung-Link');
  return out;
}

export const saleOpen = (sale) => Boolean(sale.enabled) && saleMissing(sale).length === 0;

/* -------------------------------------------------------------------------- */
/* Tierbilder                                                                    */
/* -------------------------------------------------------------------------- */

async function readArt(db) {
  const rows = await db.all('SELECT species, meta, updated_at, CASE WHEN image_data IS NULL THEN 0 ELSE 1 END AS has_image FROM pet_art');
  const out = {};
  for (const r of rows) {
    let meta = null;
    try { meta = cleanArtMeta(JSON.parse(r.meta)); } catch { /* ungültig: ignorieren */ }
    if (!meta || !KNOWN_SPECIES.has(r.species)) continue;
    const img = Number(r.has_image) === 1;
    // Angepasste Angaben ohne eigenes Bild gelten nur für mitgelieferte Motive.
    if (!img && !BUNDLED[r.species]) continue;
    out[r.species] = { meta, img, v: Date.parse(r.updated_at).toString(36), at: r.updated_at };
  }
  return out;
}

export async function artMap(db) {
  return structuredClone((await cached(db)).art);
}

/** Alle Arten mit Bild (mitgeliefert oder hochgeladen). */
export async function artSpecies(db) {
  const art = (await cached(db)).art;
  return artKeys(Object.keys(art).filter((k) => art[k].img));
}

export async function saveArt(db, species, { meta, buffer = null, mime = null }, userId) {
  const clean = cleanArtMeta(meta);
  if (!clean) throw invalid('meta');
  const existing = await db.get('SELECT CASE WHEN image_data IS NULL THEN 0 ELSE 1 END AS has_image FROM pet_art WHERE species = ?', [species]);
  if (!buffer && !BUNDLED[species] && !(existing && Number(existing.has_image) === 1)) throw badRequest('Für diese Art gibt es noch kein Bild', 'NO_IMAGE');
  const now = nowIso();
  if (buffer) {
    await db.run(
      `INSERT INTO pet_art (species, meta, image_data, image_mime, updated_by, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT (species) DO UPDATE SET meta = excluded.meta, image_data = excluded.image_data, image_mime = excluded.image_mime,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [species, JSON.stringify(clean), buffer, mime, userId, now]
    );
  } else {
    await db.run(
      `INSERT INTO pet_art (species, meta, updated_by, updated_at) VALUES (?,?,?,?)
       ON CONFLICT (species) DO UPDATE SET meta = excluded.meta, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [species, JSON.stringify(clean), userId, now]
    );
  }
  invalidatePetConfig();
  return clean;
}

export async function deleteArt(db, species) {
  const res = await db.run('DELETE FROM pet_art WHERE species = ?', [species]);
  invalidatePetConfig();
  return res.changes > 0;
}

export async function artImage(db, species) {
  const row = await db.get('SELECT image_data AS data, image_mime AS mime FROM pet_art WHERE species = ? AND image_data IS NOT NULL', [species]);
  if (!row?.data) return null;
  return { buffer: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data), mime: row.mime || 'image/png' };
}

/* -------------------------------------------------------------------------- */
/* Freischaltungen                                                               */
/* -------------------------------------------------------------------------- */

export async function unlocksOf(db, userId) {
  return db.all('SELECT species, source, created_at FROM pet_unlocks WHERE user_id = ? ORDER BY created_at', [userId]);
}

export async function grantUnlock(db, { userId, species, source, ref = null, by = null }) {
  if (!KNOWN_SPECIES.has(species)) throw badRequest('Unbekannte Art', 'VALIDATION_ERROR');
  const row = await db.get(
    `INSERT INTO pet_unlocks (user_id, species, source, ref, created_by, created_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT (user_id, species) DO NOTHING RETURNING species`,
    [userId, species, source, ref, by, nowIso()]
  );
  return Boolean(row);
}

export async function revokeUnlock(db, userId, species) {
  const res = await db.run('DELETE FROM pet_unlocks WHERE user_id = ? AND species = ?', [userId, species]);
  if (res.changes > 0) {
    await db.run("UPDATE pet_purchases SET status = 'revoked', updated_at = ? WHERE user_id = ? AND species = ? AND status = 'paid'", [nowIso(), userId, species]);
  }
  return res.changes > 0;
}

/**
 * Arten, die ein Konto neu ausbrüten darf: gratis freigegebene und eigene
 * Freischaltungen. Developer dürfen zum Testen alle Arten mit Bild.
 */
export async function allowedSpecies(db, user) {
  const { settings } = await cached(db);
  const arts = await artSpecies(db);
  const allowed = freeKeys(settings.roster, arts);
  for (const u of await unlocksOf(db, user.id)) allowed.add(u.species);
  if (user.roles?.includes('developer')) for (const k of arts) allowed.add(k);
  return allowed;
}

export class SpeciesLockedError extends ApiError {
  constructor(species) {
    super(403, 'SPECIES_LOCKED', 'Diese Art ist für dein Konto nicht freigeschaltet.');
    this.species = species;
  }
}

/**
 * Prüfung für PUT /api/pet: Neue Arten im Spielstand müssen freigeschaltet
 * sein. Was schon gespeichert war, bleibt erlaubt (liefert eine Prüffunktion
 * für den gespeicherten Stand – oder null, wenn nichts zu prüfen ist).
 */
export async function speciesCheck(db, user, doc) {
  const allowed = await allowedSpecies(db, user);
  const extra = [...speciesInDoc(doc)].filter((k) => !allowed.has(k));
  if (!extra.length) return null;
  return (before) => {
    const known = speciesInDoc(before);
    const bad = extra.filter((k) => !known.has(k));
    if (bad.length) throw new SpeciesLockedError(bad);
  };
}

/* -------------------------------------------------------------------------- */
/* Geschenke                                                                     */
/* -------------------------------------------------------------------------- */

function parseItems(json) {
  try {
    const v = JSON.parse(json || '{}');
    return Object.fromEntries(Object.entries(v).filter(([k, n]) => ITEMS[k] && Number.isInteger(n) && n > 0));
  } catch {
    return {};
  }
}

export function cleanGift(input) {
  if (!input || typeof input !== 'object') throw invalid('gift');
  const shards = input.shards ?? 0;
  if (!intIn(shards, 0, 100_000)) throw invalid('shards');
  const items = {};
  if (input.items !== undefined) {
    if (!input.items || typeof input.items !== 'object' || Array.isArray(input.items)) throw invalid('items');
    for (const [k, n] of Object.entries(input.items)) {
      if (!ITEMS[k] || !intIn(n, 0, 999)) throw invalid('items');
      if (n > 0) items[k] = n;
    }
  }
  if (!shards && !Object.keys(items).length) throw badRequest('Das Geschenk ist leer', 'VALIDATION_ERROR');
  const message = input.message ? cleanText(input.message, 200, 'message') : null;
  let expiresAt = null;
  if (input.expiresAt) {
    if (!validDay(input.expiresAt)) throw invalid('expiresAt');
    expiresAt = new Date(input.expiresAt + 'T23:59:59Z').toISOString();
  }
  return { shards, items, message, expiresAt };
}

export async function createGift(db, { userId = null, gift, by }) {
  const row = await db.get(
    'INSERT INTO pet_gifts (user_id, shards, items, message, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?) RETURNING id',
    [userId, gift.shards, JSON.stringify(gift.items), gift.message, by, nowIso(), gift.expiresAt]
  );
  return row.id;
}

export async function pendingGifts(db, userId) {
  const rows = await db.all(
    `SELECT g.id, g.shards, g.items, g.message, g.created_at, g.expires_at FROM pet_gifts g
      WHERE (g.user_id = ? OR g.user_id IS NULL)
        AND (g.expires_at IS NULL OR g.expires_at > ?)
        AND NOT EXISTS (SELECT 1 FROM pet_gift_claims c WHERE c.gift_id = g.id AND c.user_id = ?)
      ORDER BY g.id LIMIT 20`,
    [userId, nowIso(), userId]
  );
  return rows.map((g) => ({ id: g.id, shards: g.shards, items: parseItems(g.items), message: g.message, at: g.created_at, until: g.expires_at }));
}

/**
 * Nimmt ein Geschenk an: Der Server schreibt Splitter und Gegenstände direkt in
 * den gespeicherten Spielstand (neue Revision). Passt die Revision nicht, kommt
 * wie beim Speichern der aktuelle Stand zurück.
 */
export async function claimGift(db, userId, giftId, baseRevision) {
  return db.transaction(async (tx) => {
    const gift = await tx.get('SELECT * FROM pet_gifts WHERE id = ? AND (user_id = ? OR user_id IS NULL)', [giftId, userId]);
    if (!gift || (gift.expires_at && gift.expires_at <= nowIso())) throw notFound('Geschenk nicht gefunden');
    if (await tx.get('SELECT gift_id FROM pet_gift_claims WHERE gift_id = ? AND user_id = ?', [giftId, userId])) throw conflict('Geschenk wurde schon angenommen');
    const row = await tx.get('SELECT state, revision FROM pets WHERE user_id = ?', [userId]);
    const doc = row ? JSON.parse(row.state) : null;
    if (!row || Number(row.revision) !== baseRevision || !doc?.player) {
      return { ok: false, doc, revision: row ? Number(row.revision) : 0 };
    }
    const pl = doc.player;
    const items = parseItems(gift.items);
    pl.shards = Math.min(1e9, (pl.shards || 0) + gift.shards);
    pl.inv ||= {};
    for (const [k, n] of Object.entries(items)) pl.inv[k] = Math.min(9999, (pl.inv[k] || 0) + n);
    const state = validatePetDoc(doc);
    const saved = await tx.get('UPDATE pets SET state = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision', [state, nowIso(), userId, baseRevision]);
    // Gleichzeitig geändert (z. B. zweites Gerät): wie beim Speichern den neueren Stand melden
    if (!saved) {
      const current = await tx.get('SELECT state, revision FROM pets WHERE user_id = ?', [userId]);
      return { ok: false, doc: current ? JSON.parse(current.state) : null, revision: current ? Number(current.revision) : 0 };
    }
    await tx.run('INSERT INTO pet_gift_claims (gift_id, user_id, claimed_at) VALUES (?,?,?)', [giftId, userId, nowIso()]);
    return { ok: true, doc, revision: Number(saved.revision), given: { shards: gift.shards, items: Object.entries(items) } };
  });
}

/* -------------------------------------------------------------------------- */
/* Was der Browser zum Spielen braucht                                           */
/* -------------------------------------------------------------------------- */

export async function playerConfig(db, user) {
  const { settings, art } = await cached(db);
  const arts = artKeys(Object.keys(art).filter((k) => art[k].img));
  const unlocks = await unlocksOf(db, user.id);
  const open = saleOpen(settings.sale);
  return {
    art: Object.fromEntries(Object.entries(art).map(([k, a]) => [k, { meta: a.meta, img: a.img, v: a.v, at: a.at }])),
    free: [...freeKeys(settings.roster, arts)],
    off: settings.roster.off,
    owned: unlocks.map((u) => ({ species: u.species, source: u.source, at: u.created_at })),
    prices: settings.roster.prices,
    price: settings.sale.price,
    currency: 'eur',
    sale: open,
    legal: open ? { terms: settings.sale.terms, withdrawal: settings.sale.withdrawal } : null,
    dev: Boolean(user.roles?.includes('developer')),
    events: settings.game.events,
    custom: settings.game.custom,
    startShards: settings.game.startShards,
    news: settings.game.news,
    gifts: await pendingGifts(db, user.id),
  };
}

/** Preis einer Art in Cent (eigener Preis oder Standardpreis). */
export function priceFor(settings, species) {
  return settings.roster.prices?.[species] ?? settings.sale.price;
}
