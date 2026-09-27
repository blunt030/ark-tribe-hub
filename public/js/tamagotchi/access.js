/**
 * Wer welche Art ausbrüten darf – dieselbe Regel im Browser und auf dem Server.
 *
 * Neu ausbrüten lassen sich nur Arten mit echtem Bild, die der Betreiber nicht
 * abgeschaltet hat: gratis freigegebene, gekaufte oder geschenkte. Was schon im
 * Spielstand steht (aktuelles Tier, Dossier, Ahnengalerie), bleibt erlaubt –
 * niemand verliert ein Tier, und Zucht geht weiter.
 */
import { BUNDLED } from './artwork.js';

/** Arten, die im Spielstand vorkommen. */
export function speciesInDoc(doc) {
  const out = new Set();
  if (!doc || typeof doc !== 'object') return out;
  if (doc.pet?.species) out.add(doc.pet.species);
  if (doc.dex && typeof doc.dex === 'object') for (const k of Object.keys(doc.dex)) out.add(k);
  if (Array.isArray(doc.hall)) for (const a of doc.hall) if (a?.species) out.add(a.species);
  return out;
}

/** Arten mit Bild: mitgelieferte und hochgeladene (Schlüssel von customArt). */
export function artKeys(customArt = []) {
  return new Set([...Object.keys(BUNDLED), ...customArt]);
}

/**
 * Gratis-Arten, die tatsächlich spielbar sind (mit Bild, nicht abgeschaltet).
 * @param {{ free: string[], off: string[] }} roster
 */
export function freeKeys(roster, arts) {
  const off = new Set(roster?.off || []);
  return new Set((roster?.free || []).filter((k) => arts.has(k) && !off.has(k)));
}

/**
 * Zugang zu einer Art für ein Konto.
 * free   – gratis freigegeben
 * owned  – gekauft oder geschenkt
 * kept   – steht schon im Spielstand
 * buy    – kaufbar
 * locked – hat ein Bild, ist aber gerade weder gratis noch kaufbar
 * off    – ohne Bild oder abgeschaltet (erscheint nicht in der Brutstation)
 */
export function accessOf(key, { arts, off, free, owned, kept, sale }) {
  if (owned?.has(key)) return 'owned';
  if (kept?.has(key)) return 'kept';
  if (!arts.has(key) || off?.has(key)) return 'off';
  if (free?.has(key)) return 'free';
  return sale ? 'buy' : 'locked';
}

/** Neue Arten im Spielstand, die ein Konto nicht ausbrüten darf (leer = alles in Ordnung). */
export function forbiddenSpecies(before, after, allowed) {
  const known = speciesInDoc(before);
  return [...speciesInDoc(after)].filter((k) => !known.has(k) && !allowed.has(k));
}
