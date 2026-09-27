/**
 * Was der Betreiber eingestellt hat – kommt mit dem Spielstand vom Server
 * (GET /api/pet → config): Tierbilder, Gratis-Arten, Preise, Verkauf, Events,
 * Ankündigung sowie die Freischaltungen und Geschenke des Kontos.
 */
import { BUNDLED, ART_DIR } from './artwork.js';
import { artKeys, accessOf, speciesInDoc } from './access.js';
import { SPECIES } from './species.js';
import * as P from './progress.js';

const EMPTY = Object.freeze({
  art: {}, free: [], off: [], owned: [], prices: {}, price: 199, currency: 'eur', sale: false, legal: null, dev: false,
  events: { off: [], weekend: true }, custom: [], startShards: 30, news: null, gifts: [],
});

let cfg = { ...EMPTY };
let arts = artKeys([]);
let loaded = false;
const listeners = new Set();

export function onRosterChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setRoster(next) {
  cfg = { ...EMPTY, ...(next || {}) };
  arts = artKeys(Object.keys(cfg.art || {}).filter((k) => cfg.art[k]?.img));
  loaded = Boolean(next);
  P.setLive({ events: cfg.events, custom: cfg.custom, startShards: cfg.startShards });
  for (const fn of [...listeners]) {
    try { fn(cfg); } catch (err) { console.error(err); }
  }
}

/** Nur die Bildliste setzen (Verwaltung), ohne die übrigen Einstellungen des Kontos anzutasten. */
export function setArtOverrides(art) {
  cfg = { ...cfg, art: art || {} };
  arts = artKeys(Object.keys(cfg.art).filter((k) => cfg.art[k]?.img));
}

export const roster = () => cfg;
export const rosterLoaded = () => loaded;

/** Echtes Bild einer Art (mitgeliefert oder hochgeladen) mit Maßen, Blickrichtung, Kopf, Maul und Größe. */
export function artFor(key) {
  const custom = cfg.art?.[key];
  if (custom?.img) return { ...custom.meta, src: `/api/pet/art/${encodeURIComponent(key)}?v=${custom.v}`, custom: true };
  const bundled = BUNDLED[key];
  if (bundled) return { ...bundled, ...(custom?.meta || {}), src: ART_DIR + key + '.webp', custom: false };
  return null;
}

export const hasArt = (key) => arts.has(key);

function context(doc) {
  return {
    arts,
    off: new Set(cfg.off),
    free: new Set(cfg.free),
    owned: new Set(cfg.owned.map((o) => o.species)),
    kept: speciesInDoc(doc),
    sale: cfg.sale,
  };
}

/** Zugang zu einer Art: free | owned | kept | buy | locked | off. */
export function speciesAccess(key, doc) {
  return accessOf(key, context(doc));
}

/** Darf ein neues Ei dieser Art gelegt werden? (Developer: alle Arten mit Bild) */
export function canHatch(key, doc) {
  const a = speciesAccess(key, doc);
  if (['free', 'owned', 'kept'].includes(a)) return true;
  return cfg.dev && arts.has(key) && !cfg.off.includes(key);
}

/** Arten für die Brutstation: mit Bild (nicht abgeschaltet) und alles aus dem eigenen Spielstand. */
export function nestSpecies(doc) {
  const ctx = context(doc);
  return SPECIES.filter((s) => ctx.kept.has(s.key) || ctx.owned.has(s.key) || (arts.has(s.key) && !ctx.off.has(s.key)));
}

export const priceOf = (key) => cfg.prices?.[key] ?? cfg.price;

export function formatPrice(cents, lang) {
  try {
    return new Intl.NumberFormat(lang || undefined, { style: 'currency', currency: (cfg.currency || 'eur').toUpperCase() }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2) + ' €';
  }
}

/** Neu: Bild in den letzten 14 Tagen hochgeladen oder Art kürzlich freigeschaltet. */
export function isNew(key) {
  const at = cfg.art?.[key]?.img ? Date.parse(cfg.art[key].at || '') : NaN;
  const own = cfg.owned.find((o) => o.species === key);
  const t = Math.max(Number.isFinite(at) ? at : 0, own ? Date.parse(own.at) || 0 : 0);
  return t > 0 && Date.now() - t < 14 * 86_400_000;
}

export const ownedSource = (key) => cfg.owned.find((o) => o.species === key)?.source || null;
