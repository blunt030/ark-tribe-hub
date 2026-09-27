/**
 * Echte Bilder im Tamagotchi: gemalte, freigestellte Kreaturen (wie bei den
 * Bestellungen), das Ei im gemalten Nest, der Embryo in der Brutkapsel und die
 * Landschaft aus den ARK-Karten (3D-Boden mit gemaltem Himmel) oder – nach Wahl –
 * als Gemälde. Arten ohne Bild behalten die gezeichnete Grafik (art.js).
 */
import { el } from '../ui.js';
import { SCENES, NEST_EGG, MAP_NAMES, landFor, sceneFor, motionOf, widthOf } from './artwork.js';
import { artFor } from './roster.js';

/* -------------------------------------------------------------------------- */
/* Farben und Varianten                                                          */
/* -------------------------------------------------------------------------- */

function hue(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.08) return { h: null, s: 0, l: (max + min) / 2 };
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(max + min - 1)), l: (max + min) / 2 };
}

/**
 * CSS-Filter für ein Bild: Zuchtfarben als Farbton-Verschiebung gegenüber der
 * Grundfarbe der Art, Varianten (Alpha glüht rot, Tek kühl-bläulich, Verwildert
 * blass) und Lebensphase (Babys heller, Alte etwas ausgeblichen).
 */
export function artFilter(sp, { colors, variant, stage } = {}) {
  const out = [];
  const want = colors?.[0] ? hue(colors[0]) : null;
  const base = hue(sp?.colors?.[0]);
  if (want && base) {
    if (want.h === null) out.push(`saturate(${Math.max(0.15, want.s).toFixed(2)})`);
    else if (base.h !== null) {
      const shift = Math.round(((want.h - base.h + 540) % 360) - 180);
      if (Math.abs(shift) > 6) out.push(`hue-rotate(${shift}deg)`, 'saturate(1.25)');
    }
    const light = want.l - base.l;
    if (Math.abs(light) > 0.08) out.push(`brightness(${(1 + light * 0.7).toFixed(2)})`);
  }
  if (variant === 'feral') out.push('saturate(.45)', 'contrast(1.12)', 'brightness(.9)');
  if (variant === 'tek') out.push('saturate(.55)', 'brightness(1.06)');
  if (stage === 'baby') out.push('brightness(1.06)', 'saturate(1.08)');
  if (stage === 'elder') out.push('saturate(.72)', 'sepia(.18)');
  return out.join(' ');
}

/* -------------------------------------------------------------------------- */
/* Tier                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Das Tier als Bild für den Bildschirm. Liefert den Knoten, die Breite (Prozent
 * des Bildschirms), das Seitenverhältnis und Kopf/Maul als Anteile der
 * Bildfläche in Blickrichtung rechts (wie bei der gezeichneten Grafik).
 */
export function realPet(sp, { stage = 'adult', variant = null, colors = null, title = '' } = {}) {
  const art = artFor(sp.key);
  if (!art) return null;
  const img = el('img.tama-real', { src: art.src, alt: title || sp.name, decoding: 'async', draggable: 'false' });
  const filter = artFilter(sp, { colors, variant, stage });
  if (filter) img.style.filter = filter;
  const turn = el('div.tama-real-turn' + (variant ? '.var-' + variant : '') + '.st-' + stage, { dataset: { face: String(art.face) } }, img);
  const right = (p) => (art.face === -1 ? [1 - p[0], p[1]] : [p[0], p[1]]);
  return {
    node: turn,
    art,
    width: widthOf(art, stage),
    aspect: art.w / art.h,
    base: art.base ?? 0.96,
    head: right(art.head),
    mouth: right(art.mouth),
    motion: motionOf(sp),
  };
}

/** Kleines Bild für Karten, Raster und Listen (echtes Motiv). */
export function realThumb(sp, o = {}, cls = '') {
  const art = artFor(sp.key);
  if (!art) return null;
  const img = el('img.tama-thumb.is-real' + (cls ? '.' + cls : ''), { src: art.src, alt: o.alt || '', loading: 'lazy', decoding: 'async' });
  const filter = artFilter(sp, o);
  if (filter) img.style.filter = filter;
  // Vorschaubilder blicken einheitlich nach rechts
  if (art.face === -1 && o.turn !== false) img.classList.add('is-mirror');
  return img;
}

/* -------------------------------------------------------------------------- */
/* Landschaft                                                                    */
/* -------------------------------------------------------------------------- */

const layer = (cls, style = '') => el('div.' + cls, style ? { style } : {});

/**
 * Landschaft hinter dem Tier. Stil „map“: Ausschnitt einer ARK-Karte als
 * schräger Boden im Raum, darüber gemalter Himmel der Tageszeit. Stil
 * „painted“: gemalte ARK-Kulisse. Meerestiere schwimmen hinter einer
 * durchscheinenden Wasserfläche.
 */
export function landscapeKey(sp, phase, { day = 0, style = 'map' } = {}) {
  if (style === 'painted') return ['painted', sceneFor(sp, phase, day), motionOf(sp), phase].join('|');
  const { biome, region, sky } = landFor(sp, phase, day);
  return ['map', biome, region.map, region.pos, sky.src, phase].join('|');
}

