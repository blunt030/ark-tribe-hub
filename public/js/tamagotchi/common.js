/**
 * Gemeinsame Helfer der Tamagotchi-Oberfläche: Zeitangaben, Vorschaubilder,
 * Herzen, Belohnungs-Chips und die Texte zu Aufgaben, Rängen und Erfolgen.
 */
import { el } from '../ui.js';
import { t } from '../i18n.js';
import { SPECIES } from './species.js';
import { creatureArt } from './art.js';
import { icon, DIET_FOOD } from './scene.js';
import { itemArt, eggArt } from './props.js';
import { QUESTS } from './catalog.js';
import { toDom, toSvgString, fitViewBox } from './vdom.js';
import { realThumb } from './real.js';
import { hasArt } from './roster.js';

export const BY_KEY = new Map(SPECIES.map((s) => [s.key, s]));
export const svg = (node) => toDom(node);

export function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${t('tama.time.d', { n: d })} ${t('tama.time.h', { n: hr })}`;
  if (hr) return `${t('tama.time.h', { n: hr })} ${t('tama.time.m', { n: m })}`;
  if (m) return t('tama.time.m', { n: m });
  return t('tama.time.s', { n: s });
}

export function clock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Uhrzeit aus Minuten nach Mitternacht (z. B. Schlafenszeit). */
export function hhmm(minutes) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

export function faceFor(mood) {
  return { happy: 'happy', sleep: 'sleep', sad: 'sad', sick: 'sick', dazed: 'sick', cheeky: 'cheeky', tired: 'tired', gone: 'dead' }[mood] || 'open';
}

export function requestText(req, sp) {
  if (!req) return '';
  if (req.type === 'meal') return t('tama.request.meal', { food: t('tama.food.' + (DIET_FOOD[sp?.diet] || 'meat')) });
  return t('tama.request.' + req.type);
}

/**
 * Kreatur für Karten (Dossier, Gehege …) als leichtgewichtiges Bild: das
 * gemalte Motiv, wo es eines gibt, sonst die gezeichnete Grafik.
 */
const thumbCache = new Map();
export function creatureThumb(sp, o = {}, cls = '') {
  if (!o.drawn) {
    const real = realThumb(sp, o, cls);
    if (real) return real;
  }
  const key = [sp.key, o.stage || 'adult', o.variant || '', JSON.stringify(o.colors || null)].join('|');
  let src = thumbCache.get(key);
  if (!src) {
    const node = fitViewBox(creatureArt(sp, o));
    src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvgString(node));
    thumbCache.set(key, src);
  }
  return el('img.tama-thumb' + (cls ? '.' + cls : ''), { src, alt: o.alt || '', loading: 'lazy', decoding: 'async' });
}

/** Ei bzw. Brutkapsel als kleines Bild: das gemalte Motiv, sonst die gezeichnete Grafik. */
const eggCache = new Map();
export function eggThumb(sp, cls = '') {
  if (hasArt(sp.key)) {
    const src = sp.birth === 'embryo' ? '/assets/items/cut/embryo.webp' : '/assets/items/cut/egg.webp';
    return el('img.tama-thumb.is-real.is-egg-art' + (cls ? '.' + cls : ''), { src, alt: '', loading: 'lazy', decoding: 'async' });
  }
  if (!eggCache.has(sp.key)) eggCache.set(sp.key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvgString(eggArt(sp))));
  return el('img.tama-thumb' + (cls ? '.' + cls : ''), { src: eggCache.get(sp.key), alt: '', decoding: 'async' });
}

/** Kleines Bild eines Gegenstands (als <img>, damit viele davon billig bleiben). */
const artCache = new Map();
export function artImg(key, factory, cls = '') {
  let src = artCache.get(key);
  if (!src) {
    src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvgString(factory()));
    artCache.set(key, src);
  }
  return el('img.tama-art' + (cls ? '.' + cls : ''), { src, alt: '', decoding: 'async' });
}
export const itemImg = (id, cls = '') => artImg('item:' + id, () => itemArt(id), cls);

export function hearts(value) {
  const full = Math.round(value / 25);
  return el('span.tama-hearts', { 'aria-label': `${Math.round(value)} %` },
    [0, 1, 2, 3].map((i) => el('span.tama-heart' + (i < full ? '.is-full' : ''), {}, svg(icon('heart')))));
}

/** Splitter-Betrag mit Kristall. */
export function shards(n, cls = '') {
  return el('span.tama-shards' + (cls ? '.' + cls : ''), { title: t('tama.shards') }, itemImg('shard'), el('b', { text: String(n) }));
}

/** Chips für das, was eine Aktion gebracht hat: Erfahrung, Bindung, Splitter, Gegenstände. */
export function rewardChips(given = {}) {
  const out = [];
  if (given.xp) out.push(el('span.tama-gain.is-xp', { text: `+${given.xp} ${t('tama.xp')}` }));
  if (given.bond) out.push(el('span.tama-gain.is-bond', {}, svg(icon('heart')), el('b', { text: '+' + given.bond })));
  if (given.shards) out.push(el('span.tama-gain.is-shards', {}, itemImg('shard'), el('b', { text: '+' + given.shards })));
  for (const [id, n] of given.items || []) out.push(el('span.tama-gain.is-item', { title: t('tama.item.' + id) }, itemImg(id), el('b', { text: '×' + n })));
  return out;
}

/** Name eines Events: eigene Aktionen des Betreibers tragen ihren Namen selbst. */
export const eventName = (e) => (e?.custom ? e.name : t('tama.event.' + e.id));
export const eventShort = (e) => (e?.custom ? e.name : t('tama.event.' + e.id + '_short'));

/** Text einer Aufgabe mit Zielwert. */
export const questText = (q) => t('tama.quest.' + q.id, { n: q.goal });

/** Meldungen aus dem Fortschritt (Aufgabe erledigt, Rang, Bindung, Erfolg) als Text – oder null. */
export function noteText(n) {
  if (n.type === 'quest') return t('tama.note.quest', { quest: t('tama.quest.' + n.id, { n: QUESTS[n.id]?.goal ?? 1 }), shards: n.shards || 0 });
  if (n.type === 'bonus') return t('tama.note.bonus', { shards: n.shards || 0 });
  if (n.type === 'rank') return t('tama.note.rank', { level: n.level, name: rankName(n.level), shards: n.shards });
  if (n.type === 'bond') return t('tama.note.bond', { level: n.level });
  if (n.type === 'ach') return t('tama.note.ach', { name: t('tama.ach.' + n.id), shards: n.shards || 0 });
  if (n.type === 'day') return t('tama.note.day');
  return null;
}

export function rankName(level) {
  const names = ['fresh', 'gatherer', 'tamer', 'breeder', 'survivor', 'alpha', 'tek', 'keeper', 'ascended', 'legend'];
  return t('tama.rank.' + names[Math.min(level, names.length) - 1]);
}

/** Dauerwirkung eines Einrichtungsstücks in Worten (für Gehege und Händler). */
export function decorEffects(def) {
  if (!def) return [];
  const out = [];
  if (def.sleep) out.push(t('tama.fx.sleep', { n: Math.round(def.sleep * 100) }));
  if (def.happy) out.push(t('tama.fx.happy', { n: Math.round((1 - def.happy) * 100) }));
  if (def.hunger) out.push(t('tama.fx.hunger', { n: Math.round((1 - def.hunger) * 100) }));
  if (def.energy) out.push(t('tama.fx.energy', { n: Math.round((1 - def.energy) * 100) }));
  if (def.sick) out.push(t('tama.fx.sick', { n: Math.round((1 - def.sick) * 100) }));
  if (def.night) out.push(t('tama.fx.night'));
  if (!out.length) out.push(t('tama.fx.deco'));
  return out;
}
