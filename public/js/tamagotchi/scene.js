/**
 * Bühne des Tamagotchi-Bildschirms: Lebensräume mit Tageszeit, Requisiten
 * (Häufchen, Futter, Medizin, Ei, Kryopod, Grabstein) und die Symbole der
 * Bedienelemente. Alles als SVG-Daten (vdom), damit es scharf skaliert und ohne
 * externe Bilder auskommt.
 */
import { h } from './vdom.js';
import { light, dark, mix, r1 } from './art-kit.js';

/* -------------------------------------------------------------------------- */
/* Tageszeit                                                                     */
/* -------------------------------------------------------------------------- */

export function dayPhase(ms) {
  const hr = new Date(ms).getHours();
  if (hr >= 5 && hr < 8) return 'dawn';
  if (hr >= 8 && hr < 18) return 'day';
  if (hr >= 18 && hr < 21) return 'dusk';
  return 'night';
}

const SKY = {
  dawn: ['#ff9f7a', '#ffd3a1', '#9ecbff'],
  day: ['#5fb6ff', '#9dd6ff', '#e4f5ff'],
  dusk: ['#3c2f7a', '#c0587a', '#ffad6b'],
  night: ['#050b1d', '#0e1f45', '#26335e'],
};

let uid = 0;

/* -------------------------------------------------------------------------- */
/* Lebensräume                                                                   */
/* -------------------------------------------------------------------------- */

function stars(n, seed, color = '#ffffff') {
  const out = [];
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) out.push(h('circle', { class: 'sc-star', cx: r1(rnd() * 320), cy: r1(rnd() * 130), r: r1(0.4 + rnd() * 1.2), fill: color, opacity: r1(0.4 + rnd() * 0.6), style: `animation-delay:${r1(rnd() * 4)}s` }));
  return out;
}

function sun(phase) {
  if (phase === 'night') return [h('circle', { cx: 262, cy: 46, r: 16, fill: '#f4f1d8' }), h('circle', { cx: 270, cy: 40, r: 14, fill: SKY.night[1] }), h('circle', { cx: 262, cy: 46, r: 30, fill: '#f4f1d8', opacity: 0.08 })];
  const y = phase === 'day' ? 40 : 92;
  const c = phase === 'day' ? '#fff6c8' : '#ffd08a';
  return [h('circle', { cx: 262, cy: y, r: 36, fill: c, opacity: 0.18 }), h('circle', { cx: 262, cy: y, r: 18, fill: c })];
}

function clouds(color, opacity, y = 40) {
  return h('g', { class: 'sc-clouds', opacity },
    ...[[40, y, 1], [150, y + 16, 0.8], [250, y - 6, 1.1], [360, y + 8, 0.9]].map(([x, cy, s]) => h('g', { transform: `translate(${x} ${cy}) scale(${s})` },
      h('ellipse', { cx: 0, cy: 0, rx: 26, ry: 9, fill: color }), h('ellipse', { cx: -12, cy: -6, rx: 13, ry: 9, fill: color }), h('ellipse', { cx: 9, cy: -8, rx: 15, ry: 11, fill: color }))));
}

function obelisk(x, y, color, s = 1) {
  return h('g', { class: 'sc-obelisk', transform: `translate(${x} ${y}) scale(${s})` },
    h('path', { d: 'M 0 0 L 5 -58 L 8 -64 L 11 -58 L 16 0 Z', fill: '#1c2433', opacity: 0.85 }),
    h('path', { d: 'M 7 -54 L 8 -58 L 9 -54 L 9 -8 L 7 -8 Z', fill: color }),
    h('circle', { cx: 8, cy: -30, r: 18, fill: color, opacity: 0.12 }));
}

function palm(x, y, s = 1, col = '#1f6b3a') {
  return h('g', { transform: `translate(${x} ${y}) scale(${s})` },
    h('path', { d: 'M 0 0 Q 4 -30 -2 -56', stroke: '#5a3d24', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }),
    ...[-150, -110, -70, -30, 10].map((a) => {
      const rad = a * Math.PI / 180;
      return h('path', { d: `M -2 -56 q ${r1(Math.cos(rad) * 16)} ${r1(Math.sin(rad) * 16 - 8)} ${r1(Math.cos(rad) * 30)} ${r1(Math.sin(rad) * 20 + 6)} q ${r1(-Math.cos(rad) * 10)} -3 ${r1(-Math.cos(rad) * 30)} ${r1(-Math.sin(rad) * 20 - 6)} z`, fill: col });
    }));
}

function pine(x, y, s = 1, col = '#1d4a3a', snow = false) {
  return h('g', { transform: `translate(${x} ${y}) scale(${s})` },
    h('rect', { x: -2, y: -8, width: 4, height: 10, fill: '#4a3222' }),
    ...[0, 1, 2].map((i) => h('path', { d: `M ${-16 + i * 3} ${-6 - i * 14} L 0 ${-30 - i * 14} L ${16 - i * 3} ${-6 - i * 14} Z`, fill: col })),
    snow ? h('path', { d: 'M -8 -38 L 0 -58 L 8 -38 Q 0 -44 -8 -38 Z', fill: '#f4fbff' }) : null);
}

function hills(color, pts, y = 240) {
  return h('path', { d: `M 0 ${y} L ${pts.map(([x, py]) => `${x} ${py}`).join(' L ')} L 320 ${y} Z`, fill: color });
}