export function landscape(sp, phase, { day = 0, style = 'map' } = {}) {
  const motion = motionOf(sp);
  if (style === 'painted') {
    const key = sceneFor(sp, phase, day);
    const sc = SCENES[key];
    return {
      key: landscapeKey(sp, phase, { day, style }),
      node: el('div.tama-land.is-painted.phase-' + phase + '.scene-' + key, {},
        el('img.tama-land-painting', { src: sc.src, alt: '', decoding: 'async', style: `object-position:${sc.pos}` }),
        layer('tama-land-tint'),
        motion === 'swim' ? water(sc.water || 20) : null),
      label: null,
    };
  }
  const { biome, region, sky } = landFor(sp, phase, day);
  return {
    key: landscapeKey(sp, phase, { day, style }),
    node: el('div.tama-land.is-map.phase-' + phase + '.biome-' + biome, { dataset: { map: region.map } },
      layer('tama-land-sky', `background-image:url(${sky.src});background-position:${sky.pos};background-size:${sky.size}%`),
      layer('tama-land-ground', `background-image:url(/assets/maps/${region.map}.jpg);background-position:${region.pos};background-size:${region.size}%`),
      layer('tama-land-haze'),
      layer('tama-land-fx'),
      layer('tama-land-tint'),
      motion === 'swim' ? water(18) : null),
    label: MAP_NAMES[region.map] || null,
  };
}

function water(height) {
  return el('div.tama-water', { style: `height:${height}%` }, el('span.tama-water-shine'));
}

/* -------------------------------------------------------------------------- */
/* Ei und Brutkapsel                                                             */
/* -------------------------------------------------------------------------- */

const CRACKS = [
  '',
  'M50 14 l-5 9 l6 5 l-4 8',
  'M50 14 l-5 9 l6 5 l-4 8 M30 34 l8 3 l-2 7 l7 2 M66 30 l-6 5 l4 6',
  'M50 14 l-5 9 l6 5 l-4 8 l5 6 M30 34 l8 3 l-2 7 l7 2 l-3 6 M66 30 l-6 5 l4 6 l-5 5 M44 52 l6 4 l-3 6',
];

function crackSvg(level) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 100 100');
  s.setAttribute('preserveAspectRatio', 'none');
  s.setAttribute('class', 'tama-nest-cracks');
  s.setAttribute('aria-hidden', 'true');
  if (level > 0) {
    for (const [cls, width] of [['is-glow', 3.2], ['is-line', 1.4]]) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', CRACKS[Math.min(3, level)]);
      p.setAttribute('class', cls);
      p.setAttribute('stroke-width', String(width));
      p.setAttribute('vector-effect', 'non-scaling-stroke');
      s.append(p);
    }
  }
  return s;
}

/** Abzeichen mit dem Tier, das im Ei bzw. in der Kapsel heranwächst. */
function inside(sp) {
  const thumb = realThumb(sp, { alt: sp.name });
  return thumb ? el('div.tama-inside', { title: sp.name }, thumb) : null;
}

/**
 * Das Ei im gemalten Nest: Eine maskierte Kopie des Eis pulsiert, Risse wachsen
 * mit dem Brutfortschritt, kurz vor dem Schlüpfen glüht es.
 */
export function nestScene(sp, { cracks = 0, phase = 'day' } = {}) {
  const sc = SCENES.nest;
  const e = NEST_EGG;
  const pct = (v) => (v * 100).toFixed(1) + '%';
  const mask = `radial-gradient(ellipse ${pct(e.rx + 0.008)} ${pct(e.ry + 0.008)} at ${pct(e.cx)} ${pct(e.cy)}, #000 92%, transparent 100%)`;
  const copy = el('img.tama-nest-copy', { src: sc.src, alt: '', decoding: 'async', style: `object-position:${sc.pos};-webkit-mask-image:${mask};mask-image:${mask}` });
  const box = `left:${pct(e.cx - e.rx)};top:${pct(e.cy - e.ry)};width:${pct(e.rx * 2)};height:${pct(e.ry * 2)}`;
  const egg = el('div.tama-nest-egg' + (cracks >= 3 ? '.is-close' : ''), { style: `transform-origin:${pct(e.cx)} ${pct(e.bottom)}` },
    el('div.tama-nest-glow', { style: box }),
    copy,
    el('div.tama-nest-crackbox', { style: box }, crackSvg(cracks)));
  return el('div.tama-nest.phase-' + phase + '.cracks-' + cracks, {},
    el('img.tama-nest-bg', { src: sc.src, alt: '', decoding: 'async', style: `object-position:${sc.pos}` }),
    egg,
    layer('tama-land-tint'),
    inside(sp));
}

/** Lage der Brutkapsel (Anteile des Bildschirms; Bild 546 × 900). */
export const CAPSULE = { left: 0.37, bottom: 0.03, width: 0.26, aspect: 546 / 900 };

/** Säugetiere wachsen in der Brutkapsel heran (auf dem Steg der Basis). */
export function embryoScene(sp, { phase = 'day' } = {}) {
  const sc = SCENES[phase === 'night' ? 'camp' : 'workshop'];
  const c = CAPSULE;
  return el('div.tama-nest.is-embryo.phase-' + phase, {},
    el('img.tama-nest-bg', { src: sc.src, alt: '', decoding: 'async', style: `object-position:${sc.pos}` }),
    el('div.tama-capsule', { style: `left:${c.left * 100}%;bottom:${c.bottom * 100}%;width:${c.width * 100}%` },
      el('span.tama-capsule-glow'),
      el('img.tama-capsule-img', { src: '/assets/items/cut/embryo.webp', alt: '', decoding: 'async' }),
      el('span.tama-capsule-bubbles', {}, el('i'), el('i'), el('i'))),
    layer('tama-land-tint'),
    inside(sp));
}
