/**
 * Zeichenwerkzeug für die Kreaturen: Farben, Verläufe und Formen im
 * „Sticker“-Stil (weiche Volumen, farbige Kontur, glänzende Augen).
 *
 * Zusammengesetzte Körperteile nutzen die Kontur-darunter-Technik: Zuerst werden
 * alle Teilformen dick in Konturfarbe gezeichnet, darüber dieselben Formen in
 * der Füllfarbe. Übrig bleibt eine saubere Außenkontur der Vereinigung – ohne
 * sichtbare Nähte zwischen Kopf, Schnauze oder Hals.
 */
import { h } from './vdom.js';

export const OUT = 2.5;
export const r1 = (n) => Math.round(n * 10) / 10;

/* ---------------------------------- Farben ---------------------------------- */

export function rgb(c) {
  const n = parseInt(String(c).slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function hex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return hex(A.map((v, i) => v + (B[i] - v) * t));
}
export const light = (c, t) => mix(c, '#ffffff', t);
export const dark = (c, t) => mix(c, '#000000', t);
export function gray(c, t) {
  const [r, g, b] = rgb(c);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  return mix(c, hex([l, l, l]), t);
}
/** Konturfarbe: deutlich dunkler und leicht ins Violette gezogen – wirkt lebendiger als Schwarz. */
export const lineOf = (c) => dark(mix(c, '#24123a', 0.3), 0.58);
export const luminance = (c) => { const [r, g, b] = rgb(c); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };

/* ---------------------------------- Formen ---------------------------------- */

export const E = (cx, cy, rx, ry, rot = 0) => h('ellipse', {
  cx: r1(cx), cy: r1(cy), rx: r1(Math.max(0.1, rx)), ry: r1(Math.max(0.1, ry)),
  transform: rot ? `rotate(${r1(rot)} ${r1(cx)} ${r1(cy)})` : null,
});
export const C = (cx, cy, r) => h('circle', { cx: r1(cx), cy: r1(cy), r: r1(Math.max(0.1, r)) });
export const P = (d) => h('path', { d });
/** Röhre (Hals, Bein, Arm, Schwanz) – wird als dicker Strich mit runden Enden gezeichnet. */
export const T = (d, w) => h('path', { d, 'data-tube': r1(w) });

/** Pfad-Hilfen: Zahlen runden, Punkte verbinden. */
export const pt = (x, y) => `${r1(x)} ${r1(y)}`;

/**
 * Gruppe, die per CSS um den Punkt (ox, oy) bewegt wird (Kopf nicken, Flügel
 * schlagen). Eine feste SVG-Transformation wandert in eine äußere Gruppe:
 * Browser wenden transform-origin auch auf das transform-Attribut an, beides
 * am selben Element würde die Form verschieben.
 */
export function pivot(cls, ox, oy, transform, ...children) {
  const inner = h('g', { class: cls, style: `transform-origin:${r1(ox)}px ${r1(oy)}px` }, children);
  return transform ? h('g', { transform }, inner) : inner;
}
export function poly(points, close = true) {
  return 'M ' + points.map(([x, y]) => pt(x, y)).join(' L ') + (close ? ' Z' : '');
}

function clone(v, extra) {
  const attrs = { ...v.attrs, ...extra };
  delete attrs['data-tube'];
  return { tag: v.tag, attrs, children: v.children };
}

/* ----------------------------------- Kit ------------------------------------ */

/**
 * Pro gezeichneter Kreatur ein Kit mit eigenem ID-Präfix: Auf einer Seite
 * stehen bis zu 217 Kreaturen nebeneinander, ihre Verläufe dürfen sich nicht
 * gegenseitig überschreiben.
 */
export function makeKit(prefix) {
  const defs = [];
  let n = 0;
  const nextId = (p) => `${prefix}-${p}${n++}`;

  const K = {
    defs,
    id: nextId,

    /**
     * 3D-Licht für die ganze Figur: Die weichgezeichnete Silhouette dient als
     * Höhenkarte. Diffuses Licht von links oben modelliert Rundungen, ein
     * Glanzlicht gibt den Vinyl-Look, ein kühles Randlicht trennt die Figur vom
     * Hintergrund. Liefert die Filter-ID.
     */
    shade3d({ rim = '#e4f6ff', strength = 1 } = {}) {
      const id = nextId('l');
      const o = globalThis.__shade3d || {};
      const blur = o.blur ?? 10, scale = (o.scale ?? 4) * strength;
      defs.push(h('filter', { id, x: '-8%', y: '-8%', width: '116%', height: '116%', 'color-interpolation-filters': 'sRGB' },
        h('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: blur, result: 'hm' }),
        h('feDiffuseLighting', { in: 'hm', surfaceScale: scale, diffuseConstant: o.diffuse ?? 1, 'lighting-color': '#ffffff', result: 'diff' },
          h('feDistantLight', { azimuth: 235, elevation: o.elev ?? 48 })),
        h('feComposite', { in: 'SourceGraphic', in2: 'diff', operator: 'arithmetic', k1: o.k1 ?? 0.8, k2: o.k2 ?? 0.42, k3: 0, k4: 0, result: 'shade' }),
        h('feSpecularLighting', { in: 'hm', surfaceScale: scale, specularConstant: o.spec ?? 0.35, specularExponent: o.exp ?? 40, 'lighting-color': '#ffffff', result: 'spec' },
          h('feDistantLight', { azimuth: 235, elevation: o.specElev ?? 56 })),
        h('feComposite', { in: 'spec', in2: 'SourceAlpha', operator: 'in', result: 'specA' }),
        h('feComposite', { in: 'specA', in2: 'shade', operator: 'arithmetic', k1: 0, k2: o.specMix ?? 0.45, k3: 1, k4: 0, result: 'lit' }),
        h('feOffset', { in: 'SourceAlpha', dx: -2.5, dy: 2, result: 'off' }),
        h('feComposite', { in: 'SourceAlpha', in2: 'off', operator: 'out', result: 'rimMask' }),
        h('feGaussianBlur', { in: 'rimMask', stdDeviation: 1.4, result: 'rimSoft' }),
        h('feComposite', { in: 'rimSoft', in2: 'SourceAlpha', operator: 'in', result: 'rimIn' }),
        h('feFlood', { 'flood-color': rim, 'flood-opacity': o.rim ?? 0.5 }),
        h('feComposite', { in2: 'rimIn', operator: 'in', result: 'rimLight' }),
        h('feMerge', {}, h('feMergeNode', { in: 'lit' }), h('feMergeNode', { in: 'rimLight' }))));
      return id;
    },

    /** Weicher Kontaktschatten unter der Figur. */
    softShadow() {
      const id = nextId('s');
      defs.push(h('filter', { id, x: '-30%', y: '-200%', width: '160%', height: '500%' }, h('feGaussianBlur', { stdDeviation: 3.2 })));
      return id;
    },

    /** Volumen-Füllung: Radialverlauf, Licht von oben links. */
    vol(color, cx, cy, r, { hi = 0.3, lo = 0.28 } = {}) {
      const gid = nextId('v');
      defs.push(h('radialGradient', {
        id: gid, gradientUnits: 'userSpaceOnUse', cx: r1(cx), cy: r1(cy), r: r1(r), fx: r1(cx - r * 0.3), fy: r1(cy - r * 0.38),
      },
      h('stop', { offset: '0', 'stop-color': light(color, hi) }),
      h('stop', { offset: '0.5', 'stop-color': color }),
      h('stop', { offset: '1', 'stop-color': dark(color, lo) })));
      return `url(#${gid})`;
    },

    /** Senkrechter Verlauf (z. B. für Flügelhäute und Flossen). */
    lin(top, bottom, y1, y2) {
      const gid = nextId('l');
      defs.push(h('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: r1(y1), x2: 0, y2: r1(y2) },
        h('stop', { offset: '0', 'stop-color': top }),
        h('stop', { offset: '1', 'stop-color': bottom })));
      return `url(#${gid})`;
    },

    /** Leuchten (Biolumineszenz, Element, Alpha-Aura) als weicher Radialverlauf. */
    glow(color, cx, cy, r, opacity = 0.8) {
      const gid = nextId('g');
      defs.push(h('radialGradient', { id: gid, gradientUnits: 'userSpaceOnUse', cx: r1(cx), cy: r1(cy), r: r1(r) },
        h('stop', { offset: '0', 'stop-color': color, 'stop-opacity': opacity }),
        h('stop', { offset: '0.45', 'stop-color': color, 'stop-opacity': opacity * 0.45 }),
        h('stop', { offset: '1', 'stop-color': color, 'stop-opacity': 0 })));
      return h('circle', { cx: r1(cx), cy: r1(cy), r: r1(r), fill: `url(#${gid})` });
    },

    /** Vereinigte Formen mit einer gemeinsamen Außenkontur. */
    blob(cls, shapes, fill, line, attrs = {}) {
      const list = shapes.flat().filter(Boolean);
      const outline = list.map((s) => (s.attrs['data-tube']
        ? clone(s, { fill: 'none', stroke: line, 'stroke-width': r1(Number(s.attrs['data-tube']) + OUT * 2), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
        : clone(s, { fill: line, stroke: line, 'stroke-width': OUT * 2, 'stroke-linejoin': 'round' })));
      const body = list.map((s) => (s.attrs['data-tube']
        ? clone(s, { fill: 'none', stroke: fill, 'stroke-width': s.attrs['data-tube'], 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
        : clone(s, { fill })));
      return h('g', { class: cls || null, ...attrs }, outline, body);
    },

    /** Einfache Form mit eigener Kontur (für kleine Details wie Hörner und Krallen). */
    solid(shape, fill, line, width = 1.8, attrs = {}) {
      return clone(shape, { fill, stroke: line, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...attrs });
    },

    /** Glanzlicht auf einer Rundung. */
    sheen(cx, cy, rx, ry, rot = -25, opacity = 0.32) {
      return h('ellipse', { cx: r1(cx), cy: r1(cy), rx: r1(rx), ry: r1(ry), fill: '#ffffff', opacity, transform: `rotate(${rot} ${r1(cx)} ${r1(cy)})` });
    },

    /**
     * Großes, glänzendes Auge mit allen Ausdrücken. Welcher Ausdruck sichtbar ist,
     * entscheidet CSS über die Stimmungsklasse am Wurzelelement. Ohne CSS (z. B.
     * im Minispiel) ist nur das offene Auge zu sehen.
     */
    eye(x, y, r, { iris = '#2a1d2e', tint = null, skin = '#888888', line = '#222222', glow = null, front = false } = {}) {
      const rx = r * (front ? 0.92 : 0.84);
      const w = Math.max(1.6, r * 0.34);
      // Glänzende Iris: dunkle Pupille, farbiger Ring, Lichtreflex unten (wie in 3D-Spielen)
      let irisFill;
      if (glow) irisFill = K.vol(glow, x - r * 0.2, y - r * 0.2, r * 1.6, { hi: 0.45, lo: 0.35 });
      else {
        const gid = nextId('i');
        const ring = tint || K.eyeTint || mix(iris, '#6b4a2e', 0.55);
        defs.push(h('radialGradient', { id: gid, gradientUnits: 'userSpaceOnUse', cx: r1(x), cy: r1(y + r * 0.12), r: r1(r * 1.05) },
          h('stop', { offset: '0', 'stop-color': '#120a16' }),
          h('stop', { offset: '0.42', 'stop-color': dark(iris, 0.25) }),
          h('stop', { offset: '0.62', 'stop-color': ring }),
          h('stop', { offset: '0.86', 'stop-color': light(ring, 0.28) }),
          h('stop', { offset: '1', 'stop-color': dark(ring, 0.35) })));
        irisFill = `url(#${gid})`;
      }
      return h('g', { class: 'c-eye' },
        glow ? K.glow(glow, x, y, r * 2.2, 0.55) : null,
        h('g', { class: 'e-open' },
          h('ellipse', { cx: r1(x), cy: r1(y), rx: r1(rx), ry: r1(r), fill: irisFill, stroke: line, 'stroke-width': 1.3 }),
          h('ellipse', { cx: r1(x), cy: r1(y - r * 0.55), rx: r1(rx * 0.72), ry: r1(r * 0.34), fill: '#ffffff', opacity: 0.12 }),
          h('circle', { cx: r1(x + r * 0.3), cy: r1(y - r * 0.36), r: r1(r * 0.36), fill: '#ffffff' }),
          h('circle', { cx: r1(x - r * 0.28), cy: r1(y + r * 0.4), r: r1(r * 0.15), fill: '#ffffff', opacity: 0.85 })),
        h('ellipse', {
          class: 'c-lid', display: 'none', cx: r1(x), cy: r1(y), rx: r1(rx + 0.8), ry: r1(r + 0.8), fill: skin, stroke: line, 'stroke-width': 1.2,
          style: `transform-origin:${r1(x)}px ${r1(y - r)}px`,
        }),
        h('path', { class: 'e-happy', display: 'none', d: `M ${pt(x - r * 0.8, y + r * 0.25)} Q ${pt(x, y - r * 0.95)} ${pt(x + r * 0.8, y + r * 0.25)}`, fill: 'none', stroke: line, 'stroke-width': r1(w), 'stroke-linecap': 'round' }),
        h('path', { class: 'e-closed', display: 'none', d: `M ${pt(x - r * 0.8, y)} Q ${pt(x, y + r * 0.75)} ${pt(x + r * 0.8, y)}`, fill: 'none', stroke: line, 'stroke-width': r1(w), 'stroke-linecap': 'round' }),
        h('g', { class: 'e-sad', display: 'none' },
          h('ellipse', { cx: r1(x), cy: r1(y + r * 0.15), rx: r1(rx * 0.9), ry: r1(r * 0.85), fill: irisFill, stroke: line, 'stroke-width': 1.3 }),
          h('path', { d: `M ${pt(x - rx - 1, y - r * 0.55)} L ${pt(x + rx + 1, y - r * 0.05)} L ${pt(x + rx + 1, y - r - 2)} L ${pt(x - rx - 1, y - r - 2)} Z`, fill: skin }),
          h('path', { d: `M ${pt(x - rx, y - r * 0.5)} L ${pt(x + rx, y - r * 0.02)}`, stroke: line, 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
          h('circle', { cx: r1(x + r * 0.25), cy: r1(y + r * 0.05), r: r1(r * 0.22), fill: '#ffffff' }),
          h('path', { class: 'e-tear', d: `M ${pt(x + rx * 0.6, y + r * 0.9)} q ${r1(r * 0.35)} ${r1(r * 0.6)} 0 ${r1(r * 0.9)} q ${r1(-r * 0.35)} ${r1(-r * 0.3)} 0 ${r1(-r * 0.9)} z`, fill: '#8fd6ff', stroke: '#3a78b0', 'stroke-width': 0.8 })),
        h('path', { class: 'e-dizzy', display: 'none', d: `M ${pt(x, y)} m ${r1(-r * 0.15)} 0 a ${r1(r * 0.15)} ${r1(r * 0.15)} 0 1 1 ${r1(r * 0.3)} 0 a ${r1(r * 0.4)} ${r1(r * 0.4)} 0 1 1 ${r1(-r * 0.75)} 0 a ${r1(r * 0.65)} ${r1(r * 0.65)} 0 1 1 ${r1(r * 1.25)} 0`, fill: 'none', stroke: line, 'stroke-width': r1(w * 0.7), 'stroke-linecap': 'round' }),
        h('path', { class: 'e-x', display: 'none', d: `M ${pt(x - r * 0.6, y - r * 0.6)} L ${pt(x + r * 0.6, y + r * 0.6)} M ${pt(x + r * 0.6, y - r * 0.6)} L ${pt(x - r * 0.6, y + r * 0.6)}`, stroke: line, 'stroke-width': r1(w), 'stroke-linecap': 'round' }),
        h('path', { class: 'e-brow', display: 'none', d: `M ${pt(x - r * 0.95, y - r * 1.35)} L ${pt(x + r * 0.9, y - r * 0.85)}`, stroke: line, 'stroke-width': r1(w * 0.95), 'stroke-linecap': 'round' }));
    },

    /** Mund an einer Schnauze: Lächeln, offen (Fressen/Brüllen), traurig. */
    mouth(d, { open, line = '#222', teeth = [], tongue = true } = {}) {
      return h('g', { class: 'c-mouth' },
        h('g', { class: 'm-smile' },
          h('path', { d, fill: 'none', stroke: line, 'stroke-width': 2, 'stroke-linecap': 'round' }),
          teeth.map(([x, y, s = 3]) => h('path', { d: `M ${pt(x - s * 0.5, y)} L ${pt(x, y + s * 1.1)} L ${pt(x + s * 0.5, y)} Z`, fill: '#fffaf0', stroke: line, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }))),
        open ? h('g', { class: 'm-open', display: 'none' },
          h('ellipse', { cx: r1(open[0]), cy: r1(open[1]), rx: r1(open[2]), ry: r1(open[3]), fill: '#5a1a2a', stroke: line, 'stroke-width': 1.6 }),
          tongue ? h('ellipse', { cx: r1(open[0]), cy: r1(open[1] + open[3] * 0.45), rx: r1(open[2] * 0.6), ry: r1(open[3] * 0.4), fill: '#ff7b8f' }) : null,
          teeth.length ? h('path', { d: `M ${pt(open[0] - open[2] * 0.6, open[1] - open[3] * 0.75)} l 2 3.5 l 2 -3.5 M ${pt(open[0] + open[2] * 0.2, open[1] - open[3] * 0.8)} l 2 3.5 l 2 -3.5`, fill: '#fffaf0', stroke: line, 'stroke-width': 0.6 }) : null) : null);
    },

    blush(x, y, rx, ry = rx * 0.6) {
      return h('ellipse', { class: 'c-blush', cx: r1(x), cy: r1(y), rx: r1(rx), ry: r1(ry), fill: '#ff6f91', opacity: 0.38 });
    },

    /** Krallen/Zehen als kleine helle Dreiecke. */
    claws(points, line, fill = '#f4eee0', s = 3.2) {
      return h('g', { class: 'c-claws' }, points.map(([x, y, dir = 1]) =>
        h('path', { d: `M ${pt(x - s * 0.55, y - s * 0.3)} Q ${pt(x + dir * s * 0.9, y - s * 0.2)} ${pt(x + dir * s * 1.05, y + s * 0.55)} Q ${pt(x + dir * s * 0.1, y + s * 0.4)} ${pt(x - s * 0.55, y - s * 0.3)} Z`, fill, stroke: line, 'stroke-width': 0.9, 'stroke-linejoin': 'round' })));
    },
  };
  return K;
}
