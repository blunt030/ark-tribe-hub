/**
 * Requisiten im 3D-Look: Eier mit Nest bzw. Brutkapsel, Tek-Sockel und Altar,
 * Versorgungskisten in den ARK-Farben, Futter und Gegenstände, Einrichtung fürs
 * Gehege und die Event-Dekoration über der Kulisse.
 *
 * Plastizität entsteht ohne teure Filter: Radialverläufe mit Licht von links
 * oben, ein kühles Randlicht rechts unten, warmes Streulicht vom Boden und
 * zwei Glanzpunkte. Nur Kontaktschatten und Randlicht werden weichgezeichnet.
 */
import { h } from './vdom.js';
import { light, dark, mix, r1 } from './art-kit.js';

let uid = 0;
const nid = (p) => `pr${p}${(uid++).toString(36)}`;
const url = (id) => `url(#${id})`;

function stops(list) {
  return list.map(([offset, color, opacity = 1]) => h('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }));
}
const radial = (id, list, a = {}) => h('radialGradient', { id, cx: 0.38, cy: 0.3, r: 0.78, ...a }, stops(list));
const linear = (id, list, a = {}) => h('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1, ...a }, stops(list));
const blur = (id, sd, box = {}) => h('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%', ...box }, h('feGaussianBlur', { stdDeviation: sd }));

/** Weicher Schatten am Boden. */
function contact(defs, cx, cy, rx, ry, opacity = 0.3) {
  const f = nid('cs');
  defs.push(blur(f, 2.4));
  return h('ellipse', { cx, cy, rx, ry, fill: '#000', opacity, filter: url(f) });
}

/** Vierzackiger Funkel-Stern. */
function spark(x, y, s, fill = '#ffffff', cls = 'egg-spark', delay = 0) {
  const d = `M ${r1(x)} ${r1(y - s)} Q ${r1(x + s * 0.18)} ${r1(y - s * 0.18)} ${r1(x + s)} ${r1(y)} Q ${r1(x + s * 0.18)} ${r1(y + s * 0.18)} ${r1(x)} ${r1(y + s)} Q ${r1(x - s * 0.18)} ${r1(y + s * 0.18)} ${r1(x - s)} ${r1(y)} Q ${r1(x - s * 0.18)} ${r1(y - s * 0.18)} ${r1(x)} ${r1(y - s)} Z`;
  return h('path', { class: cls, d, fill, style: delay ? `animation-delay:${delay}s` : null });
}

/** Rundum-Glanz auf einer glatten Form: weicher Lichtfleck, scharfer Reflex, kleiner Punkt. */
function gloss(defs, x, y, rx, ry, rot = -24, strength = 1) {
  const g = nid('gl');
  defs.push(h('radialGradient', { id: g }, stops([[0, '#ffffff', 0.7 * strength], [0.6, '#ffffff', 0.18 * strength], [1, '#ffffff', 0]])));
  return [
    h('ellipse', { cx: r1(x), cy: r1(y), rx: r1(rx), ry: r1(ry), fill: url(g), transform: `rotate(${rot} ${r1(x)} ${r1(y)})` }),
    h('ellipse', { cx: r1(x - rx * 0.22), cy: r1(y - ry * 0.18), rx: r1(rx * 0.3), ry: r1(ry * 0.36), fill: '#ffffff', opacity: 0.85 * strength, transform: `rotate(${rot} ${r1(x)} ${r1(y)})` }),
  ];
}

const RARITY_GLOW = { legendary: '#ffcf5a', epic: '#c77dff', rare: '#5ad1ff' };

/* -------------------------------------------------------------------------- */
/* Eier & Geburtsarten                                                          */
/* -------------------------------------------------------------------------- */

const EGG = 'M 50 8 C 73 8 84 42 84 61 C 84 82 69 94 50 94 C 31 94 16 82 16 61 C 16 42 27 8 50 8 Z';

/** Risse mit Tiefe: dunkle Kante, darunter ein heller Grat. */
function cracks(n, line, paths, width = 1.9) {
  return paths.slice(0, n).map((d) => h('g', { class: 'egg-crack' },
    h('path', { d, stroke: '#ffffff', 'stroke-width': r1(width * 0.65), fill: 'none', opacity: 0.55, transform: 'translate(0.8 0.8)', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    h('path', { d, stroke: line, 'stroke-width': width, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
}

/** Ein Riss, der mit jeder Stufe weiterwächst – zuletzt fehlt ein Stück Schale. */
const SHELL_CRACKS = [
  'M 52 20 L 48 28 L 54 33 L 49 41',
  'M 49 41 L 57 46 L 52 53 M 54 33 L 61 32 L 64 37',
  'M 52 53 L 45 58 L 50 64 L 46 70 M 48 28 L 41 26 L 38 31',
];

/** Schimmer, der bei seltenen Eiern über die Schale wandert (Animation per CSS). */
function shimmer(defs, clip) {
  const g = nid('sh');
  defs.push(h('linearGradient', { id: g, x1: 0, y1: 0, x2: 1, y2: 0 }, stops([[0, '#ffffff', 0], [0.5, '#ffffff', 0.55], [1, '#ffffff', 0]])));
  return h('g', { 'clip-path': url(clip) }, h('rect', { class: 'egg-shimmer', x: -40, y: -10, width: 22, height: 130, fill: url(g), transform: 'skewX(-18)' }));
}

function halo(defs, color, cx, cy, r) {
  const g = nid('ha');
  defs.push(h('radialGradient', { id: g }, stops([[0, color, 0.5], [0.45, color, 0.2], [1, color, 0]])));
  return h('circle', { class: 'egg-halo', cx, cy, r, fill: url(g) });
}

function sparkles(color, pts) {
  return h('g', { class: 'egg-sparks' }, pts.map(([x, y, s], i) => spark(x, y, s, i % 2 ? '#ffffff' : light(color, 0.4), 'egg-spark', i * 0.45)));
}

function shellEgg(sp, defs, cracksN, glow) {
  const [, belly, accent] = sp.colors;
  const line = dark(mix(belly, '#24123a', 0.35), 0.58);
  const base = nid('eb'), shade = nid('es'), clip = nid('ec'), rim = nid('er'), spot = nid('ep');
  defs.push(
    radial(base, [[0, light(belly, 0.6)], [0.42, belly], [0.8, dark(belly, 0.16)], [1, dark(belly, 0.4)]]),
    radial(shade, [[0, '#ffffff', 0.16], [0.46, '#ffffff', 0], [0.82, '#000000', 0.12], [1, '#000000', 0.34]]),
    radial(spot, [[0, light(accent, 0.3)], [0.55, accent], [1, dark(accent, 0.28)]], { cx: 0.35, cy: 0.3, r: 0.8 }),
    h('clipPath', { id: clip }, h('path', { d: EGG })),
    blur(rim, 1.3));
  const spots = [[36, 38, 6.5], [60, 30, 4.4], [64, 60, 7.6], [37, 74, 5.6], [52, 51, 3.8], [72, 44, 3.2], [27, 56, 3.5], [55, 84, 4.2]];
  return h('g', { class: 'egg-body' },
    h('path', { d: EGG, fill: url(base) }),
    h('g', { 'clip-path': url(clip) },
      spots.map(([x, y, r]) => h('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.82, fill: url(spot) })),
      h('path', { d: EGG, fill: url(shade) }),
      h('ellipse', { cx: 50, cy: 96, rx: 30, ry: 12, fill: '#ffcf8a', opacity: 0.3 }),
      h('path', { d: EGG, fill: 'none', stroke: '#d8f1ff', 'stroke-width': 4, opacity: 0.6, transform: 'translate(-3.5 -2.5)', filter: url(rim) })),
    glow ? shimmer(defs, clip) : null,
    cracks(cracksN, line, SHELL_CRACKS),
    cracksN >= 3 ? h('path', { d: 'M 54 44 L 58 41 L 61 45 L 57 49 Z', fill: '#2a1a0a', stroke: line, 'stroke-width': 1 }) : null,
    h('path', { d: EGG, fill: 'none', stroke: line, 'stroke-width': 2.4 }),
    gloss(defs, 36, 29, 9, 16, -24),
    h('circle', { cx: 42, cy: 17, r: 1.4, fill: '#ffffff', opacity: 0.8 }));
}

function nest(defs) {
  const back = nid('nb'), front = nid('nf');
  defs.push(
    radial(back, [[0, '#3d2410'], [0.7, '#5a3616'], [1, '#7a4c1e']], { cx: 0.5, cy: 0.35, r: 0.65 }),
    linear(front, [[0, '#f0c877'], [0.45, '#c98f45'], [1, '#6e4417']]));
  const strands = [];
  for (let i = 0; i < 17; i++) {
    const x = 10 + i * 5;
    const y = 91 + Math.sin(i * 1.7) * 2 + (Math.abs(x - 50) < 30 ? 5 : 1);
    strands.push(h('path', { d: `M ${x - 5} ${r1(y + 5)} Q ${x} ${r1(y - 4)} ${x + 7} ${r1(y + 3)}`, stroke: i % 3 ? '#f6d98a' : '#6e4417', 'stroke-width': i % 3 ? 1.3 : 1, fill: 'none', opacity: 0.9, 'stroke-linecap': 'round' }));
  }
  return {
    back: h('ellipse', { cx: 50, cy: 88, rx: 43, ry: 11, fill: url(back), stroke: '#3a220c', 'stroke-width': 1.6 }),
    front: h('g', { class: 'egg-nest' },
      h('path', { d: 'M 6 87 C 18 100 82 100 94 87 C 97 97 85 107 50 107 C 15 107 3 97 6 87 Z', fill: url(front), stroke: '#4a2c10', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
      strands,
      h('path', { d: 'M 14 93 C 30 101 70 101 86 93', stroke: '#ffe7a8', 'stroke-width': 1.2, fill: 'none', opacity: 0.6 })),
  };
}

function incubator(sp, defs, cracksN) {
  const [body, , accent] = sp.colors;
  const glass = nid('ig'), liquid = nid('il'), clip = nid('ic'), metal = nid('im'), cap = nid('ia'), shine = nid('is');
  defs.push(
    linear(glass, [[0, '#0d2a36', 0.6], [0.5, '#1a4a5c', 0.35], [1, '#0d2a36', 0.6]], { x2: 1, y2: 0 }),
    linear(liquid, [[0, light(accent, 0.55), 0.85], [1, dark(accent, 0.1), 0.95]]),
    h('clipPath', { id: clip }, h('rect', { x: 27, y: 14, width: 46, height: 78, rx: 23 })),
    linear(metal, [[0, '#26313d'], [0.35, '#8a9aac'], [0.55, '#dfe8f1'], [0.75, '#6c7c8e'], [1, '#1c2530']], { x2: 1, y2: 0 }),
    linear(cap, [[0, '#9aa9b9'], [1, '#3a4654']]),
    linear(shine, [[0, '#ffffff', 0.7], [1, '#ffffff', 0]]));
  const line = dark(mix(body, '#24123a', 0.3), 0.55);
  return h('g', { class: 'egg-body' },
    h('rect', { x: 27, y: 14, width: 46, height: 78, rx: 23, fill: url(glass) }),
    h('g', { 'clip-path': url(clip) },
      h('path', { d: 'M 20 34 Q 35 28 50 34 T 80 34 L 80 100 L 20 100 Z', fill: url(liquid) }),
      h('path', { d: 'M 22 48 Q 36 44 50 50 T 78 48', stroke: '#ffffff', 'stroke-width': 1, fill: 'none', opacity: 0.25 }),
      h('path', { class: 'egg-embryo', d: 'M 51 44 C 38 46 37 62 44 68 C 51 74 62 70 61 60 C 60 52 52 50 49 55 C 47 59 51 62 54 60', fill: light(body, 0.18), stroke: line, 'stroke-width': 2, 'stroke-linecap': 'round' }),
      h('circle', { cx: 52, cy: 57, r: 1.6, fill: line }),
      [[36, 80, 2.4, 0], [60, 70, 1.8, 0.8], [44, 60, 1.4, 1.6], [64, 86, 2, 2.2]].map(([x, y, r, d]) => h('circle', { class: 'egg-bubble', cx: x, cy: y, r, fill: 'none', stroke: '#ffffff', 'stroke-width': 0.9, opacity: 0.75, style: `animation-delay:${d}s` })),
      h('ellipse', { cx: 50, cy: 96, rx: 26, ry: 10, fill: '#5ff2ff', opacity: 0.35 })),
    cracks(cracksN, '#1e2a36', ['M 36 40 l 6 6 l -3 7 l 6 5', 'M 64 30 l -5 7 l 6 5', 'M 40 76 l 7 -3 l 3 7 l 7 -5']),
    h('rect', { x: 27, y: 14, width: 46, height: 78, rx: 23, fill: 'none', stroke: '#1e2a36', 'stroke-width': 3.4 }),
    h('rect', { x: 27, y: 14, width: 46, height: 78, rx: 23, fill: 'none', stroke: '#9fe9ff', 'stroke-width': 1.3, opacity: 0.8 }),
    h('path', { d: 'M 34 30 Q 33 22 40 18 L 40 76 Q 34 70 34 62 Z', fill: url(shine), opacity: 0.8 }),
    h('path', { d: 'M 66 26 L 67 70', stroke: '#ffffff', 'stroke-width': 1.6, opacity: 0.3, 'stroke-linecap': 'round' }),
    h('rect', { x: 32, y: 7, width: 36, height: 11, rx: 5, fill: url(cap), stroke: '#1e2a36', 'stroke-width': 2 }),
    h('circle', { class: 'egg-core', cx: 50, cy: 12.5, r: 2.2, fill: '#5ff2ff' }),
    h('path', { d: 'M 16 92 L 84 92 L 80 104 L 20 104 Z', fill: url(metal), stroke: '#1e2a36', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    h('ellipse', { cx: 50, cy: 92, rx: 34, ry: 5, fill: '#56687a', stroke: '#1e2a36', 'stroke-width': 2 }),
    h('ellipse', { class: 'egg-core', cx: 50, cy: 92, rx: 26, ry: 3.2, fill: 'none', stroke: '#5ff2ff', 'stroke-width': 1.8 }),
    [30, 40, 60, 70].map((x, i) => h('rect', { x: x - 2, y: 97, width: 4, height: 3, rx: 1, fill: i < 1 + cracksN ? '#5ff2ff' : '#2a3440' })));
}

function tekCore(sp, defs, cracksN) {
  const beam = nid('tb'), core = nid('tc'), top = nid('tt'), side = nid('ts');
  defs.push(
    h('linearGradient', { id: beam, x1: 0, y1: 0, x2: 1, y2: 0 }, stops([[0, '#35d7ff', 0], [0.5, '#35d7ff', 0.35], [1, '#35d7ff', 0]])),
    h('radialGradient', { id: core }, stops([[0, '#ffffff'], [0.35, '#9ff6ff'], [0.7, '#35d7ff', 0.8], [1, '#35d7ff', 0]])),
    linear(top, [[0, '#4a5b6c'], [1, '#26313d']]),
    linear(side, [[0, '#1c2530'], [1, '#0e141b']]));
  const facets = [
    ['M 50 16 L 50 47 L 24 31 Z', '#627c90'], ['M 50 16 L 76 31 L 50 47 Z', '#3f5566'],
    ['M 76 31 L 76 63 L 50 47 Z', '#26343f'], ['M 76 63 L 50 78 L 50 47 Z', '#1a232b'],
    ['M 50 78 L 24 63 L 50 47 Z', '#2c3e4b'], ['M 24 63 L 24 31 L 50 47 Z', '#4b6477'],
  ];
  return h('g', {},
    h('path', { d: 'M 34 96 L 44 20 L 56 20 L 66 96 Z', fill: url(beam) }),
    h('path', { d: 'M 18 92 L 34 86 L 66 86 L 82 92 L 66 98 L 34 98 Z', fill: url(top), stroke: '#0e141b', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
    h('path', { d: 'M 18 92 L 34 98 L 66 98 L 82 92 L 82 99 L 66 105 L 34 105 L 18 99 Z', fill: url(side), stroke: '#0e141b', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
    h('path', { class: 'egg-core', d: 'M 22 92 L 35 87.5 L 65 87.5 L 78 92 L 65 96.5 L 35 96.5 Z', fill: 'none', stroke: '#35d7ff', 'stroke-width': 1.4 }),
    h('g', { class: 'egg-body egg-float' },
      facets.map(([d, fill]) => h('path', { d, fill })),
      ['M 50 47 L 50 16', 'M 50 47 L 76 31', 'M 50 47 L 76 63', 'M 50 47 L 50 78', 'M 50 47 L 24 63', 'M 50 47 L 24 31'].map((d) => h('path', { d, stroke: '#7ff4ff', 'stroke-width': 0.9, opacity: 0.5 })),
      cracks(cracksN, '#e8fdff', ['M 38 28 l 5 7 l -3 6', 'M 64 54 l -6 4 l 2 7', 'M 32 56 l 7 1 l 3 6'], 1.3),
      h('path', { d: 'M 50 16 L 76 31 L 76 63 L 50 78 L 24 63 L 24 31 Z', fill: 'none', stroke: '#9fe9ff', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
      h('circle', { class: 'egg-core', cx: 50, cy: 47, r: 13, fill: url(core) }),
      h('path', { d: 'M 29 33 L 48 21', stroke: '#ffffff', 'stroke-width': 2, opacity: 0.55, 'stroke-linecap': 'round' })),
    h('ellipse', { class: 'egg-orbit', cx: 50, cy: 49, rx: 40, ry: 9, fill: 'none', stroke: '#5ff2ff', 'stroke-width': 1.2, 'stroke-dasharray': '6 5', opacity: 0.75 }));
}

function relic(sp, defs, cracksN) {
  const [body, , accent] = sp.colors;
  const top = nid('rt'), front = nid('rf'), side = nid('rs');
  defs.push(
    linear(top, [[0, '#b3b8c2'], [1, '#8a909b']]),
    linear(front, [[0, '#6b717c'], [1, '#484d56']]),
    linear(side, [[0, '#4d525b'], [1, '#33373e']]));
  const rune = light(accent, 0.2);
  return h('g', {},
    halo(defs, accent, 50, 44, 40),
    h('path', { d: 'M 16 84 L 50 76 L 84 84 L 50 92 Z', fill: url(top), stroke: '#2a2d33', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
    h('path', { d: 'M 16 84 L 50 92 L 50 106 L 16 98 Z', fill: url(front), stroke: '#2a2d33', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
    h('path', { d: 'M 50 92 L 84 84 L 84 98 L 50 106 Z', fill: url(side), stroke: '#2a2d33', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
    h('path', { class: 'egg-core', d: 'M 24 90 l 4 3 l -2 4 M 33 93 l 3 -2 l 2 5 M 42 95 l 3 3 l -3 3 M 58 96 l 4 -3 l 1 5 M 70 92 l 3 2 l -2 4', stroke: rune, 'stroke-width': 1.4, fill: 'none', 'stroke-linecap': 'round' }),
    h('g', { class: 'egg-body egg-float' },
      h('path', { d: 'M 50 10 L 36 42 L 50 50 Z', fill: light(body, 0.45) }),
      h('path', { d: 'M 50 10 L 64 42 L 50 50 Z', fill: light(body, 0.1) }),
      h('path', { d: 'M 36 42 L 50 74 L 50 50 Z', fill: dark(body, 0.12) }),
      h('path', { d: 'M 64 42 L 50 74 L 50 50 Z', fill: dark(body, 0.42) }),
      cracks(cracksN, light(accent, 0.55), ['M 45 28 l 3 6 l -2 5', 'M 56 50 l -3 5 l 2 5', 'M 45 56 l 4 3'], 1.2),
      h('path', { d: 'M 50 10 L 64 42 L 50 74 L 36 42 Z', fill: 'none', stroke: dark(mix(body, '#24123a', 0.3), 0.55), 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
      h('path', { class: 'egg-core', d: 'M 50 34 l 5 8 l -5 8 l -5 -8 z', fill: accent }),
      h('path', { d: 'M 41 36 L 49 17', stroke: '#ffffff', 'stroke-width': 1.8, opacity: 0.6, 'stroke-linecap': 'round' })),
    sparkles(accent, [[22, 30, 3.5], [80, 22, 3], [78, 58, 2.6]]));
}

/**
 * Ei, Brutkapsel, Tek-Kern oder Beschwörungsrelikt – je nach Geburtsart, im
 * passenden Nest bzw. auf Sockel oder Altar. `cracks` (0–3) zeigt, wie nah das
 * Schlüpfen ist. Seltene Arten schimmern und funkeln.
 */
export function eggArt(sp, { cracks: cracksN = 0 } = {}) {
  const defs = [];
  const glow = RARITY_GLOW[sp.rarity] || null;
  const kids = [contact(defs, 50, 104, 40, 4.5, 0.32)];
  if (sp.birth === 'embryo') kids.push(glow ? halo(defs, glow, 50, 52, 46) : null, incubator(sp, defs, cracksN));
  else if (sp.birth === 'tek') kids.push(tekCore(sp, defs, cracksN));
  else if (sp.birth === 'relic') kids.push(relic(sp, defs, cracksN));
  else {
    const n = nest(defs);
    kids.push(glow ? halo(defs, glow, 50, 54, 48) : null, n.back, shellEgg(sp, defs, cracksN, glow), n.front);
  }
  if (sp.rarity === 'legendary' && sp.birth !== 'relic') kids.push(sparkles(glow, [[16, 26, 4], [86, 18, 3.4], [88, 60, 3], [12, 64, 2.6]]));
  return h('svg', { viewBox: '0 0 100 110', class: `prop-egg birth-${sp.birth} rarity-${sp.rarity}`, 'aria-hidden': 'true' }, h('defs', {}, defs), kids);
}

/* -------------------------------------------------------------------------- */
/* Versorgungskiste                                                             */
/* -------------------------------------------------------------------------- */

export const DROP_COLORS = {
  white: '#e9eef4', green: '#4fd07a', blue: '#4a9dff', purple: '#b36bff', yellow: '#ffd23f', red: '#ff4d4d', tek: '#35d7ff',
};

/**
 * Versorgungskiste wie in ARK: Metallrahmen, leuchtendes Emblem, Lichtsäule in
 * der Farbe der Stufe. Offen hebt sich der Deckel und Licht strömt heraus.
 */
export function crateArt(color = 'white', { open = false, beam = true, size = null } = {}) {
  const c = DROP_COLORS[color] || color;
  const defs = [];
  const col = color === 'white' ? '#bfe6ff' : c;
  const bm = nid('cb'), lf = nid('cl'), rt = nid('cr'), tp = nid('ct'), glow = nid('cg'), ray = nid('cy');
  defs.push(
    h('linearGradient', { id: bm, x1: 0, y1: 0, x2: 1, y2: 0 }, stops([[0, col, 0], [0.3, col, 0.35], [0.5, '#ffffff', 0.75], [0.7, col, 0.35], [1, col, 0]])),
    linear(lf, [[0, light(c, 0.12)], [1, dark(c, 0.18)]]),
    linear(rt, [[0, dark(c, 0.22)], [1, dark(c, 0.42)]]),
    linear(tp, [[0, light(c, 0.45)], [1, light(c, 0.15)]], { x2: 1 }),
    h('radialGradient', { id: glow }, stops([[0, '#ffffff', 0.95], [0.4, col, 0.7], [1, col, 0]])),
    linear(ray, [[0, col, 0], [1, '#ffffff', 0.85]]));
  const frame = '#1f2831';
  const edge = (d) => [h('path', { d, stroke: frame, 'stroke-width': 3.6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    h('path', { d, stroke: '#9fb3c6', 'stroke-width': 0.9, fill: 'none', opacity: 0.55, transform: 'translate(-0.8 -0.8)' })];
  const lid = h('g', { class: 'crate-lid', transform: open ? 'translate(-4 -26) rotate(-14 60 86)' : null },
    h('path', { d: 'M 60 70 L 92 86 L 60 102 L 28 86 Z', fill: url(tp) }),
    edge('M 60 70 L 92 86 L 60 102 L 28 86 Z'),
    h('path', { d: 'M 44 78 L 76 94 M 76 78 L 44 94', stroke: dark(c, 0.3), 'stroke-width': 1.6, opacity: 0.5 }),
    h('circle', { cx: 60, cy: 86, r: 4.2, fill: url(glow) }));
  return h('svg', { viewBox: '0 0 120 150', class: `prop-crate crate-${color}${open ? ' is-open' : ''}`, 'aria-hidden': 'true', width: size, height: size ? size * 1.25 : null },
    h('defs', {}, defs),
    beam ? h('g', { class: 'crate-beam' },
      h('path', { d: 'M 30 -40 L 90 -40 L 88 104 L 32 104 Z', fill: url(bm), opacity: 0.55 }),
      h('path', { d: 'M 52 -40 L 68 -40 L 66 100 L 54 100 Z', fill: '#ffffff', opacity: 0.4 })) : null,
    contact(defs, 60, 140, 42, 6, 0.4),
    open ? h('g', { class: 'crate-rays' },
      h('path', { d: 'M 34 86 L 12 10 L 50 30 L 60 0 L 70 30 L 108 10 L 86 86 Z', fill: url(ray), opacity: 0.8 }),
      h('path', { d: 'M 34 86 L 60 102 L 86 86 L 60 70 Z', fill: '#fff8e0' })) : null,
    h('path', { d: 'M 28 86 L 60 102 L 60 138 L 28 122 Z', fill: url(lf) }),
    h('path', { d: 'M 60 102 L 92 86 L 92 122 L 60 138 Z', fill: url(rt) }),
    h('path', { d: 'M 36 96 L 52 104 L 52 126 L 36 118 Z', fill: dark(c, 0.3), opacity: 0.35 }),
    h('path', { class: 'crate-emblem', d: 'M 44 101 L 49 110 L 44 119 L 39 110 Z', fill: url(glow), stroke: '#ffffff', 'stroke-width': 0.8 }),
    [0, 1, 2].map((i) => h('path', { d: `M 66 ${104 + i * 7} L 86 ${94 + i * 7}`, stroke: dark(c, 0.55), 'stroke-width': 2.2, 'stroke-linecap': 'round' })),
    edge('M 28 86 L 28 122 L 60 138 L 92 122 L 92 86'),
    edge('M 60 102 L 60 138'),
    [[28, 122], [60, 138], [92, 122]].map(([x, y]) => h('circle', { cx: x, cy: y - 2, r: 2, fill: '#8a9aac', stroke: frame, 'stroke-width': 1 })),
    open ? null : edge('M 28 86 L 60 102 L 92 86'),
    lid,
    color === 'tek' || color === 'red' || color === 'yellow' ? [spark(18, 60, 4, '#ffffff', 'crate-spark'), spark(104, 48, 3.2, light(c, 0.4), 'crate-spark', 0.6), spark(100, 116, 2.6, '#ffffff', 'crate-spark', 1.2)] : null);
}

/* -------------------------------------------------------------------------- */
/* Gegenstände                                                                   */
/* -------------------------------------------------------------------------- */

export const KIBBLE_COLORS = {
  kibble_basic: '#efe6cf', kibble_simple: '#6cc46a', kibble_regular: '#4d9be6',
  kibble_superior: '#a066dd', kibble_exceptional: '#f3c33b', kibble_extraordinary: '#ea4b3f',
};

function pellet(defs, x, y, rx, ry, c) {
  const g = nid('kp');
  defs.push(radial(g, [[0, light(c, 0.55)], [0.5, c], [1, dark(c, 0.35)]], { cx: 0.35, cy: 0.3, r: 0.85 }));
  const line = dark(c, 0.62);
  return h('g', {},
    h('ellipse', { cx: x, cy: y, rx, ry, fill: url(g), stroke: line, 'stroke-width': 1.3 }),
    [[-0.35, 0.1], [0.2, -0.2], [0.3, 0.35], [-0.05, 0.45]].map(([dx, dy]) => h('circle', { cx: r1(x + dx * rx), cy: r1(y + dy * ry), r: 0.9, fill: dark(c, 0.4), opacity: 0.6 })),
    h('ellipse', { cx: r1(x - rx * 0.35), cy: r1(y - ry * 0.4), rx: r1(rx * 0.35), ry: r1(ry * 0.22), fill: '#ffffff', opacity: 0.7, transform: `rotate(-18 ${r1(x - rx * 0.35)} ${r1(y - ry * 0.4)})` }));
}

const ITEM_ART = {
  kibble(defs, id) {
    const c = KIBBLE_COLORS[id] || '#d8b070';
    return [contact(defs, 20, 35, 14, 2.4, 0.3), pellet(defs, 25, 17, 8.5, 6.8, c), pellet(defs, 13, 25, 9, 7, c), pellet(defs, 26, 27, 9.2, 7.2, c)];
  },
  treat(defs) {
    const g = nid('tr');
    defs.push(radial(g, [[0, '#ffe2a8'], [0.55, '#e0a95b'], [1, '#9a6326']]));
    const d = 'M 9 13 C 5 9 10 4 14 8 C 15 6 19 6 19 10 L 27 20 C 31 19 34 23 31 26 C 35 28 32 34 28 31 C 26 35 20 33 22 29 L 14 19 C 10 20 7 16 9 13 Z';
    return [contact(defs, 20, 35, 13, 2.2, 0.28), h('path', { d, fill: url(g), stroke: '#6a3f14', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }),
      h('path', { d: 'M 13 11 Q 17 12 17 15 M 24 23 Q 26 26 29 26', stroke: '#fff1cf', 'stroke-width': 1.4, fill: 'none', opacity: 0.8, 'stroke-linecap': 'round' })];
  },
  honey(defs) {
    const jar = nid('hj'), hon = nid('hh');
    defs.push(linear(jar, [[0, '#fff4d6', 0.6], [1, '#ffe2a0', 0.3]], { x2: 1, y2: 0 }), radial(hon, [[0, '#ffe07a'], [0.6, '#f5b52e'], [1, '#b8741a']], { cy: 0.4 }));
    return [contact(defs, 20, 36, 12, 2.2, 0.28),
      h('path', { d: 'M 10 14 Q 10 11 13 11 L 27 11 Q 30 11 30 14 L 31 30 Q 31 35 26 35 L 14 35 Q 9 35 9 30 Z', fill: url(hon), stroke: '#7a4a12', 'stroke-width': 1.5 }),
      h('path', { d: 'M 10 14 Q 10 11 13 11 L 27 11 Q 30 11 30 14 L 31 30 Q 31 35 26 35 L 14 35 Q 9 35 9 30 Z', fill: url(jar) }),
      h('rect', { x: 9, y: 6, width: 22, height: 7, rx: 2.5, fill: '#c0392b', stroke: '#6a1a12', 'stroke-width': 1.3 }),
      h('path', { d: 'M 12 13 q 1 5 3 0 q 2 6 4 0', fill: '#f5b52e', stroke: '#7a4a12', 'stroke-width': 0.8 }),
      h('path', { d: 'M 13 17 L 13 30', stroke: '#ffffff', 'stroke-width': 2, opacity: 0.55, 'stroke-linecap': 'round' }),
      h('rect', { x: 15, y: 20, width: 11, height: 8, rx: 2, fill: '#fff4d6', opacity: 0.85 }),
      h('path', { d: 'M 18 24 h 5', stroke: '#b8741a', 'stroke-width': 1.2 })];
  },
  stimberry(defs) {
    const g = nid('sb');
    defs.push(radial(g, [[0, '#ffffff'], [0.55, '#dfe4ff'], [1, '#8f9ad8']]));
    return [contact(defs, 20, 35, 12, 2.2, 0.28),
      h('path', { d: 'M 20 11 q 3 -6 10 -6', stroke: '#3a7a2a', 'stroke-width': 2, fill: 'none' }),
      h('path', { d: 'M 26 6 q 7 -3 9 3 q -6 2 -9 -3 z', fill: '#5aa03a', stroke: '#2a5a1a', 'stroke-width': 0.9 }),
      [[14, 22], [26, 22], [20, 31], [20, 15]].map(([x, y]) => [h('circle', { cx: x, cy: y, r: 6.2, fill: url(g), stroke: '#4a5496', 'stroke-width': 1.2 }), h('circle', { cx: x - 2, cy: y - 2, r: 1.6, fill: '#ffffff', opacity: 0.9 })]),
      h('path', { d: 'M 31 28 l 3 -5 l -2 0 l 2 -5', stroke: '#ffd23f', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })];
  },
  brew(defs) {
    const liq = nid('bl'), gl = nid('bg');
    defs.push(radial(liq, [[0, '#ff8a98'], [0.55, '#e0304a'], [1, '#7a0f22']], { cy: 0.35 }), radial(gl, [[0, '#ffffff', 0.35], [1, '#bfe8ff', 0.15]]));
    return [contact(defs, 20, 36, 12, 2.2, 0.28),
      h('rect', { x: 16, y: 5, width: 8, height: 7, rx: 1.5, fill: '#b07a45', stroke: '#5a3a1a', 'stroke-width': 1.2 }),
      h('path', { d: 'M 16 12 L 24 12 L 24 16 A 11 11 0 1 1 16 16 Z', fill: url(gl), stroke: '#2a4a6a', 'stroke-width': 1.5 }),
      h('path', { d: 'M 10 24 Q 20 20 30 24 A 10 10 0 0 1 10 24 Z', fill: url(liq) }),
      h('path', { d: 'M 13 21 A 9 9 0 0 0 14 31', stroke: '#ffffff', 'stroke-width': 1.8, fill: 'none', opacity: 0.7, 'stroke-linecap': 'round' }),
      h('path', { d: 'M 18 25 h 4 m -2 -2 v 4', stroke: '#ffffff', 'stroke-width': 1.6, 'stroke-linecap': 'round' })];
  },
  freeze(defs) {
    const g = nid('fz');
    defs.push(radial(g, [[0, '#f2fdff'], [0.5, '#9fe6ff'], [1, '#2f8fc2']]));
    return [contact(defs, 20, 37, 12, 2, 0.28),
      h('path', { d: 'M 20 3 L 34 11 L 34 27 L 20 35 L 6 27 L 6 11 Z', fill: url(g), stroke: '#1e5a7a', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
      h('path', { d: 'M 20 9 v 20 M 11.5 14 l 17 10 M 28.5 14 l -17 10 M 17 10.5 l 3 2.5 3 -2.5 M 17 27.5 l 3 -2.5 3 2.5', stroke: '#ffffff', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }),
      h('path', { d: 'M 9 12.5 L 19 6.5', stroke: '#ffffff', 'stroke-width': 1.6, opacity: 0.7, 'stroke-linecap': 'round' })];
  },
  shard(defs) {
    const a = nid('s1'), b = nid('s2');
    defs.push(linear(a, [[0, '#ffc2e6'], [1, '#e0288f']], { x2: 1 }), linear(b, [[0, '#ff7cc4'], [1, '#8e1a5e']], { x2: 1 }));
    const crystal = (x, y, w, hgt, rot) => h('g', { transform: `rotate(${rot} ${x} ${y})` },
      h('path', { d: `M ${x} ${y - hgt} L ${x + w} ${y - hgt * 0.7} L ${x + w} ${y} L ${x} ${y + w * 0.4} Z`, fill: url(b) }),
      h('path', { d: `M ${x} ${y - hgt} L ${x - w} ${y - hgt * 0.7} L ${x - w} ${y} L ${x} ${y + w * 0.4} Z`, fill: url(a) }),
      h('path', { d: `M ${x} ${y - hgt} L ${x + w} ${y - hgt * 0.7} L ${x + w} ${y} L ${x} ${y + w * 0.4} L ${x - w} ${y} L ${x - w} ${y - hgt * 0.7} Z`, fill: 'none', stroke: '#5a0a3a', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }),
      h('path', { d: `M ${x - w * 0.55} ${y - hgt * 0.62} L ${x - w * 0.55} ${y - hgt * 0.1}`, stroke: '#ffffff', 'stroke-width': 1.1, opacity: 0.8, 'stroke-linecap': 'round' }));
    return [contact(defs, 20, 36, 12, 2, 0.28), crystal(12, 33, 4.5, 14, -22), crystal(29, 33, 4.5, 13, 20), crystal(20, 33, 6, 24, 0)];
  },
};

/** Symbol eines Gegenstands (Kibble-Stufen, Leckerli, Honig, Stimbeere, Heiltrank, Serienschutz, Splitter). */
export function itemArt(id) {
  const defs = [];
  const draw = id.startsWith('kibble') ? ITEM_ART.kibble : ITEM_ART[id] || ITEM_ART.treat;
  const body = draw(defs, id);
  return h('svg', { viewBox: '0 0 40 40', class: `prop-item item-${id}`, 'aria-hidden': 'true' }, h('defs', {}, defs), body);
}

export const shardArt = () => itemArt('shard');

/* -------------------------------------------------------------------------- */
/* Einrichtung                                                                   */
/* -------------------------------------------------------------------------- */

function cup(defs, emblem, gem = '#e0304a') {
  const g = nid('cu');
  defs.push(linear(g, [[0, '#fff1a8'], [0.35, '#f5c542'], [0.7, '#c8901e'], [1, '#8a5a10']], { x2: 1, y2: 0 }));
  return [
    h('path', { d: 'M 20 50 L 40 50 L 38 56 L 22 56 Z', fill: '#5a3a1a', stroke: '#2e1c08', 'stroke-width': 1.3 }),
    h('path', { d: 'M 27 40 L 33 40 L 34 50 L 26 50 Z', fill: url(g), stroke: '#6a4508', 'stroke-width': 1.3 }),
    h('path', { d: 'M 17 18 Q 8 18 10 27 Q 12 33 20 32', stroke: '#c8901e', 'stroke-width': 3, fill: 'none' }),
    h('path', { d: 'M 43 18 Q 52 18 50 27 Q 48 33 40 32', stroke: '#c8901e', 'stroke-width': 3, fill: 'none' }),
    h('path', { d: 'M 16 14 L 44 14 Q 44 36 30 40 Q 16 36 16 14 Z', fill: url(g), stroke: '#6a4508', 'stroke-width': 1.5 }),
    h('ellipse', { cx: 30, cy: 14, rx: 14, ry: 3, fill: '#fff4c2', stroke: '#6a4508', 'stroke-width': 1.2 }),
    emblem || h('circle', { cx: 30, cy: 25, r: 4.5, fill: gem, stroke: dark(gem, 0.5), 'stroke-width': 1 }),
    h('path', { d: 'M 20 18 Q 20 30 26 35', stroke: '#ffffff', 'stroke-width': 1.8, fill: 'none', opacity: 0.6, 'stroke-linecap': 'round' }),
  ];
}

const DECOR_ART = {
  bed_straw(defs) {
    const g = nid('bs');
    defs.push(linear(g, [[0, '#f0c877'], [1, '#8a5a24']]));
    return [h('ellipse', { cx: 30, cy: 48, rx: 26, ry: 7, fill: '#4a2c10' }),
      h('path', { d: 'M 3 46 C 10 58 50 58 57 46 C 59 53 50 58 30 58 C 10 58 1 53 3 46 Z', fill: url(g), stroke: '#4a2c10', 'stroke-width': 1.4 }),
      [8, 14, 20, 26, 32, 38, 44, 50].map((x, i) => h('path', { d: `M ${x - 3} ${53 + (i % 2)} q 3 -5 7 -1`, stroke: i % 3 ? '#f6d98a' : '#6e4417', 'stroke-width': 1.1, fill: 'none' }))];
  },
  bed_fur(defs) {
    const g = nid('bf');
    defs.push(radial(g, [[0, '#f3dcc0'], [0.6, '#c9a27a'], [1, '#7a5634']], { cy: 0.25 }));
    return [h('path', { d: 'M 4 50 C 2 38 14 36 30 36 C 46 36 58 38 56 50 C 55 57 5 57 4 50 Z', fill: url(g), stroke: '#5a3a1e', 'stroke-width': 1.5 }),
      [10, 18, 26, 34, 42, 50].map((x) => h('path', { d: `M ${x - 4} 42 q 2 -3 4 0 q 2 -3 4 0`, stroke: '#fff3e2', 'stroke-width': 1.1, fill: 'none', opacity: 0.8 })),
      h('ellipse', { cx: 20, cy: 41, rx: 9, ry: 2.5, fill: '#ffffff', opacity: 0.35 })];
  },
  bed_tek(defs) {
    const g = nid('bt');
    defs.push(linear(g, [[0, '#3c4d5e'], [1, '#141c24']]));
    return [h('ellipse', { class: 'dec-glow', cx: 30, cy: 56, rx: 24, ry: 3.5, fill: '#35d7ff', opacity: 0.45 }),
      h('g', { class: 'dec-hover' },
        h('path', { d: 'M 4 44 Q 30 36 56 44 L 54 50 Q 30 56 6 50 Z', fill: url(g), stroke: '#0e141b', 'stroke-width': 1.5 }),
        h('path', { d: 'M 6 47 Q 30 52 54 47', stroke: '#35d7ff', 'stroke-width': 1.6, fill: 'none' }),
        h('path', { d: 'M 12 43 Q 30 39 48 43', stroke: '#9fe9ff', 'stroke-width': 1, fill: 'none', opacity: 0.6 }))];
  },
  toy_ball(defs) {
    const g = nid('tb');
    defs.push(radial(g, [[0, '#ffffff', 0.9], [0.5, '#ffffff', 0], [1, '#000000', 0.35]]));
    return [contact(defs, 30, 56, 12, 2.4, 0.3),
      h('circle', { cx: 30, cy: 42, r: 13, fill: '#ffffff', stroke: '#2a3140', 'stroke-width': 1.5 }),
      h('path', { d: 'M 30 29 Q 20 42 30 55 Q 24 42 30 29 Z', fill: '#e8453c' }),
      h('path', { d: 'M 30 29 Q 42 36 43 45 Q 36 38 30 29 Z', fill: '#4d9be6' }),
      h('path', { d: 'M 30 55 Q 40 52 43 45 Q 36 50 30 55 Z', fill: '#f3c33b' }),
      h('circle', { cx: 30, cy: 42, r: 13, fill: url(g) })];
  },
  toy_bone(defs) {
    const g = nid('tn');
    defs.push(linear(g, [[0, '#fffaf0'], [1, '#c9bda2']]));
    return [contact(defs, 30, 55, 20, 2.6, 0.3),
      h('path', { d: 'M 10 44 C 4 40 8 33 13 37 C 13 32 21 32 19 39 L 41 45 C 43 39 51 40 49 46 C 55 48 52 56 46 52 C 45 58 37 57 40 51 L 18 45 C 16 51 8 50 10 44 Z', fill: url(g), stroke: '#6a5a3a', 'stroke-width': 1.5, 'stroke-linejoin': 'round' })];
  },
  toy_drone(defs) {
    const g = nid('td');
    defs.push(radial(g, [[0, '#8a9aac'], [0.6, '#3a4654'], [1, '#141c24']]));
    return [h('ellipse', { cx: 30, cy: 56, rx: 10, ry: 2, fill: '#35d7ff', opacity: 0.3 }),
      h('g', { class: 'dec-hover' },
        h('path', { d: 'M 14 26 L 46 26', stroke: '#26313d', 'stroke-width': 2 }),
        h('ellipse', { class: 'dec-spin', cx: 14, cy: 25, rx: 7, ry: 1.6, fill: '#9fe9ff', opacity: 0.6 }),
        h('ellipse', { class: 'dec-spin', cx: 46, cy: 25, rx: 7, ry: 1.6, fill: '#9fe9ff', opacity: 0.6 }),
        h('circle', { cx: 30, cy: 34, r: 10, fill: url(g), stroke: '#0e141b', 'stroke-width': 1.4 }),
        h('circle', { class: 'dec-glow', cx: 32, cy: 34, r: 3.6, fill: '#5ff2ff' }),
        h('circle', { cx: 26, cy: 30, r: 2, fill: '#ffffff', opacity: 0.6 }))];
  },
  plant_fern(defs) {
    const pot = nid('pp'), leaf = nid('pl');
    defs.push(linear(pot, [[0, '#e0885a'], [1, '#9a4a26']], { x2: 1, y2: 0 }), linear(leaf, [[0, '#8fdc6a'], [1, '#2f7a3a']]));
    return [contact(defs, 30, 56, 12, 2.2, 0.3),
      [[-60, 20], [-30, 24], [0, 26], [30, 24], [60, 20]].map(([a, len]) => h('path', { d: `M 30 44 q ${r1(Math.sin(a * Math.PI / 180) * len * 0.3)} ${-len * 0.6} ${r1(Math.sin(a * Math.PI / 180) * len)} ${-len} q ${r1(-Math.sin(a * Math.PI / 180) * 4 - 3)} ${len * 0.5} ${r1(-Math.sin(a * Math.PI / 180) * len)} ${len}`, fill: url(leaf), stroke: '#1e5a2a', 'stroke-width': 1 })),
      h('path', { d: 'M 20 42 L 40 42 L 37 56 L 23 56 Z', fill: url(pot), stroke: '#5a2a12', 'stroke-width': 1.4 }),
      h('rect', { x: 18.5, y: 40, width: 23, height: 5, rx: 1.5, fill: '#e8966a', stroke: '#5a2a12', 'stroke-width': 1.2 })];
  },
  plant_mejo(defs) {
    const g = nid('pm');
    defs.push(radial(g, [[0, '#7ad05a'], [0.6, '#3f8f3a'], [1, '#1e4a22']]));
    return [contact(defs, 30, 56, 20, 2.6, 0.3),
      [[18, 44, 12], [40, 44, 12], [29, 34, 13]].map(([x, y, r]) => h('circle', { cx: x, cy: y, r, fill: url(g), stroke: '#1e4a22', 'stroke-width': 1.2 })),
      [[16, 40], [24, 32], [34, 30], [42, 40], [30, 44], [20, 48], [38, 50]].map(([x, y]) => [h('circle', { cx: x, cy: y, r: 2.6, fill: '#4a5adf', stroke: '#1a2060', 'stroke-width': 0.8 }), h('circle', { cx: x - 0.8, cy: y - 0.8, r: 0.8, fill: '#ffffff', opacity: 0.8 })])];
  },
  light_torch(defs) {
    const g = nid('lt'), f = nid('lf');
    defs.push(h('radialGradient', { id: g }, stops([[0, '#ffcf6a', 0.55], [1, '#ff8a2a', 0]])), radial(f, [[0, '#fff6c8'], [0.5, '#ffb43a'], [1, '#ff5a1a']], { cy: 0.7 }));
    return [contact(defs, 30, 56, 7, 1.8, 0.3),
      h('circle', { class: 'dec-glow', cx: 30, cy: 16, r: 22, fill: url(g) }),
      h('path', { d: 'M 28 22 L 32 22 L 31 56 L 29 56 Z', fill: '#6a4322', stroke: '#3a220c', 'stroke-width': 1 }),
      h('rect', { x: 26, y: 20, width: 8, height: 5, rx: 1.5, fill: '#4a3222' }),
      h('path', { class: 'dec-flame', d: 'M 30 4 C 36 12 36 18 30 21 C 24 18 24 12 30 4 Z', fill: url(f) })];
  },
  light_tek(defs) {
    const g = nid('lk');
    defs.push(h('radialGradient', { id: g }, stops([[0, '#9ff6ff', 0.6], [1, '#35d7ff', 0]])));
    return [contact(defs, 30, 56, 9, 2, 0.3),
      h('circle', { class: 'dec-glow', cx: 30, cy: 14, r: 20, fill: url(g) }),
      h('path', { d: 'M 29 20 L 31 20 L 32 52 L 28 52 Z', fill: '#3a4654' }),
      h('path', { d: 'M 22 56 L 38 56 L 35 51 L 25 51 Z', fill: '#26313d', stroke: '#0e141b', 'stroke-width': 1 }),
      h('circle', { cx: 30, cy: 14, r: 6, fill: '#e8fdff', stroke: '#35d7ff', 'stroke-width': 2 })];
  },
  trophy_alpha: (defs) => cup(defs, h('path', { d: 'M 30 20 l 5 4 l -2 6 l -6 0 l -2 -6 z', fill: '#e0304a', stroke: '#6a0a1a', 'stroke-width': 1 })),
  trophy_streak: (defs) => cup(defs, h('path', { d: 'M 30 18 C 35 23 34 28 30 31 C 26 28 25 23 30 18 Z', fill: '#ff8a2a', stroke: '#8a3a0a', 'stroke-width': 1 })),
  trophy_rank: (defs) => cup(defs, h('path', { d: 'M 30 19 l 1.8 3.7 4 .5 -3 2.8 .8 4 -3.6 -2 -3.6 2 .8 -4 -3 -2.8 4 -.5 z', fill: '#ffffff', stroke: '#6a4508', 'stroke-width': 0.8 })),
  ev_heart(defs) {
    const g = nid('eh');
    defs.push(radial(g, [[0, '#ffb3c6'], [0.55, '#ff4d7a'], [1, '#a0103a']]));
    return [contact(defs, 30, 56, 8, 2, 0.3),
      h('path', { d: 'M 30 56 Q 29 44 30 34', stroke: '#6a3a1a', 'stroke-width': 2, fill: 'none' }),
      h('path', { class: 'dec-bob', d: 'M 30 34 C 16 26 16 10 25 10 C 28 10 30 13 30 15 C 30 13 32 10 35 10 C 44 10 44 26 30 34 Z', fill: url(g), stroke: '#6a0a24', 'stroke-width': 1.4 }),
      h('ellipse', { cx: 24, cy: 16, rx: 3, ry: 4, fill: '#ffffff', opacity: 0.6, transform: 'rotate(-25 24 16)' })];
  },
  ev_egg(defs) {
    const g = nid('ee');
    defs.push(radial(g, [[0, '#ffffff'], [0.6, '#bfe8ff'], [1, '#6aa8d8']]));
    return [contact(defs, 30, 56, 10, 2, 0.3),
      h('path', { d: 'M 30 18 C 40 18 44 34 44 42 C 44 51 38 56 30 56 C 22 56 16 51 16 42 C 16 34 20 18 30 18 Z', fill: url(g), stroke: '#2a4a6a', 'stroke-width': 1.4 }),
      h('path', { d: 'M 17 38 Q 30 33 43 38', stroke: '#ff6f91', 'stroke-width': 3, fill: 'none' }),
      h('path', { d: 'M 17 46 l 4 -3 l 4 3 l 4 -3 l 4 3 l 4 -3 l 5 3', stroke: '#f3c33b', 'stroke-width': 2, fill: 'none' }),
      h('ellipse', { cx: 24, cy: 27, rx: 3, ry: 5, fill: '#ffffff', opacity: 0.7, transform: 'rotate(-20 24 27)' })];
  },
  ev_parasol(defs) {
    return [contact(defs, 30, 56, 16, 2.4, 0.3),
      h('path', { d: 'M 30 16 L 31 56', stroke: '#e8e0d0', 'stroke-width': 2 }),
      h('path', { d: 'M 6 26 Q 30 2 54 26 Z', fill: '#e8453c', stroke: '#6a1a12', 'stroke-width': 1.3 }),
      h('path', { d: 'M 22 26 Q 26 8 30 8 Q 34 8 38 26 Z', fill: '#ffffff' }),
      h('path', { d: 'M 6 26 Q 12 22 14 26 Q 18 21 22 26 Q 26 21 30 26 Q 34 21 38 26 Q 42 21 46 26 Q 48 22 54 26', fill: 'none', stroke: '#6a1a12', 'stroke-width': 1 })];
  },
  ev_pumpkin(defs) {
    const g = nid('ep');
    defs.push(radial(g, [[0, '#ffc07a'], [0.55, '#f28a1a'], [1, '#a04a0a']]));
    return [contact(defs, 30, 56, 16, 2.4, 0.3),
      h('path', { d: 'M 30 26 q 1 -6 5 -8', stroke: '#3a6a1a', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }),
      [[20, 42, 11], [40, 42, 11], [30, 42, 12]].map(([x, y, r]) => h('ellipse', { cx: x, cy: y, rx: r, ry: 13, fill: url(g), stroke: '#6a2a0a', 'stroke-width': 1.3 })),
      h('g', { class: 'dec-glow' },
        h('path', { d: 'M 22 38 l 4 -4 l 2 5 z M 38 38 l -4 -4 l -2 5 z', fill: '#fff06a' }),
        h('path', { d: 'M 21 46 q 9 7 18 0 l -3 1 l -2 -2 l -3 2 l -3 -2 l -2 2 z', fill: '#fff06a' }))];
  },
  ev_turkey(defs) {
    return [contact(defs, 30, 56, 14, 2.2, 0.3),
      [-60, -35, -10, 15, 40, 65].map((a, i) => h('ellipse', { cx: r1(30 + Math.sin(a * Math.PI / 180) * 12), cy: r1(36 - Math.cos(a * Math.PI / 180) * 12), rx: 5, ry: 11, fill: ['#c0392b', '#e67e22', '#f1c40f'][i % 3], stroke: '#5a2a0a', 'stroke-width': 1, transform: `rotate(${a} ${r1(30 + Math.sin(a * Math.PI / 180) * 12)} ${r1(36 - Math.cos(a * Math.PI / 180) * 12)})` })),
      h('ellipse', { cx: 30, cy: 44, rx: 11, ry: 10, fill: '#8a5a32', stroke: '#4a2a14', 'stroke-width': 1.3 }),
      h('circle', { cx: 30, cy: 32, r: 5.5, fill: '#a0703a', stroke: '#4a2a14', 'stroke-width': 1.2 }),
      h('path', { d: 'M 30 33 l 3 1 l -3 1.5 z', fill: '#f1c40f' }),
      h('path', { d: 'M 31 35 q 2 3 0 5', stroke: '#e0304a', 'stroke-width': 1.6, fill: 'none' }),
      h('circle', { cx: 28.5, cy: 31, r: 0.9, fill: '#1a1a1a' })];
  },
  ev_tree(defs) {
    const g = nid('et');
    defs.push(linear(g, [[0, '#3fa05a'], [1, '#1a5a32']], { x2: 1, y2: 0 }));
    return [contact(defs, 30, 56, 14, 2.2, 0.3),
      h('rect', { x: 27, y: 48, width: 6, height: 8, fill: '#6a4322' }),
      [[48, 20], [38, 16], [28, 12]].map(([y, w]) => h('path', { d: `M ${30 - w} ${y} L 30 ${y - 16} L ${30 + w} ${y} Z`, fill: url(g), stroke: '#0e3a1e', 'stroke-width': 1.2, 'stroke-linejoin': 'round' })),
      [[22, 44, '#e8453c'], [37, 42, '#f3c33b'], [27, 34, '#4d9be6'], [34, 28, '#e8453c'], [30, 38, '#ffffff']].map(([x, y, c], i) => h('circle', { class: 'dec-blink', cx: x, cy: y, r: 2, fill: c, style: `animation-delay:${i * 0.4}s` })),
      spark(30, 10, 4.4, '#ffd23f', 'dec-blink')];
  },
};

/** Einrichtungsstück (unten mittig verankert, viewBox 60×60). */
export function decorArt(id) {
  const defs = [];
  const body = (DECOR_ART[id] || DECOR_ART.toy_ball)(defs);
  return h('svg', { viewBox: '0 0 60 60', class: `prop-decor decor-${id}`, 'aria-hidden': 'true' }, h('defs', {}, defs), body);
}

/* -------------------------------------------------------------------------- */
/* Event-Dekoration über der Kulisse (320×240)                                  */
/* -------------------------------------------------------------------------- */

const heart = (x, y, s) => `M ${x} ${r1(y + s * 0.9)} C ${r1(x - s * 1.4)} ${r1(y)} ${r1(x - s * 0.8)} ${r1(y - s * 0.9)} ${x} ${r1(y - s * 0.3)} C ${r1(x + s * 0.8)} ${r1(y - s * 0.9)} ${r1(x + s * 1.4)} ${y} ${x} ${r1(y + s * 0.9)} Z`;

const EVENT_ART = {
  love: () => [[40, 70, 6], [96, 40, 4], [150, 86, 5], [214, 52, 7], [268, 96, 4.5], [300, 40, 5]].map(([x, y, s], i) =>
    h('path', { class: 'ev-float', d: heart(x, y, s), fill: i % 2 ? '#ff8fb0' : '#ff4d7a', opacity: 0.85, style: `animation-delay:${i * -1.1}s` })),
  eggcellent: () => [[26, 218, '#ff8fb0'], [70, 226, '#8fd6ff'], [250, 222, '#ffd23f'], [292, 214, '#a0e07a'], [150, 230, '#c9a0ff']].map(([x, y, c]) => h('g', {},
    h('ellipse', { cx: x, cy: y, rx: 6, ry: 8, fill: c, stroke: dark(c, 0.45), 'stroke-width': 1 }),
    h('path', { d: `M ${x - 6} ${y} q 6 -3 12 0`, stroke: '#ffffff', 'stroke-width': 1.6, fill: 'none' }))),
  summer: () => [[60, 40, '#ffd23f'], [250, 56, '#ff8fb0'], [170, 30, '#8fd6ff']].map(([x, y, c], i) => h('g', { class: 'ev-firework', style: `animation-delay:${i * 1.3}s;transform-origin:${x}px ${y}px` },
    Array.from({ length: 10 }, (_, k) => { const a = k * 36 * Math.PI / 180; return h('path', { d: `M ${r1(x + Math.cos(a) * 6)} ${r1(y + Math.sin(a) * 6)} L ${r1(x + Math.cos(a) * 16)} ${r1(y + Math.sin(a) * 16)}`, stroke: c, 'stroke-width': 1.8, 'stroke-linecap': 'round' }); }))),
  fear: () => [
    h('rect', { class: 'ev-fog', x: -40, y: 176, width: 400, height: 64, fill: '#7a3aa0', opacity: 0.22 }),
    ...[[60, 50], [120, 34], [236, 62]].map(([x, y], i) => h('path', { class: 'ev-bat', d: `M ${x} ${y} q -6 -6 -14 -2 q 4 2 4 6 q 4 -3 10 0 q 6 -3 10 0 q 0 -4 4 -6 q -8 -4 -14 2 z`, fill: '#1a1024', style: `animation-delay:${i * -1.6}s` })),
  ],
  turkey: () => Array.from({ length: 9 }, (_, i) => h('path', { class: 'ev-leaf', d: `M ${20 + i * 36} -6 q 5 -5 10 0 q -5 5 -10 0 z`, fill: ['#e67e22', '#c0392b', '#f1c40f'][i % 3], style: `animation-delay:${i * -1.2}s;animation-duration:${7 + (i % 3)}s` })),
  winter: () => [
    h('path', { d: 'M 0 8 Q 80 30 160 10 T 320 12', stroke: '#2a3a2a', 'stroke-width': 1.2, fill: 'none' }),
    ...Array.from({ length: 12 }, (_, i) => { const x = 14 + i * 26; const y = 12 + Math.sin(i * 1.3) * 5 + (i > 5 ? 2 : 8); return h('circle', { class: 'ev-bulb', cx: x, cy: r1(y + 4), r: 2.8, fill: ['#e8453c', '#ffd23f', '#4fd07a', '#4a9dff'][i % 4], style: `animation-delay:${(i % 4) * 0.35}s` }); }),
    ...Array.from({ length: 18 }, (_, i) => h('circle', { class: 'ev-snow', cx: (i * 41) % 320, cy: -6, r: 1.2 + (i % 3) * 0.6, fill: '#ffffff', opacity: 0.9, style: `animation-delay:${(i % 9) * -0.9}s` })),
  ],
  evolution: () => Array.from({ length: 10 }, (_, i) => spark(16 + i * 32, 200 - (i % 3) * 30, 2.6 + (i % 2), i % 2 ? '#ffd23f' : '#9ff6ff', 'ev-rise', i * -0.8)),
};

/** Dekoration aktiver Events über der Kulisse. */
export function eventArt(ids) {
  const layers = ids.filter((id) => EVENT_ART[id]).map((id) => h('g', { class: 'ev-' + id + '-layer' }, EVENT_ART[id]()));
  if (!layers.length) return null;
  return h('svg', { viewBox: '0 0 320 240', preserveAspectRatio: 'xMidYMax slice', class: 'scene-events', 'aria-hidden': 'true' }, layers);
}