function groundBand(top, bottom, y = 196, deco = null) {
  const id = 'gnd' + uid++;
  return [
    h('defs', {}, h('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, h('stop', { offset: 0, 'stop-color': top }), h('stop', { offset: 1, 'stop-color': bottom }))),
    h('path', { d: `M 0 ${y} Q 80 ${y - 6} 160 ${y} T 320 ${y} L 320 240 L 0 240 Z`, fill: `url(#${id})` }),
    deco,
  ];
}

function tufts(color, y = 198) {
  return h('g', { opacity: 0.9 }, ...[18, 70, 118, 210, 262, 300].map((x, i) => h('path', { d: `M ${x} ${y + (i % 2) * 6} l 3 -8 l 2 8 l 3 -6 l 1 6`, stroke: color, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' })));
}

let waterId = 'sc-water';

const BIOMES = {
  jungle: (p, n) => [
    hills(mix('#2f6d5a', SKY[p][1], 0.45), [[0, 150], [40, 128], [90, 142], [120, 110], [150, 70], [168, 62], [186, 72], [210, 116], [260, 130], [320, 118]]),
    h('path', { d: 'M 162 64 q 6 -10 12 0', fill: 'none', stroke: '#ff7a3a', 'stroke-width': 2, opacity: 0.7 }),
    h('ellipse', { class: 'sc-smoke', cx: 168, cy: 52, rx: 10, ry: 6, fill: '#c9c9c9', opacity: 0.35 }),
    obelisk(248, 150, n ? '#6ae0ff' : '#58b8ff', 0.9),
    hills(mix('#1f5a3a', SKY[p][2], 0.2), [[0, 172], [60, 156], [110, 166], [170, 150], [240, 164], [320, 150]]),
    palm(36, 196, 1.1), palm(292, 198, 0.9, '#236e3e'),
    ...groundBand('#4f8c3a', '#2e5a26', 196, tufts('#7cc05a')),
    h('g', {}, ...[[60, 204, '#ff6f91'], [140, 212, '#ffd35a'], [226, 206, '#ffffff']].map(([x, y, c]) => h('circle', { cx: x, cy: y, r: 2.4, fill: c }))),
  ],
  forest: (p, n) => [
    hills(mix('#264a3a', SKY[p][1], 0.4), [[0, 140], [70, 118], [130, 132], [200, 110], [260, 126], [320, 112]]),
    ...[20, 80, 250, 300].map((x, i) => h('rect', { x: x - 7, y: 40 + i * 10, width: 14, height: 160, fill: mix('#5a3a28', SKY[p][1], 0.35), rx: 3 })),
    obelisk(150, 160, n ? '#7dff9a' : '#4fd07a', 0.8),
    ...[20, 80, 250, 300].map((x, i) => h('ellipse', { cx: x, cy: 44 + i * 10, rx: 34, ry: 22, fill: mix('#2d6b43', SKY[p][1], 0.2) })),
    ...groundBand('#3d6b35', '#233d1f', 196, tufts('#6aa84a')),
    h('g', {}, ...[[48, 196], [270, 198]].map(([x, y]) => h('path', { d: `M ${x} ${y} q -10 -16 -2 -24 q 4 10 4 24 M ${x} ${y} q 10 -16 2 -24`, fill: '#4c8a3c' }))),
  ],
  snow: (p) => [
    hills(mix('#b9cbe6', SKY[p][1], 0.3), [[0, 150], [50, 100], [90, 130], [140, 80], [190, 126], [240, 94], [290, 130], [320, 118]]),
    h('path', { d: 'M 50 100 L 62 114 L 38 114 Z M 140 80 L 156 98 L 124 98 Z M 240 94 L 254 110 L 226 110 Z', fill: '#ffffff', opacity: 0.9 }),
    pine(34, 198, 1.1, '#1f4a44', true), pine(70, 194, 0.8, '#255650', true), pine(286, 198, 1.2, '#1f4a44', true),
    ...groundBand('#f4f9ff', '#c9dcef', 194, null),
    h('g', { class: 'sc-snow' }, ...Array.from({ length: 24 }, (_, i) => h('circle', { cx: (i * 53) % 320, cy: (i * 37) % 200, r: 1.2 + (i % 3) * 0.5, fill: '#ffffff', opacity: 0.85, style: `animation-delay:${(i % 8) * -0.9}s` }))),
  ],
  desert: (p, n) => [
    hills(mix('#d9a066', SKY[p][1], 0.35), [[0, 160], [60, 140], [120, 156], [190, 134], [260, 150], [320, 136]]),
    h('path', { d: 'M 214 150 L 214 106 Q 232 88 250 106 L 250 150 L 242 150 L 242 112 Q 232 100 222 112 L 222 150 Z', fill: mix('#b87a45', SKY[p][1], 0.25) }),
    obelisk(84, 158, n ? '#ff7a8a' : '#ff5a6a', 0.75),
    ...groundBand('#f0c98a', '#d39a55', 196, null),
    h('path', { d: 'M 30 196 l 0 -26 q 0 -6 5 -6 q 5 0 5 6 l 0 26 M 35 182 l -8 0 l 0 -8 M 35 178 l 8 0 l 0 -10', stroke: '#4f8a4a', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }),
    h('g', { class: 'sc-haze', opacity: 0.25 }, h('path', { d: 'M 0 186 q 40 -6 80 0 t 80 0 t 80 0 t 80 0', stroke: '#fff4d8', 'stroke-width': 2, fill: 'none' })),
  ],
  swamp: (p) => [
    hills(mix('#3f5a44', SKY[p][1], 0.45), [[0, 150], [80, 138], [160, 150], [240, 134], [320, 148]]),
    ...[40, 110, 270].map((x, i) => h('path', { d: `M ${x} 200 q -4 -60 6 -110 M ${x + 2} 150 q 14 -10 26 -4 M ${x + 4} 130 q -16 -10 -26 0`, stroke: mix('#3b2e22', SKY[p][1], 0.2), 'stroke-width': 5 - i, fill: 'none', 'stroke-linecap': 'round' })),
    ...groundBand('#4a5a34', '#2c3620', 196, null),
    h('ellipse', { cx: 210, cy: 212, rx: 70, ry: 10, fill: '#3d6a6a', opacity: 0.8 }),
    h('g', {}, ...[190, 206, 230].map((x) => h('path', { d: `M ${x} 212 l 0 -26 m -3 0 a 3 5 0 1 0 6 0 a 3 5 0 1 0 -6 0`, stroke: '#6a5a2a', 'stroke-width': 1.6, fill: '#8a5a2a' }))),
    h('rect', { class: 'sc-fog', x: -40, y: 150, width: 400, height: 40, fill: '#dfeee0', opacity: 0.12 }),
  ],
  cave: () => [
    h('rect', { x: 0, y: 0, width: 320, height: 240, fill: '#150f2e' }),
    hills('#221748', [[0, 90], [40, 60], [80, 96], [140, 50], [200, 88], [260, 58], [320, 84]], 0),
    h('path', { d: 'M 0 0 L 0 40 L 20 70 L 40 30 L 70 60 L 100 20 L 130 50 L 170 10 L 210 56 L 250 24 L 290 62 L 320 30 L 320 0 Z', fill: '#0d0920' }),
    ...[[40, 190, '#7affc8'], [96, 180, '#b27aff'], [250, 186, '#7ad8ff'], [296, 176, '#ff7ad8']].map(([x, y, c]) => h('g', { class: 'sc-glow' },
      h('circle', { cx: x, cy: y - 10, r: 22, fill: c, opacity: 0.16 }),
      h('path', { d: `M ${x} ${y} q -1 -10 0 -16`, stroke: '#d8cfff', 'stroke-width': 2 }),
      h('ellipse', { cx: x, cy: y - 16, rx: 9, ry: 5, fill: c }))),
    ...groundBand('#2b1e55', '#140d2e', 196, null),
    h('g', { class: 'sc-motes' }, ...Array.from({ length: 14 }, (_, i) => h('circle', { cx: (i * 71) % 320, cy: 60 + (i * 29) % 120, r: 1.4, fill: ['#7affc8', '#b27aff', '#7ad8ff'][i % 3], style: `animation-delay:${(i % 7) * -0.7}s` }))),
  ],
  ocean: () => [
    h('rect', { x: 0, y: 0, width: 320, height: 240, fill: `url(#${waterId})` }),
    h('g', { class: 'sc-rays', opacity: 0.18 }, ...[40, 110, 190, 260].map((x) => h('path', { d: `M ${x} 0 L ${x + 30} 0 L ${x + 70} 240 L ${x + 10} 240 Z`, fill: '#e8fbff' }))),
    ...[30, 64, 280].map((x, i) => h('path', { class: 'sc-kelp', d: `M ${x} 214 q 10 -30 0 -60 q -10 -30 4 -70`, stroke: ['#2f8a5a', '#3aa06a', '#2f7a4a'][i], 'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round', style: `transform-origin:${x}px 214px` })),
    ...groundBand('#e8d3a0', '#b89a64', 204, null),
    h('path', { d: 'M 230 206 l 6 -8 l 6 8 z M 120 214 a 5 3 0 1 0 10 0 a 5 3 0 1 0 -10 0', fill: '#ff9aa8', opacity: 0.8 }),
    h('g', { class: 'sc-bubbles' }, ...Array.from({ length: 10 }, (_, i) => h('circle', { cx: 20 + (i * 31) % 300, cy: 230, r: 2 + (i % 3), fill: 'none', stroke: '#e8fbff', 'stroke-width': 1, opacity: 0.7, style: `animation-delay:${(i % 5) * -1.3}s` }))),
  ],
  sky: (p) => [
    clouds('#ffffff', p === 'night' ? 0.15 : 0.55, 60),
    h('g', { transform: 'translate(250 120)' }, h('path', { d: 'M -40 0 L 40 0 L 20 30 L -10 44 L -30 24 Z', fill: mix('#7a6a5a', SKY[p][1], 0.35) }), h('ellipse', { cx: 0, cy: 0, rx: 40, ry: 7, fill: mix('#4f8c3a', SKY[p][1], 0.3) })),
    h('g', { transform: 'translate(60 90) scale(0.6)' }, h('path', { d: 'M -40 0 L 40 0 L 20 30 L -10 44 L -30 24 Z', fill: mix('#7a6a5a', SKY[p][1], 0.5) }), h('ellipse', { cx: 0, cy: 0, rx: 40, ry: 7, fill: mix('#4f8c3a', SKY[p][1], 0.45) })),
    clouds('#ffffff', p === 'night' ? 0.2 : 0.8, 200),
    h('rect', { x: 0, y: 206, width: 320, height: 34, fill: '#ffffff', opacity: p === 'night' ? 0.2 : 0.55 }),
  ],
  volcano: () => [
    h('rect', { x: 0, y: 0, width: 320, height: 240, fill: '#2a0f12', opacity: 0.35 }),
    hills('#3a1a1a', [[0, 160], [80, 130], [140, 70], [160, 60], [180, 70], [240, 130], [320, 150]]),
    h('path', { d: 'M 150 64 L 160 60 L 170 64 L 176 120 L 144 120 Z', fill: '#ff5a1a', opacity: 0.8 }),
    h('circle', { cx: 160, cy: 64, r: 30, fill: '#ff7a2a', opacity: 0.2 }),
    ...groundBand('#3d2a2a', '#1c1010', 196, null),
    h('path', { d: 'M 40 214 q 30 -8 60 0 q 30 8 60 0', stroke: '#ff6a1a', 'stroke-width': 3, fill: 'none', opacity: 0.85, class: 'sc-lava' }),
    h('g', { class: 'sc-embers' }, ...Array.from({ length: 12 }, (_, i) => h('circle', { cx: (i * 47) % 320, cy: 230, r: 1.6, fill: '#ffb43a', style: `animation-delay:${(i % 6) * -0.8}s` }))),
  ],
  tek: () => [
    h('rect', { x: 0, y: 0, width: 320, height: 240, fill: '#081524' }),
    h('g', { opacity: 0.35 }, ...Array.from({ length: 9 }, (_, i) => h('path', { d: `M ${i * 40} 0 L ${i * 40} 180`, stroke: '#1d4a6a', 'stroke-width': 1 })), ...Array.from({ length: 5 }, (_, i) => h('path', { d: `M 0 ${i * 40} L 320 ${i * 40}`, stroke: '#1d4a6a', 'stroke-width': 1 }))),
    h('g', { class: 'sc-panel' }, h('rect', { x: 30, y: 50, width: 70, height: 44, rx: 6, fill: '#0f3350', stroke: '#35d7ff', 'stroke-width': 1.4, opacity: 0.8 }), h('path', { d: 'M 40 80 l 10 -10 l 10 6 l 12 -16 l 14 10', stroke: '#35d7ff', 'stroke-width': 2, fill: 'none' })),
    h('rect', { x: 230, y: 40, width: 60, height: 70, rx: 6, fill: '#0f3350', stroke: '#35d7ff', 'stroke-width': 1.4, opacity: 0.6 }),
    h('path', { d: 'M 0 196 L 320 196 L 320 240 L 0 240 Z', fill: '#0c2236' }),
    h('g', { opacity: 0.7 }, ...Array.from({ length: 9 }, (_, i) => h('path', { d: `M ${160 + (i - 4) * 18} 196 L ${160 + (i - 4) * 60} 240`, stroke: '#35d7ff', 'stroke-width': 1 })), h('path', { d: 'M 0 196 L 320 196 M 0 212 L 320 212', stroke: '#35d7ff', 'stroke-width': 1.2 })),
  ],
  space: () => [
    h('rect', { x: 0, y: 0, width: 320, height: 240, fill: '#05060f' }),
    h('ellipse', { cx: 90, cy: 70, rx: 120, ry: 50, fill: '#5a2a8a', opacity: 0.25 }),
    h('ellipse', { cx: 240, cy: 50, rx: 90, ry: 40, fill: '#2a5a9a', opacity: 0.25 }),
    ...stars(60, 7),
    h('circle', { cx: 262, cy: 70, r: 26, fill: '#e08a5a' }), h('ellipse', { cx: 262, cy: 70, rx: 44, ry: 8, fill: 'none', stroke: '#f0c89a', 'stroke-width': 2, opacity: 0.8 }),
    h('path', { d: 'M 0 200 Q 160 186 320 200 L 320 240 L 0 240 Z', fill: '#101a33' }),
    h('path', { d: 'M 0 200 Q 160 186 320 200', stroke: '#35d7ff', 'stroke-width': 1.6, fill: 'none', opacity: 0.8 }),
  ],
  ruins: (p) => [
    ...[[30, 60, 40], [90, 30, 50], [220, 50, 44], [276, 80, 36]].map(([x, y, w]) => h('path', { d: `M ${x} 200 L ${x} ${y} L ${x + w * 0.4} ${y + 10} L ${x + w} ${y - 6} L ${x + w} 200 Z`, fill: mix('#2c3444', SKY[p][1], 0.3) })),
    ...[[40, 90], [100, 70], [236, 90]].map(([x, y]) => h('rect', { x, y, width: 6, height: 8, fill: '#ffd36a', opacity: p === 'night' ? 0.6 : 0.2 })),
    h('g', { class: 'sc-glow' }, h('path', { d: 'M 150 196 l 8 -30 l 8 30 z M 170 196 l 5 -18 l 5 18 z', fill: '#ff4a9a' }), h('circle', { cx: 162, cy: 180, r: 26, fill: '#ff4a9a', opacity: 0.15 })),
    ...groundBand('#6a6258', '#3a342e', 196, null),
  ],
  arena: () => [
    h('rect', { x: 0, y: 0, width: 320, height: 240, fill: '#1a1024', opacity: 0.55 }),
    ...[40, 110, 210, 280].map((x) => h('g', {}, h('rect', { x: x - 10, y: 70, width: 20, height: 130, fill: '#2e2a3a' }), h('rect', { x: x - 14, y: 64, width: 28, height: 10, fill: '#3e3a4e' }))),
    h('circle', { cx: 160, cy: 110, r: 60, fill: '#ffcf6a', opacity: 0.12 }),
    ...groundBand('#4a4058', '#221c2c', 196, null),
    h('ellipse', { cx: 160, cy: 214, rx: 110, ry: 12, fill: 'none', stroke: '#ffcf6a', 'stroke-width': 1.6, opacity: 0.7 }),
  ],
};

/**
 * Hintergrund des Bildschirms.
 * @param {string} biome  Kulisse der Art
 * @param {string} phase  dawn | day | dusk | night
 */
export function sceneArt(biome, phase) {
  const draw = BIOMES[biome] || BIOMES.jungle;
  const night = phase === 'night';
  const sky = SKY[phase];
  const own = ['cave', 'ocean', 'tek', 'space'].includes(biome);
  const skyId = 'sc-sky' + uid++;
  waterId = 'sc-water' + uid++;
  const water = waterId;
  const art = draw(phase, night);
  return h('svg', { viewBox: '0 0 320 240', preserveAspectRatio: 'xMidYMax slice', class: `scene biome-${biome} phase-${phase}`, 'aria-hidden': 'true' },
    h('defs', {},
      h('linearGradient', { id: skyId, x1: 0, y1: 0, x2: 0, y2: 1 }, h('stop', { offset: 0, 'stop-color': sky[0] }), h('stop', { offset: 0.6, 'stop-color': sky[1] }), h('stop', { offset: 1, 'stop-color': sky[2] })),
      h('linearGradient', { id: water, x1: 0, y1: 0, x2: 0, y2: 1 }, h('stop', { offset: 0, 'stop-color': night ? '#0a2a4a' : '#3ab0e0' }), h('stop', { offset: 1, 'stop-color': night ? '#031428' : '#0a4a7a' }))),
    own ? null : h('rect', { x: 0, y: 0, width: 320, height: 240, fill: `url(#${skyId})` }),
    own ? null : sun(phase),
    !own && night ? h('g', {}, stars(40, 3)) : null,
    !own && phase !== 'night' ? clouds('#ffffff', phase === 'day' ? 0.7 : 0.35, 34) : null,
    art,
    night && !['space', 'cave'].includes(biome) ? h('rect', { x: 0, y: 0, width: 320, height: 240, fill: '#0a1030', opacity: 0.35 }) : null);
}

/* -------------------------------------------------------------------------- */
/* Requisiten                                                                     */
/* -------------------------------------------------------------------------- */

export function poopArt() {
  return h('svg', { viewBox: '0 0 40 40', class: 'prop-poop', 'aria-hidden': 'true' },
    h('path', { class: 'poop-stink', d: 'M 12 10 q -4 -4 0 -8 M 20 8 q -4 -4 0 -8 M 28 10 q -4 -4 0 -8', stroke: '#9fdc6a', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }),
    h('path', { d: 'M 6 34 Q 4 26 12 25 Q 10 18 18 17 Q 18 11 22 12 Q 30 14 27 20 Q 34 21 32 27 Q 38 30 34 35 Z', fill: '#8a5a32', stroke: '#4a2a14', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }),
    h('path', { d: 'M 12 27 q 8 3 16 -1 M 16 20 q 5 2 9 -1', stroke: '#b07a4a', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }),
    h('ellipse', { cx: 15, cy: 22, rx: 3, ry: 1.6, fill: '#ffffff', opacity: 0.35 }));
}

const FOOD = {
  meat: (s) => [h('path', { d: 'M 8 26 Q 4 12 18 8 Q 32 6 32 20 Q 30 30 18 30 Z', fill: '#d9544a', stroke: '#6a1a1a', 'stroke-width': 1.8 }), h('path', { d: 'M 13 22 q 5 -8 14 -8', stroke: '#f08a7a', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }), h('path', { d: 'M 28 26 l 7 7 m -2 -8 a 2.5 2.5 0 1 0 4 3 m -6 4 a 2.5 2.5 0 1 0 3 4', stroke: '#f4ecd8', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }), s],
  berries: (s) => [h('path', { d: 'M 20 8 q 2 -6 8 -6', stroke: '#3a7a2a', 'stroke-width': 2, fill: 'none' }), h('ellipse', { cx: 24, cy: 6, rx: 5, ry: 2.4, fill: '#5aa03a', transform: 'rotate(-20 24 6)' }), ...[[14, 20], [26, 20], [20, 30], [10, 30], [30, 30]].map(([x, y]) => h('circle', { cx: x, cy: y, r: 6, fill: '#4a5adf', stroke: '#1a2060', 'stroke-width': 1.4 })), h('circle', { cx: 12, cy: 18, r: 1.6, fill: '#fff', opacity: 0.7 }), s],
  mixed: (s) => [h('g', { transform: 'translate(-4 6) scale(0.8)' }, FOOD.berries(null)), h('g', { transform: 'translate(12 -2) scale(0.72)' }, FOOD.meat(null)), s],
  fish: (s) => [h('path', { d: 'M 4 20 Q 16 6 30 20 Q 16 34 4 20 Z', fill: '#7ab0d8', stroke: '#2a4a6a', 'stroke-width': 1.8 }), h('path', { d: 'M 30 20 L 38 12 L 38 28 Z', fill: '#5a90b8', stroke: '#2a4a6a', 'stroke-width': 1.6 }), h('circle', { cx: 11, cy: 18, r: 1.8, fill: '#1a2a3a' }), s],
  element: (s) => [h('path', { d: 'M 20 2 L 32 18 L 20 38 L 8 18 Z', fill: '#ff4a9a', stroke: '#6a0a3a', 'stroke-width': 1.8 }), h('path', { d: 'M 20 2 L 20 38 M 8 18 L 32 18', stroke: '#ffb0d8', 'stroke-width': 1.2 }), s],
  blood: (s) => [h('rect', { x: 10, y: 6, width: 20, height: 28, rx: 5, fill: '#c81e2e', stroke: '#5a0a12', 'stroke-width': 1.8 }), h('rect', { x: 14, y: 2, width: 12, height: 6, rx: 2, fill: '#e8e0d8', stroke: '#5a0a12', 'stroke-width': 1.2 }), h('path', { d: 'M 16 18 h 8 m -4 -4 v 8', stroke: '#ffffff', 'stroke-width': 2.4, 'stroke-linecap': 'round' }), s],
  mineral: (s) => [h('path', { d: 'M 6 30 L 12 12 L 24 8 L 34 18 L 30 32 Z', fill: '#e8d05a', stroke: '#6a5a10', 'stroke-width': 1.8 }), h('path', { d: 'M 12 12 L 20 20 L 34 18 M 20 20 L 18 31', stroke: '#fff4a8', 'stroke-width': 1.2, fill: 'none' }), s],
  dung: () => poopArt().children,
  kibble: (s) => [h('path', { d: 'M 8 14 Q 20 4 32 14 L 30 30 Q 20 36 10 30 Z', fill: '#d8b070', stroke: '#6a4a1a', 'stroke-width': 1.8 }), h('path', { d: 'M 8 14 Q 20 22 32 14', stroke: '#6a4a1a', 'stroke-width': 1.4, fill: 'none' }), ...[[15, 24], [22, 26], [27, 21]].map(([x, y]) => h('circle', { cx: x, cy: y, r: 2, fill: '#a07030' })), s],
  medicine: (s) => [h('path', { d: 'M 15 4 h 10 v 8 l 7 14 q 2 8 -6 10 h -12 q -8 -2 -6 -10 l 7 -14 z', fill: '#e8f4ff', stroke: '#2a4a6a', 'stroke-width': 1.8, opacity: 0.95 }), h('path', { d: 'M 10 24 q 10 -4 20 0 l 2 4 q 0 6 -6 7 h -12 q -6 -1 -6 -7 z', fill: '#ff5a6a' }), h('path', { d: 'M 17 8 h 6', stroke: '#2a4a6a', 'stroke-width': 1.6 }), s],
};

export const DIET_FOOD = { carn: 'meat', herb: 'berries', omni: 'mixed', pisc: 'fish', elem: 'element', blood: 'blood', min: 'mineral', dung: 'dung' };

export function foodArt(kind) {
  const draw = FOOD[kind] || FOOD.meat;
  return h('svg', { viewBox: '0 0 40 40', class: `prop-food food-${kind}`, 'aria-hidden': 'true' }, draw(h('ellipse', { cx: 14, cy: 14, rx: 4, ry: 2, fill: '#ffffff', opacity: 0.35 })));
}

/** Ei, Embryo-Kapsel, Tek-Kern oder Beschwörungsrelikt – je nach Geburtsart. */
export function eggArt(sp, { cracks = 0 } = {}) {
  const [body, belly, accent] = sp.colors;
  const id = 'egg' + uid++;
  const line = dark(mix(body, '#24123a', 0.3), 0.55);
  const glow = sp.rarity === 'legendary' ? '#ffcf5a' : sp.rarity === 'epic' ? '#c77dff' : sp.rarity === 'rare' ? '#5ad1ff' : null;
  const crackPaths = ['M 44 60 l 8 8 l -6 8 l 8 6', 'M 58 44 l -6 8 l 8 6 l -4 8', 'M 36 74 l 8 -4 l 4 8 l 8 -6'].slice(0, cracks);
  const halo = glow ? h('circle', { class: 'egg-halo', cx: 50, cy: 60, r: 46, fill: glow, opacity: 0.18 }) : null;
  if (sp.birth === 'embryo') {
    return h('svg', { viewBox: '0 0 100 110', class: 'prop-egg birth-embryo', 'aria-hidden': 'true' },
      h('defs', {}, h('radialGradient', { id, cx: 0.4, cy: 0.35, r: 0.7 }, h('stop', { offset: 0, 'stop-color': '#f4fbff' }), h('stop', { offset: 0.6, 'stop-color': light(accent, 0.55) }), h('stop', { offset: 1, 'stop-color': light(accent, 0.1) }))),
      halo,
      h('rect', { x: 22, y: 12, width: 56, height: 82, rx: 28, fill: `url(#${id})`, stroke: '#3a4a5a', 'stroke-width': 3 }),
      h('path', { d: 'M 50 40 q -14 4 -10 20 q 4 12 14 8 q 8 -4 4 -14 q -3 -8 -10 -6', fill: light(body, 0.2), stroke: line, 'stroke-width': 2, opacity: 0.85, class: 'egg-embryo' }),
      h('rect', { x: 18, y: 88, width: 64, height: 14, rx: 6, fill: '#46525e', stroke: '#1e2a36', 'stroke-width': 2 }),
      h('rect', { x: 30, y: 93, width: 40, height: 4, rx: 2, fill: '#5ff2ff' }),
      h('ellipse', { cx: 38, cy: 30, rx: 7, ry: 12, fill: '#ffffff', opacity: 0.45 }));
  }
  if (sp.birth === 'tek') {
    return h('svg', { viewBox: '0 0 100 110', class: 'prop-egg birth-tek', 'aria-hidden': 'true' },
      h('circle', { cx: 50, cy: 58, r: 44, fill: '#35d7ff', opacity: 0.14 }),
      h('path', { d: 'M 50 14 L 84 34 L 84 76 L 50 96 L 16 76 L 16 34 Z', fill: '#26313d', stroke: '#9fe9ff', 'stroke-width': 3 }),
      h('path', { d: 'M 50 14 L 50 55 L 84 76 M 50 55 L 16 76', stroke: '#35d7ff', 'stroke-width': 2, fill: 'none', opacity: 0.8 }),
      h('circle', { class: 'egg-core', cx: 50, cy: 55, r: 9, fill: '#5ff2ff' }));
  }
  if (sp.birth === 'relic') {
    return h('svg', { viewBox: '0 0 100 110', class: 'prop-egg birth-relic', 'aria-hidden': 'true' },
      h('circle', { class: 'egg-halo', cx: 50, cy: 56, r: 46, fill: accent, opacity: 0.2 }),
      h('path', { d: 'M 50 8 L 72 40 L 62 96 L 38 96 L 28 40 Z', fill: dark(body, 0.35), stroke: line, 'stroke-width': 3 }),
      h('path', { d: 'M 50 8 L 50 96 M 28 40 L 72 40', stroke: light(accent, 0.2), 'stroke-width': 1.6, opacity: 0.7 }),
      h('path', { class: 'egg-core', d: 'M 44 54 l 6 -10 l 6 10 l -6 10 z', fill: accent }),
      h('ellipse', { cx: 50, cy: 100, rx: 30, ry: 6, fill: '#000', opacity: 0.25 }));
  }
  const spots = [[36, 46, 6], [60, 38, 4.5], [62, 66, 7], [40, 78, 5], [52, 56, 3.5]];
  return h('svg', { viewBox: '0 0 100 110', class: 'prop-egg birth-egg', 'aria-hidden': 'true' },
    h('defs', {}, h('radialGradient', { id, cx: 0.38, cy: 0.3, r: 0.75 }, h('stop', { offset: 0, 'stop-color': light(belly, 0.45) }), h('stop', { offset: 0.65, 'stop-color': belly }), h('stop', { offset: 1, 'stop-color': dark(belly, 0.28) }))),
    halo,
    h('ellipse', { cx: 50, cy: 100, rx: 28, ry: 5, fill: '#000', opacity: 0.22 }),
    h('path', { d: 'M 50 10 C 76 10 88 50 88 66 C 88 88 72 100 50 100 C 28 100 12 88 12 66 C 12 50 24 10 50 10 Z', fill: `url(#${id})`, stroke: line, 'stroke-width': 3 }),
    ...spots.map(([x, y, r]) => h('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.8, fill: accent, opacity: 0.85 })),
    ...crackPaths.map((d) => h('path', { d, stroke: line, 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
    h('ellipse', { cx: 36, cy: 30, rx: 8, ry: 13, fill: '#ffffff', opacity: 0.4, transform: 'rotate(-20 36 30)' }));
}

export function cryoArt() {
  return h('svg', { viewBox: '0 0 120 160', class: 'prop-cryo', 'aria-hidden': 'true' },
    h('rect', { x: 14, y: 8, width: 92, height: 140, rx: 40, fill: '#bfefff', opacity: 0.35, stroke: '#9fe9ff', 'stroke-width': 3 }),
    h('rect', { x: 10, y: 130, width: 100, height: 22, rx: 8, fill: '#46525e', stroke: '#1e2a36', 'stroke-width': 2 }),
    h('rect', { x: 10, y: 4, width: 100, height: 18, rx: 8, fill: '#46525e', stroke: '#1e2a36', 'stroke-width': 2 }),
    h('rect', { x: 34, y: 137, width: 52, height: 6, rx: 3, fill: '#5ff2ff', class: 'cryo-light' }),
    ...[[30, 40], [86, 70], [40, 104], [80, 30]].map(([x, y]) => h('path', { d: `M ${x} ${y - 6} v 12 M ${x - 6} ${y} h 12 M ${x - 4} ${y - 4} l 8 8 M ${x + 4} ${y - 4} l -8 8`, stroke: '#ffffff', 'stroke-width': 1.4, opacity: 0.8 })),
    h('ellipse', { cx: 36, cy: 40, rx: 6, ry: 22, fill: '#ffffff', opacity: 0.35 }));
}

export function graveArt(name) {
  return h('svg', { viewBox: '0 0 140 150', class: 'prop-grave', 'aria-hidden': 'true' },
    h('ellipse', { cx: 70, cy: 140, rx: 56, ry: 8, fill: '#000', opacity: 0.25 }),
    h('path', { d: 'M 30 140 L 30 60 Q 30 24 70 24 Q 110 24 110 60 L 110 140 Z', fill: '#8a93a0', stroke: '#3a4150', 'stroke-width': 3 }),
    h('path', { d: 'M 70 44 v 30 M 58 56 h 24', stroke: '#3a4150', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    h('text', { x: 70, y: 104, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#2a3140', 'font-family': 'system-ui, sans-serif' }, String(name || '').slice(0, 12)),
    h('path', { d: 'M 24 140 q 10 -10 20 0 q 10 -8 20 0 q 12 -10 24 0 q 10 -8 22 0', fill: '#4f8c3a' }),
    h('g', { class: 'grave-ghost' },
      h('path', { d: 'M 100 30 q 0 -18 16 -18 q 16 0 16 18 l 0 18 l -5 -4 l -5 4 l -6 -4 l -5 4 l -5 -4 l -6 4 z', fill: '#ffffff', opacity: 0.92, stroke: '#9fb0c8', 'stroke-width': 1.6 }),
      h('circle', { cx: 111, cy: 26, r: 2.2, fill: '#2a3140' }), h('circle', { cx: 121, cy: 26, r: 2.2, fill: '#2a3140' }),
      h('ellipse', { cx: 116, cy: 4, rx: 10, ry: 3, fill: 'none', stroke: '#ffd35a', 'stroke-width': 2 })));
}

/* -------------------------------------------------------------------------- */
/* Symbole (Bedienfeld, Anfragen, Protokoll)                                      */
/* -------------------------------------------------------------------------- */

const I = {
  feed: ['M6 14c-2-4 1-9 6-9s8 4 6 8-7 6-10 4', 'M14 15l5 5', 'M18.5 17.5c1-1 3 0 2 2s-2 1-2 1', 'M17 21c-1 1 0 3 2 2'],
  lights: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 1 4 10.5c-.7.7-1 1.5-1 2.5H9c0-1-.3-1.8-1-2.5A6 6 0 0 1 12 3z'],
  play: ['M12 3a9 9 0 1 0 0.01 0z', 'M3.5 9.5c3 1 6 1 9-1s5.5-3 8-2', 'M4 15c3-1 6-.5 8 1.5s5 3 8 2'],
  medicine: ['M9 3h6', 'M10 3v5L5.5 17a3 3 0 0 0 2.7 4h7.6a3 3 0 0 0 2.7-4L14 8V3', 'M7.5 14h9'],
  clean: ['M4 20h16', 'M6 20c0-4 2-7 6-7s6 3 6 7', 'M12 13V4', 'M9 4h6', 'M8 16h.01M12 17h.01M16 16h.01'],
  status: ['M3 12h4l2-5 3 10 2-6 2 3h5', 'M4 20h16'],
  discipline: ['M4 14h9a4 4 0 0 0 0-8H9', 'M4 14l3-5', 'M9 6l1.5-3', 'M13 10h.01', 'M17 18l3 2', 'M16 14l4-1'],
  attention: ['M12 4v10', 'M12 19h.01', 'M4.5 20h15L12 3z'],
  cuddle: ['M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', 'M8.5 11.5c1 1 2 1.5 3.5 1.5'],
  walk: ['M8 7.5a1.6 2 0 1 0 0.01 0z', 'M12.5 5.5a1.6 2 0 1 0 0.01 0z', 'M17 7.5a1.6 2 0 1 0 0.01 0z', 'M5 11.5a1.5 1.8 0 1 0 0.01 0z', 'M12 11c-3 0-6 3.5-6 6.5 0 2 1.5 3 3 3s2-1 3-1 1.5 1 3 1 3-1 3-3c0-3-3-6.5-6-6.5z'],
  cryo: ['M12 2v20', 'M4 7l16 10', 'M20 7L4 17', 'M9 3.5l3 2.5 3-2.5', 'M9 20.5l3-2.5 3 2.5'],
  meal: ['M6 14c-2-4 1-9 6-9s8 4 6 8-7 6-10 4', 'M14 15l5 5'],
  snack: ['M5 10c3-5 11-5 14 0l-1 8c-4 3-8 3-12 0z', 'M5 10c4 3 10 3 14 0'],
  heart: ['M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'],
  sound: ['M4 9v6h4l5 4V5L8 9z', 'M16 9a4 4 0 0 1 0 6', 'M18.5 6.5a8 8 0 0 1 0 11'],
  mute: ['M4 9v6h4l5 4V5L8 9z', 'M17 9l5 6M22 9l-5 6'],
  gear: ['M12 9a3 3 0 1 0 0.01 0z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  info: ['M12 3a9 9 0 1 0 0.01 0z', 'M12 11v6', 'M12 7.5h.01'],
  egg: ['M12 3c4 0 7 6 7 10.5A7 7 0 0 1 5 13.5C5 9 8 3 12 3z'],
  retro: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  star: ['M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z'],
  skull: ['M12 3a7 7 0 0 0-7 7c0 2.5 1.3 4 3 5v3h8v-3c1.7-1 3-2.5 3-5a7 7 0 0 0-7-7z', 'M9.5 11h.01M14.5 11h.01', 'M10 18v3M14 18v3'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  leaf: ['M5 19c0-8 5-14 15-15-1 10-7 15-15 15z', 'M5 19l7-7'],
  swap: ['M4 8h13l-3-3', 'M20 16H7l3 3'],
};

export function icon(name, cls = '') {
  const paths = I[name] || I.info;
  return h('svg', { viewBox: '0 0 24 24', class: 'ti' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    paths.map((d) => h('path', { d })));
}
