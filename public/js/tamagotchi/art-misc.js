/**
 * Körperbaupläne für Insekten, Spinnentiere, Weichtiere, Tek-Roboter und
 * Sonderformen (Gasbags, Gacha, Oasisaur, Wüstentitan).
 */
import { h } from './vdom.js';
import { E, C, P, T, pt, r1, light, dark, mix, pivot } from './art-kit.js';
import { around } from './art-land.js';

const headGroup = (jx, jy, s, parts) => {
  const t = around(jx, jy, s);
  return { node: pivot('c-head', jx, jy, t.attr, parts), map: t.map };
};

/** Frontales Gesicht mit zwei Augen (für runde Wesen). */
function frontFace(K, pal, x, y, eyeR, gap, { mouthW = 8, teeth = false, glow = pal.eyeGlow, skin = pal.body } = {}) {
  const line = pal.line;
  return [
    K.eye(x - gap, y, eyeR, { iris: pal.eye, skin, line, glow, front: true }),
    K.eye(x + gap, y, eyeR, { iris: pal.eye, skin, line, glow, front: true }),
    K.blush(x - gap - eyeR * 0.4, y + eyeR * 1.5, eyeR * 0.55),
    K.blush(x + gap + eyeR * 0.4, y + eyeR * 1.5, eyeR * 0.55),
    K.mouth(`M ${pt(x - mouthW * 0.5, y + eyeR * 1.35)} Q ${pt(x, y + eyeR * 1.35 + mouthW * 0.45)} ${pt(x + mouthW * 0.5, y + eyeR * 1.35)}`,
      { open: [x, y + eyeR * 1.6, mouthW * 0.5, mouthW * 0.35], line, teeth: teeth ? [[x - 3, y + eyeR * 1.4, 2.6], [x + 3, y + eyeR * 1.4, 2.6]] : [] }),
  ];
}

/* -------------------------------------------------------------------------- */
/* Insekten                                                                      */
/* -------------------------------------------------------------------------- */

export function bug(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const parts = [];
  if (f.has('millipede')) return millipede(ctx);
  const flying = f.has('bee') || f.has('dragonfly') || f.has('moth') || f.has('firefly') || f.has('rhynio');
  const bx = 96, by = flying ? 112 : 142;
  const abdomen = f.has('jug') ? [bx - 26, by - 6, 32, 30] : f.has('dragonfly') ? [bx - 40, by + 4, 44, 8] : f.has('ant') ? [bx - 30, by, 24, 17] : f.has('beetle') ? [bx - 18, by, 32, 22] : [bx - 26, by, 28, 19];
  const bodyFill = K.vol(pal.body, bx - 10, by - 16, 60);
  const legCol = dark(pal.body, 0.25);
  // Flügel hinten
  const wing = (far) => {
    const x = bx - 6, y = by - 12;
    const col = f.has('moth') ? pal.body : '#dff6ff';
    const op = f.has('moth') ? 1 : 0.55;
    const shape = f.has('dragonfly') ? E(x - 22, y - 16, 34, 7, 12) : f.has('moth') ? E(x - 12, y - 24, 30, 24, 20) : E(x - 10, y - 22, 22, 12, 30);
    const g = pivot('c-wing' + (far ? ' far' : ''), x, y, far ? `rotate(-18 ${r1(x)} ${r1(y)})` : null,
      K.solid(shape, col, dark(col === '#dff6ff' ? '#6aa8c8' : col, 0.45), 1.5, { opacity: op }),
      f.has('moth') ? h('circle', { cx: r1(x - 14), cy: r1(y - 26), r: 6, fill: pal.accent, stroke: line, 'stroke-width': 1.2 }) : null,
      f.has('dragonfly') ? K.solid(E(x - 20, y - 4, 30, 6, -8), col, '#6aa8c8', 1.3, { opacity: op }) : null);
    return g;
  };
  if (flying) parts.push(wing(true));
  // Beine
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const x = bx - 4 + i * 11, y = by + 8;
    legs.push(h('path', { class: 'c-leg l' + (i + 1), d: `M ${pt(x, y)} q ${r1(-6 + i * 4)} 10 ${r1(-10 + i * 8)} ${flying ? 14 : r1(178 - y)}`, stroke: legCol, 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  parts.push(...legs);
  // Hinterleib, Brust
  const [ax, ay, arx, ary] = abdomen;
  const abFill = f.has('jug') ? K.vol('#7fd6ff', ax - 8, ay - 12, 44) : K.vol(f.has('bee') ? pal.body : f.has('firefly') ? pal.belly : pal.body, ax - 6, ay - 8, arx * 1.8);
  parts.push(K.blob('c-torso', [E(ax, ay, arx, ary, flying ? -10 : -4), E(bx + 8, by - 2, 16, 13)], abFill, line));
  if (f.has('bee')) for (let i = 0; i < 3; i++) parts.push(h('path', { d: `M ${pt(ax - 16 + i * 11, ay - ary * 0.85)} q 4 ${r1(ary * 0.9)} 0 ${r1(ary * 1.7)}`, stroke: pal.accent, 'stroke-width': 5, fill: 'none', opacity: 0.9 }));
  if (f.has('bee')) parts.push(K.solid(P(`M ${pt(ax - arx + 2, ay)} l -9 2 l 8 3 z`), '#2a2a2a', line, 1));
  if (f.has('firefly')) parts.push(K.glow(pal.glow, ax - 4, ay, 34, 0.95), h('ellipse', { class: 'c-glowdot', cx: r1(ax - 6), cy: r1(ay + 2), rx: r1(arx * 0.6), ry: r1(ary * 0.6), fill: light(pal.glow, 0.4) }));
  if (f.has('jug')) parts.push(K.sheen(ax - 10, ay - 14, 12, 6, -30, 0.6), h('path', { d: `M ${pt(ax - arx + 8, ay + 8)} q ${r1(arx)} 10 ${r1(arx * 2 - 14)} 0`, stroke: '#3aa0e0', 'stroke-width': 2, fill: 'none', opacity: 0.7 }));
  if (f.has('beetle')) {
    parts.push(K.solid(P(`M ${pt(ax - arx - 2, ay + 4)} C ${pt(ax - arx, ay - ary * 1.6)} ${pt(ax + arx + 14, ay - ary * 1.6)} ${pt(ax + arx + 16, ay + 4)} Z`), K.vol(pal.accent, ax, ay - ary, arx * 1.6), line, 2));
    parts.push(h('path', { d: `M ${pt(ax + 8, ay - ary * 1.18)} L ${pt(ax + 8, ay + 3)}`, stroke: line, 'stroke-width': 1.6 }), K.sheen(ax - 6, ay - ary * 0.9, 14, 5, -15, 0.5));
  }
  if (f.has('ant')) parts.push(K.sheen(ax - 6, ay - ary * 0.5, 10, 4));
  if (f.has('mantis')) {
    parts.push(K.blob('c-arm', [T(`M ${pt(bx + 16, by - 8)} L ${pt(bx + 30, by - 26)} L ${pt(bx + 34, by - 2)}`, 6)], bodyFill, line));
    for (let i = 0; i < 3; i++) parts.push(h('path', { d: `M ${pt(bx + 31, by - 20 + i * 6)} l 4 1`, stroke: line, 'stroke-width': 1.4 }));
  }
  if (flying) parts.push(wing(false));
  // Kopf
  const H = form.head;
  const jx = bx + 20, jy = by - (f.has('mantis') ? 18 : 6);
  const hr = f.has('mantis') ? 13 : f.has('ant') ? 14 : 15;
  const hx = jx + 10, hy = jy - 6;
  const skin = K.vol(pal.body, hx - 4, hy - 6, hr * 2.4);
  const headParts = [];
  for (const dx of [-3, 3]) headParts.push(h('path', { d: f.has('moth') ? `M ${pt(hx + dx, hy - hr * 0.8)} q ${r1(dx * 2)} -18 ${r1(dx * 5 + 8)} -22 m -4 6 l -4 -2 m 4 6 l -5 -1` : `M ${pt(hx + dx, hy - hr * 0.8)} q ${r1(dx * 2 + 6)} -16 ${r1(dx * 4 + 14)} -18`, stroke: line, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }));
  headParts.push(K.blob('c-skull', [f.has('mantis') ? P(`M ${pt(hx - hr, hy - hr * 0.6)} L ${pt(hx + hr, hy - hr * 0.6)} L ${pt(hx, hy + hr)} Z`) : C(hx, hy, hr)], skin, line));
  if (f.has('ant') || f.has('rhynio') || f.has('beetle')) headParts.push(K.solid(P(`M ${pt(hx + hr * 0.7, hy + hr * 0.3)} q 12 2 12 12 q -6 -4 -12 -4 z`), dark(pal.accent, 0.1), line, 1.2));
  headParts.push(K.sheen(hx - hr * 0.3, hy - hr * 0.5, hr * 0.35, hr * 0.18));
  headParts.push(K.eye(hx + hr * 0.2, hy - hr * 0.12, hr * (f.has('dragonfly') ? 0.55 : 0.42), { iris: f.has('dragonfly') ? pal.accent : pal.eye, skin: pal.body, line }));
  headParts.push(K.blush(hx + hr * 0.55, hy + hr * 0.45, hr * 0.22));
  headParts.push(K.mouth(`M ${pt(hx + hr * 0.3, hy + hr * 0.55)} q 3 2 6 0`, { open: [hx + hr * 0.5, hy + hr * 0.55, 4, 3], line }));
  const hg = headGroup(jx, jy, H, headParts);
  parts.push(hg.node);
  return { parts, anchors: { floating: flying, head: hg.map(hx, hy - hr - 12), eye: hg.map(hx + hr * 0.2, hy), mouth: hg.map(hx + hr * 0.5, hy + hr * 0.55), neck: [bx + 14, by - 8], body: [bx, by], top: hg.map(hx, hy - hr - 20)[1] } };
}

function millipede(ctx) {
  const { K, pal, form } = ctx;
  const line = pal.line;
  const parts = [];
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const x = 24 + i * 16, y = 166 - Math.sin(i / (segs - 1) * Math.PI) * 10;
    parts.push(h('path', { class: 'c-leg', d: `M ${pt(x - 2, y + 6)} l -4 14 M ${pt(x + 4, y + 6)} l 3 14`, stroke: pal.extra, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
  }
  const shapes = [];
  for (let i = 0; i < segs; i++) shapes.push(E(24 + i * 16, 166 - Math.sin(i / (segs - 1) * Math.PI) * 10, 11, 12));
  parts.push(K.blob('c-torso', shapes, K.vol(pal.body, 90, 150, 90), line));
  for (let i = 0; i < segs; i++) parts.push(h('path', { d: `M ${pt(18 + i * 16, 160 - Math.sin(i / (segs - 1) * Math.PI) * 10)} q 6 -4 12 0`, stroke: pal.accent, 'stroke-width': 2.4, fill: 'none', opacity: 0.8 }));
  const jx = 152, jy = 158, hx = 164, hy = 150;
  const hd = [
    h('path', { d: `M ${pt(hx - 2, hy - 12)} q 4 -18 18 -18 M ${pt(hx + 4, hy - 12)} q 8 -12 20 -8`, stroke: line, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }),
    K.blob('c-skull', [C(hx, hy, 15)], K.vol(pal.body, hx - 4, hy - 6, 34), line),
    K.eye(hx + 4, hy - 3, 5.6, { iris: pal.eye, skin: pal.body, line }),
    K.blush(hx + 9, hy + 6, 3.4),
    K.mouth(`M ${pt(hx + 5, hy + 8)} q 3 2 6 0`, { open: [hx + 8, hy + 8, 4, 3], line }),
  ];
  const hg = headGroup(jx, jy, form.head, hd);
  parts.push(hg.node);
  return { parts, anchors: { head: hg.map(hx, hy - 15), eye: hg.map(hx + 4, hy - 3), mouth: hg.map(hx + 8, hy + 8), neck: [150, 160], body: [90, 160], top: 120 } };
}

/* -------------------------------------------------------------------------- */
/* Spinnentiere                                                                  */
/* -------------------------------------------------------------------------- */

export function spider(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  if (f.has('scorpion') || f.has('seascorp')) return scorpion(ctx);
  if (f.has('crab')) return crab(ctx);
  const parts = [];
  const long = f.has('longlegs');
  const boss = f.has('boss');
  const jumping = f.has('jumping');
  const bx = 100, by = long ? 112 : jumping ? 136 : 128;
  const bodyFill = K.vol(pal.body, bx - 10, by - 20, 70);
  const legW = long ? 4.5 : jumping ? 7 : 6;
  const legCol = dark(pal.body, 0.15);
  // Beine: vier pro Seite, hintere Seite dunkler
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x0 = bx + dir * 8, y0 = by + 4 - i * 3;
      const kx = bx + dir * (30 + i * 10 + (long ? 16 : 0)), ky = by - (long ? 40 : 20) - i * 4;
      const fx = bx + dir * (38 + i * 16 + (long ? 22 : 0)), fy = 180;
      parts.push(K.blob('c-leg', [T(`M ${pt(x0, y0)} L ${pt(kx, ky)} L ${pt(fx, fy)}`, legW)], K.vol(i % 2 ? legCol : pal.body, kx, ky, 40), line));
    }
  }
  // Hinterleib
  const abR = boss ? 38 : jumping ? 26 : 30;
  parts.push(K.blob('c-torso', [E(bx - 4, by - abR * 0.55, abR * 1.05, abR)], K.vol(pal.body, bx - 14, by - abR * 1.2, abR * 2.2), line));
  if (!jumping) parts.push(h('path', { d: `M ${pt(bx - 16, by - abR * 1.1)} l 12 10 l 12 -10 M ${pt(bx - 14, by - abR * 0.55)} l 10 8 l 10 -8`, stroke: pal.accent, 'stroke-width': 3.4, fill: 'none', 'stroke-linecap': 'round', opacity: 0.9 }));
  if (boss) for (let i = 0; i < 5; i++) parts.push(K.solid(P(`M ${pt(bx - 30 + i * 13, by - abR * 1.35 + Math.abs(i - 2) * 6)} l 4 -12 l 4 12 z`), pal.accent, line, 1.1));
  if (jumping || f.has('fuzzy')) for (let i = 0; i < 8; i++) {
    const a = (200 + i * 20) * Math.PI / 180;
    parts.push(h('path', { d: `M ${pt(bx - 4 + Math.cos(a) * abR, by - abR * 0.55 + Math.sin(a) * abR)} l ${r1(Math.cos(a) * 5)} ${r1(Math.sin(a) * 5)}`, stroke: line, 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
  }
  parts.push(K.sheen(bx - 16, by - abR * 1.15, abR * 0.35, abR * 0.16));
  // Kopfbrust mit Gesicht
  const H = form.head;
  const jx = bx, jy = by + 2;
  const hr = jumping ? 22 : 19;
  const hx = bx + 2, hy = by + 6;
  const headParts = [
    K.blob('c-skull', [E(hx, hy, hr * 1.1, hr)], K.vol(light(pal.body, 0.05), hx - 6, hy - 8, hr * 2.4), line),
    K.sheen(hx - hr * 0.35, hy - hr * 0.5, hr * 0.35, hr * 0.16),
  ];
  if (!jumping) for (const [dx, dy] of [[-8, -12], [8, -12], [-14, -6], [14, -6]]) headParts.push(h('circle', { cx: r1(hx + dx), cy: r1(hy + dy), r: 2, fill: pal.eyeGlow || '#1c1420' }));
  headParts.push(...frontFace(K, pal, hx, hy - 1, jumping ? hr * 0.36 : hr * 0.28, jumping ? hr * 0.42 : hr * 0.38, { mouthW: 7, skin: light(pal.body, 0.05) }));
  headParts.push(K.solid(P(`M ${pt(hx - 6, hy + hr * 0.75)} q -2 8 2 10 q 0 -5 2 -9 z`), dark(pal.accent, 0.2), line, 1), K.solid(P(`M ${pt(hx + 6, hy + hr * 0.75)} q 2 8 -2 10 q 0 -5 -2 -9 z`), dark(pal.accent, 0.2), line, 1));
  const hg = headGroup(jx, jy, H, headParts);
  parts.push(hg.node);
  return { parts, anchors: { head: hg.map(hx, hy - hr), eye: hg.map(hx + hr * 0.38, hy), mouth: hg.map(hx, hy + hr * 0.5), neck: [bx, by - 6], body: [bx, by - 10], top: by - abR * 1.6 } };
}

function scorpion(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const parts = [];
  const sea = f.has('seascorp');
  const bx = 92, by = 152;
  const bodyFill = K.vol(pal.body, bx - 10, by - 12, 60);
  for (let i = 0; i < 4; i++) parts.push(h('path', { class: 'c-leg', d: `M ${pt(bx - 10 + i * 12, by + 6)} q -4 10 -10 ${r1(178 - by - 2)}`, stroke: dark(pal.body, 0.25), 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round' }));
  // Schwanz
  const tail = sea ? `M ${pt(bx - 30, by)} L ${pt(bx - 70, by + 6)}` : `M ${pt(bx - 30, by - 4)} C ${pt(bx - 70, by - 10)} ${pt(bx - 70, by - 70)} ${pt(bx - 20, by - 76)}`;
  parts.push(h('g', { class: 'c-tail', style: `transform-origin:${r1(bx - 30)}px ${r1(by)}px` },
    K.blob(null, [T(tail, sea ? 10 : 12)], bodyFill, line),
    sea ? K.solid(P(`M ${pt(bx - 70, by + 6)} l -16 -4 l 14 10 z`), pal.accent, line, 1.2)
      : h('g', {}, K.glow(pal.glow || pal.accent, bx - 14, by - 78, 14, 0.8), K.solid(P(`M ${pt(bx - 24, by - 80)} q 16 -8 18 6 q -8 -2 -12 6 z`), pal.accent, line, 1.3))));
  if (!sea) for (let i = 0; i < 4; i++) { const t = i / 4; parts.push(h('path', { d: `M ${pt(bx - 50 - Math.sin(t * Math.PI) * 14, by - 12 - t * 56)} l 10 2`, stroke: dark(pal.body, 0.3), 'stroke-width': 1.4 })); }
  parts.push(K.blob('c-torso', [E(bx, by, 36, 16)], bodyFill, line));
  for (let i = 0; i < 4; i++) parts.push(h('path', { d: `M ${pt(bx - 22 + i * 12, by - 14)} q 2 12 0 26`, stroke: dark(pal.body, 0.3), 'stroke-width': 1.4, fill: 'none', opacity: 0.7 }));
  if (sea) parts.push(K.solid(E(bx - 8, by + 12, 16, 6, 20), pal.accent, line, 1.3));
  parts.push(K.sheen(bx - 8, by - 9, 14, 4));
  // Scheren
  for (const [dy, s] of [[-8, 0.9], [8, 1]]) {
    const x = bx + 34, y = by + dy;
    parts.push(K.blob('c-arm', [T(`M ${pt(x - 6, y)} L ${pt(x + 12 * s, y - 8 * s)}`, 6), E(x + 20 * s, y - 12 * s, 9 * s, 6 * s, -20)], K.vol(sea ? pal.body : pal.accent, x + 16, y - 14, 20), line));
    parts.push(h('path', { d: `M ${pt(x + 26 * s, y - 14 * s)} l 6 -2`, stroke: line, 'stroke-width': 1.6 }));
  }
  const H = form.head;
  const jx = bx + 26, jy = by - 4;
  const hx = bx + 30, hy = by - 8;
  const hd = [K.blob('c-skull', [E(hx, hy, 12, 10)], K.vol(pal.body, hx - 4, hy - 4, 24), line), ...frontFace(K, pal, hx + 2, hy - 2, 4.6, 5.4, { mouthW: 5 })];
  const hg = headGroup(jx, jy, H, hd);
  parts.push(hg.node);
  return { parts, anchors: { head: hg.map(hx, hy - 12), eye: hg.map(hx + 7, hy - 2), mouth: hg.map(hx + 2, hy + 6), neck: [bx + 20, by - 6], body: [bx, by], top: sea ? by - 30 : by - 90 } };
}

function crab(ctx) {
  const { K, pal, form } = ctx;
  const line = pal.line;
  const parts = [];
  const bx = 100, by = 142;
  const bodyFill = K.vol(pal.body, bx - 12, by - 18, 80);
  for (const dir of [-1, 1]) for (let i = 0; i < 3; i++) parts.push(K.blob('c-leg', [T(`M ${pt(bx + dir * 30, by + 4 + i * 4)} L ${pt(bx + dir * (50 + i * 8), by - 4 + i * 6)} L ${pt(bx + dir * (56 + i * 10), 180)}`, 6)], K.vol(dark(pal.body, 0.1), bx, by, 60), line));
  // Scheren
  for (const [dir, s] of [[-1, 0.85], [1, 1.15]]) {
    const x = bx + dir * 40, y = by - 24;
    parts.push(K.blob('c-arm', [T(`M ${pt(bx + dir * 26, by - 8)} L ${pt(x, y)}`, 9), E(x + dir * 10 * s, y - 16 * s, 16 * s, 12 * s, dir * 20)], K.vol(pal.accent, x, y - 16, 30), line));
    parts.push(K.solid(P(`M ${pt(x + dir * 18 * s, y - 20 * s)} l ${r1(dir * 12 * s)} -8 l ${r1(-dir * 4)} 12 z`), light(pal.accent, 0.15), line, 1.3));
  }
  parts.push(K.blob('c-torso', [E(bx, by, 48, 28)], bodyFill, line));
  parts.push(h('path', { d: `M ${pt(bx - 40, by + 8)} Q ${pt(bx, by + 24)} ${pt(bx + 40, by + 8)}`, stroke: light(pal.body, 0.3), 'stroke-width': 3, fill: 'none', opacity: 0.7 }));
  parts.push(K.sheen(bx - 16, by - 16, 18, 6));
  const H = form.head;
  const hx = bx, hy = by - 10;
  const hd = [];
  for (const dx of [-12, 12]) hd.push(h('path', { d: `M ${pt(hx + dx, hy - 4)} L ${pt(hx + dx * 1.2, hy - 22)}`, stroke: line, 'stroke-width': 4, 'stroke-linecap': 'round' }));
  hd.push(K.eye(hx - 14, hy - 24, 6.5, { iris: pal.eye, skin: pal.body, line, front: true }), K.eye(hx + 14, hy - 24, 6.5, { iris: pal.eye, skin: pal.body, line, front: true }));
  hd.push(K.blush(hx - 20, hy + 4, 5), K.blush(hx + 20, hy + 4, 5));
  hd.push(K.mouth(`M ${pt(hx - 6, hy + 4)} Q ${pt(hx, hy + 9)} ${pt(hx + 6, hy + 4)}`, { open: [hx, hy + 6, 6, 4], line }));
  const hg = headGroup(hx, by, H, hd);
  parts.push(hg.node);
  return { parts, anchors: { head: hg.map(hx, hy - 30), eye: hg.map(hx + 14, hy - 24), mouth: hg.map(hx, hy + 6), neck: [hx, by - 20], body: [bx, by], top: by - 62 } };
}

/* -------------------------------------------------------------------------- */
/* Weichtiere & Urzeit-Meerestiere                                              */
/* -------------------------------------------------------------------------- */

export function mollusk(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const parts = [];
  const H = form.head;
  if (f.has('snail')) {
    const bx = 104, by = 168;
    const skin = K.vol(pal.body, bx, by - 10, 60);
    parts.push(K.blob('c-torso', [E(bx, by, 50, 11), E(bx + 38, by - 20, 14, 24, 20)], skin, line));
    const shellFill = K.vol(pal.accent, 84, 116, 50);
    parts.push(K.blob('c-shell', [C(88, 130, 36)], shellFill, line));
    parts.push(h('path', { d: 'M 88 130 m -4 0 a 4 4 0 1 1 8 0 a 10 10 0 1 1 -20 0 a 17 17 0 1 1 34 0 a 25 25 0 1 1 -50 0', fill: 'none', stroke: dark(pal.accent, 0.35), 'stroke-width': 2.4 }));
    parts.push(K.sheen(76, 108, 12, 6));
    const hx = bx + 42, hy = by - 36;
    const hd = [
      h('path', { d: `M ${pt(hx - 6, hy - 6)} L ${pt(hx - 12, hy - 26)} M ${pt(hx + 6, hy - 6)} L ${pt(hx + 10, hy - 26)}`, stroke: line, 'stroke-width': 4.5, 'stroke-linecap': 'round' }),
      h('path', { d: `M ${pt(hx - 6, hy - 6)} L ${pt(hx - 12, hy - 26)} M ${pt(hx + 6, hy - 6)} L ${pt(hx + 10, hy - 26)}`, stroke: pal.body, 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
      K.eye(hx - 12, hy - 28, 5, { iris: pal.eye, skin: pal.body, line, front: true }),
      K.eye(hx + 10, hy - 28, 5, { iris: pal.eye, skin: pal.body, line, front: true }),
      K.blush(hx + 6, hy + 6, 3.5),
      K.mouth(`M ${pt(hx - 2, hy + 6)} q 4 3 8 0`, { open: [hx + 2, hy + 7, 4, 3], line }),
    ];
    const hg = headGroup(hx, hy + 10, H, hd);
    parts.push(hg.node);
    return { parts, anchors: { head: hg.map(hx, hy - 34), eye: hg.map(hx + 10, hy - 28), mouth: hg.map(hx + 2, hy + 7), neck: [hx - 4, hy + 16], body: [bx, by - 20], top: 90 } };
  }
  if (f.has('trilobite')) {
    const bx = 100, by = 158;
    parts.push(K.blob('c-torso', [E(bx, by, 50, 20)], K.vol(pal.body, bx - 10, by - 10, 60), line));
    for (let i = 0; i < 6; i++) parts.push(h('path', { d: `M ${pt(bx - 36 + i * 12, by - 17)} q 4 17 0 34`, stroke: dark(pal.body, 0.3), 'stroke-width': 1.6, fill: 'none' }));
    parts.push(K.solid(E(bx + 34, by - 4, 22, 17), K.vol(light(pal.body, 0.12), bx + 30, by - 12, 30), line, 1.8));
    parts.push(h('path', { d: `M ${pt(bx + 50, by - 16)} q 14 -14 22 -10 M ${pt(bx + 48, by - 20)} q 8 -16 18 -18`, stroke: line, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }));
    parts.push(headGroup(bx + 36, by, H, frontFace(K, pal, bx + 36, by - 8, 5, 7, { mouthW: 6 })).node);
    return { parts, anchors: { head: [bx + 34, by - 22], eye: [bx + 43, by - 8], mouth: [bx + 36, by], neck: [bx + 20, by], body: [bx, by], top: by - 30 } };
  }
  // Schwimmende Weichtiere
  const bx = 100, by = 96;
  if (f.has('jelly')) {
    parts.push(K.glow(pal.glow || pal.body, bx, by + 10, 70, 0.4));
    for (let i = 0; i < 6; i++) parts.push(h('path', { class: 'c-tentacle', d: `M ${pt(bx - 28 + i * 11, by + 18)} q ${r1(i % 2 ? 8 : -8)} 20 0 36 q ${r1(i % 2 ? -8 : 8)} 16 0 30`, stroke: i % 2 ? pal.accent : light(pal.body, 0.2), 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', opacity: 0.85 }));
    parts.push(K.blob('c-torso', [P(`M ${pt(bx - 42, by + 20)} C ${pt(bx - 44, by - 44)} ${pt(bx + 44, by - 44)} ${pt(bx + 42, by + 20)} Q ${pt(bx, by + 30)} ${pt(bx - 42, by + 20)} Z`)], K.vol(pal.body, bx - 12, by - 20, 70), dark(pal.body, 0.35), { opacity: 0.92 }));
    parts.push(K.sheen(bx - 16, by - 18, 16, 8, -20, 0.5));
    parts.push(headGroup(bx, by + 8, H, frontFace(K, pal, bx, by + 2, 7, 12, { mouthW: 8 })).node);
    return { parts, anchors: { floating: true, head: [bx, by - 30], eye: [bx + 12, by + 2], mouth: [bx, by + 14], neck: [bx, by + 20], body: [bx, by + 20], top: by - 34 } };
  }
  if (f.has('ammonite')) {
    for (let i = 0; i < 5; i++) parts.push(h('path', { class: 'c-tentacle', d: `M ${pt(bx + 30, by + 22 + i * 5)} q 16 ${r1(-4 + i * 3)} 26 ${r1(8 + i * 4)}`, stroke: pal.body, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }));
    parts.push(K.blob('c-torso', [C(bx - 4, by + 20, 40)], K.vol(pal.accent, bx - 18, by, 70), line));
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; parts.push(h('path', { d: `M ${pt(bx - 4 + Math.cos(a) * 14, by + 20 + Math.sin(a) * 14)} L ${pt(bx - 4 + Math.cos(a) * 38, by + 20 + Math.sin(a) * 38)}`, stroke: dark(pal.accent, 0.3), 'stroke-width': 1.6 })); }
    parts.push(h('path', { d: `M ${pt(bx - 4, by + 20)} m -5 0 a 5 5 0 1 1 10 0 a 12 12 0 1 1 -24 0`, fill: 'none', stroke: dark(pal.accent, 0.4), 'stroke-width': 2.4 }));
    parts.push(K.solid(E(bx + 30, by + 26, 14, 16), K.vol(pal.body, bx + 26, by + 18, 24), line, 1.8));
    parts.push(headGroup(bx + 30, by + 30, H, [K.eye(bx + 32, by + 22, 6, { iris: pal.eye, skin: pal.body, line })]).node);
    parts.push(K.sheen(bx - 18, by - 2, 12, 6));
    return { parts, anchors: { floating: true, head: [bx + 30, by + 6], eye: [bx + 32, by + 22], mouth: [bx + 40, by + 32], neck: [bx + 24, by + 30], body: [bx, by + 20], top: by - 22 } };
  }
  // Tintenfisch / Oktopus
  const squid = f.has('squid');
  const arms = squid ? 8 : 8;
  for (let i = 0; i < arms; i++) {
    const x = bx - 30 + i * 8.5;
    parts.push(h('path', { class: 'c-tentacle', d: `M ${pt(x, by + 24)} q ${r1(i % 2 ? 10 : -10)} 26 ${r1((i - 3.5) * 4)} 46 q 4 8 ${r1(i % 2 ? 8 : -8)} 6`, stroke: line, 'stroke-width': 9, fill: 'none', 'stroke-linecap': 'round' }));
    parts.push(h('path', { class: 'c-tentacle', d: `M ${pt(x, by + 24)} q ${r1(i % 2 ? 10 : -10)} 26 ${r1((i - 3.5) * 4)} 46 q 4 8 ${r1(i % 2 ? 8 : -8)} 6`, stroke: i % 2 ? pal.body : light(pal.body, 0.1), 'stroke-width': 5.4, fill: 'none', 'stroke-linecap': 'round' }));
  }
  const mantle = squid ? [E(bx, by - 8, 30, 44), P(`M ${pt(bx - 30, by - 40)} L ${pt(bx - 48, by - 64)} L ${pt(bx - 12, by - 52)} Z`), P(`M ${pt(bx + 30, by - 40)} L ${pt(bx + 48, by - 64)} L ${pt(bx + 12, by - 52)} Z`)] : [E(bx, by, 38, 36)];
  parts.push(K.blob('c-torso', mantle, K.vol(pal.body, bx - 12, by - 20, 80), line));
  parts.push(K.sheen(bx - 14, by - 16, 14, 7));
  for (const [dx, dy] of [[-18, -18], [14, -24], [-6, -30]]) parts.push(h('circle', { cx: r1(bx + dx), cy: r1(by + dy), r: 3, fill: pal.belly, opacity: 0.6 }));
  parts.push(headGroup(bx, by + 14, H, frontFace(K, pal, bx, by + 6, 9, 14, { mouthW: 9 })).node);
  return { parts, anchors: { floating: true, head: [bx, by - 40], eye: [bx + 14, by + 6], mouth: [bx, by + 20], neck: [bx, by + 24], body: [bx, by + 20], top: squid ? by - 66 : by - 40 } };
}

/* -------------------------------------------------------------------------- */
/* Tek-Konstrukte                                                                */
/* -------------------------------------------------------------------------- */

export function robot(ctx) {
  const { K, pal, form, f } = ctx;
  const line = '#1e2a36';
  const metal = K.vol(pal.body, 80, 80, 110);
  const dark1 = K.vol(pal.belly, 90, 110, 90);
  const glow = pal.eyeGlow || pal.accent;
  const parts = [];
  if (f.has('scout') || f.has('drone')) {
    const bx = 100, by = 104;
    if (f.has('drone')) for (const [dx, dy] of [[-48, -18], [48, -18]]) {
      parts.push(h('path', { d: `M ${pt(bx, by)} L ${pt(bx + dx, by + dy)}`, stroke: line, 'stroke-width': 8, 'stroke-linecap': 'round' }), h('path', { d: `M ${pt(bx, by)} L ${pt(bx + dx, by + dy)}`, stroke: pal.belly, 'stroke-width': 5, 'stroke-linecap': 'round' }));
      parts.push(h('ellipse', { class: 'c-rotor', cx: r1(bx + dx), cy: r1(by + dy - 6), rx: 22, ry: 4, fill: '#cfe8ff', opacity: 0.55, stroke: '#7aa0c0', 'stroke-width': 1 }));
    }
    parts.push(K.glow(glow, bx, by + 50, 30, 0.5));
    parts.push(K.blob('c-torso', [C(bx, by, 36)], metal, line));
    parts.push(h('path', { d: `M ${pt(bx - 34, by + 6)} Q ${pt(bx, by + 20)} ${pt(bx + 34, by + 6)}`, stroke: pal.belly, 'stroke-width': 3, fill: 'none' }));
    parts.push(headGroup(bx + 6, by - 4, form.head * 0.8 + 0.2, [
      K.solid(C(bx + 6, by - 4, 17), K.vol('#1b2430', bx, by - 10, 30), line, 2),
      K.eye(bx + 6, by - 4, 11, { iris: glow, skin: '#1b2430', line: '#0d141c', glow, front: true }),
    ]).node);
    parts.push(K.sheen(bx - 16, by - 20, 12, 6, -30, 0.6));
    if (f.has('scout')) parts.push(h('path', { d: `M ${pt(bx - 10, by - 34)} l -6 -14`, stroke: line, 'stroke-width': 3, 'stroke-linecap': 'round' }), h('circle', { class: 'c-glowdot', cx: r1(bx - 16), cy: r1(by - 50), r: 3.4, fill: glow }));
    return { parts, anchors: { floating: true, head: [bx, by - 36], eye: [bx + 6, by - 4], mouth: [bx + 6, by + 14], neck: [bx, by + 30], body: [bx, by], top: by - 50 } };
  }
  if (f.has('overseer')) {
    const bx = 100, by = 100;
    parts.push(K.glow(glow, bx, by, 80, 0.45));
    parts.push(h('ellipse', { class: 'c-ring', cx: bx, cy: by, rx: 70, ry: 18, fill: 'none', stroke: glow, 'stroke-width': 3, opacity: 0.8, transform: `rotate(-12 ${bx} ${by})` }));
    parts.push(K.blob('c-torso', [P(`M ${pt(bx, by - 52)} L ${pt(bx + 34, by)} L ${pt(bx, by + 52)} L ${pt(bx - 34, by)} Z`)], metal, line));
    parts.push(h('path', { d: `M ${pt(bx, by - 52)} L ${pt(bx, by + 52)} M ${pt(bx - 34, by)} L ${pt(bx + 34, by)}`, stroke: pal.belly, 'stroke-width': 1.6, opacity: 0.6 }));
    parts.push(headGroup(bx, by, form.head * 0.8 + 0.2, [K.eye(bx, by, 12, { iris: glow, skin: pal.body, line, glow, front: true })]).node);
    parts.push(h('ellipse', { class: 'c-ring', cx: bx, cy: by, rx: 56, ry: 12, fill: 'none', stroke: light(glow, 0.3), 'stroke-width': 2, opacity: 0.8, transform: `rotate(18 ${bx} ${by})` }));
    for (const [dx, dy] of [[-58, -30], [60, 26], [-40, 44]]) parts.push(K.solid(P(`M ${pt(bx + dx, by + dy - 6)} l 6 6 l -6 6 l -6 -6 z`), metal, line, 1.4));
    return { parts, anchors: { floating: true, head: [bx, by - 52], eye: [bx, by], mouth: [bx, by + 20], neck: [bx, by + 30], body: [bx, by], top: by - 56 } };
  }
  if (f.has('turret')) {
    const bx = 100, by = 140;
    parts.push(K.blob('c-leg', [P(`M ${pt(bx - 44, 182)} L ${pt(bx - 38, by + 18)} L ${pt(bx + 38, by + 18)} L ${pt(bx + 44, 182)} Z`)], dark1, line));
    for (let i = 0; i < 5; i++) parts.push(h('circle', { cx: r1(bx - 32 + i * 16), cy: 172, r: 5, fill: '#2a3440', stroke: line, 'stroke-width': 1.2 }));
    parts.push(K.blob('c-torso', [P(`M ${pt(bx - 34, by + 18)} L ${pt(bx - 28, by - 20)} L ${pt(bx + 28, by - 20)} L ${pt(bx + 34, by + 18)} Z`)], metal, line));
    parts.push(h('rect', { x: r1(bx - 18), y: r1(by - 6), width: 36, height: 8, rx: 3, fill: glow, class: 'c-visor', opacity: 0.9 }));
    const hd = [
      K.blob('c-skull', [E(bx + 4, by - 36, 26, 18)], metal, line),
      h('rect', { x: r1(bx + 22), y: r1(by - 44), width: 34, height: 6, rx: 2, fill: '#3a4450', stroke: line, 'stroke-width': 1.4 }),
      h('rect', { x: r1(bx + 22), y: r1(by - 34), width: 30, height: 6, rx: 2, fill: '#3a4450', stroke: line, 'stroke-width': 1.4 }),
      K.eye(bx + 6, by - 38, 7, { iris: glow, skin: pal.body, line, glow, front: true }),
      K.sheen(bx - 6, by - 46, 10, 4),
    ];
    const hg = headGroup(bx, by - 20, form.head, hd);
    parts.push(hg.node);
    return { parts, anchors: { head: hg.map(bx, by - 54), eye: hg.map(bx + 6, by - 38), mouth: hg.map(bx + 6, by - 26), neck: [bx, by - 20], body: [bx, by], top: by - 60 } };
  }
  // Enforcer: schlanker Zweibeiner
  const bx = 100, by = 108;
  for (const [dx, cls] of [[-14, 'c-leg l2'], [14, 'c-leg l1']]) {
    parts.push(K.blob(cls, [T(`M ${pt(bx + dx, by + 18)} L ${pt(bx + dx * 2.2, by + 44)} L ${pt(bx + dx * 1.2, 176)}`, 7)], dark1, line));
    parts.push(K.solid(P(`M ${pt(bx + dx * 1.2 - 6, 182)} l 6 -8 l 6 8 z`), metal, line, 1.4));
  }
  for (const dir of [-1, 1]) parts.push(K.blob('c-arm', [T(`M ${pt(bx + dir * 24, by - 14)} L ${pt(bx + dir * 42, by + 8)} L ${pt(bx + dir * 38, by + 34)}`, 6)], dark1, line), K.solid(P(`M ${pt(bx + dir * 38, by + 34)} l ${dir * 6} 10 l ${-dir * 8} -4 z`), glow, line, 1));
  parts.push(K.blob('c-torso', [P(`M ${pt(bx - 30, by - 22)} L ${pt(bx + 30, by - 22)} L ${pt(bx + 12, by + 26)} L ${pt(bx - 12, by + 26)} Z`)], metal, line));
  parts.push(h('path', { class: 'c-glowline', d: `M ${pt(bx - 18, by - 10)} L ${pt(bx, by + 14)} L ${pt(bx + 18, by - 10)}`, stroke: glow, 'stroke-width': 2.4, fill: 'none', 'stroke-linejoin': 'round' }));
  const hd = [
    K.blob('c-skull', [P(`M ${pt(bx - 22, by - 44)} L ${pt(bx + 22, by - 44)} L ${pt(bx + 14, by - 26)} L ${pt(bx - 14, by - 26)} Z`)], metal, line),
    h('rect', { class: 'c-visor', x: r1(bx - 14), y: r1(by - 40), width: 28, height: 6, rx: 3, fill: glow }),
    K.sheen(bx - 10, by - 42, 8, 2.5, 0, 0.5),
  ];
  const hg = headGroup(bx, by - 26, form.head, hd);
  parts.push(hg.node);
  return { parts, anchors: { head: hg.map(bx, by - 46), eye: hg.map(bx, by - 37), mouth: hg.map(bx, by - 30), neck: [bx, by - 22], body: [bx, by], top: by - 50 } };
}

/* -------------------------------------------------------------------------- */
/* Sonderformen                                                                  */
/* -------------------------------------------------------------------------- */

export function special(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const H = form.head;
  const parts = [];
  if (f.has('gasbags') || f.has('gacha')) {
    const gas = f.has('gasbags');
    const bx = 100, by = gas ? 118 : 128;
    const r = gas ? 50 : 46;
    const fill = K.vol(pal.body, bx - 16, by - 20, r * 2.2);
    for (const dx of [-22, 22]) parts.push(K.blob('c-leg', [T(`M ${pt(bx + dx, by + r * 0.7)} L ${pt(bx + dx, 177)}`, 12), E(bx + dx + 2, 179.5, 10, 4.6)], K.vol(dark(pal.body, 0.1), bx, by, 50), line));
    if (gas) parts.push(K.blob('c-tail', [E(bx - r - 6, by + 10, 12, 8, -20)], fill, line));
    parts.push(K.blob('c-torso', [E(bx, by, r * 1.05, r * (gas ? 0.92 : 0.9))], fill, line));
    parts.push(h('ellipse', { cx: bx, cy: r1(by + r * 0.35), rx: r1(r * 0.62), ry: r1(r * 0.42), fill: pal.belly, opacity: 0.92 }));
    parts.push(K.sheen(bx - r * 0.35, by - r * 0.5, r * 0.3, r * 0.14, -25, 0.45));
    if (gas) parts.push(h('path', { d: `M ${pt(bx - r * 0.7, by - r * 0.2)} q ${r1(r * 0.7)} ${r1(-r * 0.4)} ${r1(r * 1.4)} 0`, stroke: pal.accent, 'stroke-width': 3, fill: 'none', opacity: 0.6 }));
    const hd = [];
    if (!gas) {
      parts.push(K.glow(pal.glow || pal.accent, bx + 4, by - r - 6, 22, 0.8));
      hd.push(K.solid(P(`M ${pt(bx - 8, by - r * 0.85)} L ${pt(bx - 2, by - r - 22)} L ${pt(bx + 6, by - r * 0.8)} Z`), light(pal.accent, 0.3), line, 1.4), K.solid(P(`M ${pt(bx + 6, by - r * 0.82)} L ${pt(bx + 14, by - r - 12)} L ${pt(bx + 18, by - r * 0.72)} Z`), pal.accent, line, 1.2));
    }
    hd.push(...frontFace(K, pal, bx + 6, by - r * 0.15, gas ? 10 : 12, gas ? 16 : 17, { mouthW: 10 }));
    if (gas) hd.push(K.solid(E(bx + 6, by + r * 0.25, 10, 6), light(pal.accent, 0.2), line, 1.2));
    const hg = headGroup(bx, by, H * 0.9 + 0.1, hd);
    parts.push(hg.node);
    return { parts, anchors: { head: [bx, by - r], eye: [bx + 22, by - r * 0.15], mouth: [bx + 6, by + r * 0.1], neck: [bx, by + r * 0.4], body: [bx, by], top: by - r - 24 } };
  }
  if (f.has('oasisaur')) {
    const bx = 100, by = 118;
    const rock = K.vol(pal.body, bx - 20, by, 90);
    for (let i = 0; i < 4; i++) parts.push(h('path', { class: 'c-leg', d: `M ${pt(bx - 36 + i * 24, by + 24)} q ${r1(-6 + i * 4)} 18 ${r1(-10 + i * 6)} 30`, stroke: line, 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round' }), h('path', { d: `M ${pt(bx - 36 + i * 24, by + 24)} q ${r1(-6 + i * 4)} 18 ${r1(-10 + i * 6)} 30`, stroke: pal.extra, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }));
    parts.push(K.blob('c-torso', [P(`M ${pt(bx - 70, by)} Q ${pt(bx - 60, by + 40)} ${pt(bx, by + 44)} Q ${pt(bx + 60, by + 40)} ${pt(bx + 70, by)} Q ${pt(bx, by - 14)} ${pt(bx - 70, by)} Z`)], rock, line));
    parts.push(K.solid(E(bx, by - 4, 70, 14), K.vol('#e8d29a', bx - 10, by - 10, 70), dark('#c8a870', 0.5), 1.6));
    parts.push(K.solid(E(bx - 8, by - 6, 26, 7), K.vol('#5ac8f0', bx - 14, by - 10, 30), '#2a78a0', 1.4));
    parts.push(h('path', { d: `M ${pt(bx + 30, by - 8)} q -4 -28 8 -44`, stroke: '#7a5530', 'stroke-width': 4.5, fill: 'none', 'stroke-linecap': 'round' }));
    for (const a of [-160, -115, -65, -20]) { const rad = a * Math.PI / 180; parts.push(K.solid(P(`M ${pt(bx + 38, by - 52)} q ${r1(Math.cos(rad) * 12)} ${r1(Math.sin(rad) * 12 - 6)} ${r1(Math.cos(rad) * 24)} ${r1(Math.sin(rad) * 24 + 4)} q ${r1(-Math.cos(rad) * 8)} -2 ${r1(-Math.cos(rad) * 24)} ${r1(-Math.sin(rad) * 24 - 4)} z`), pal.accent, dark(pal.accent, 0.5), 1)); }
    parts.push(K.solid(E(bx - 44, by - 10, 10, 6), pal.extra, line, 1.2), K.solid(E(bx - 58, by + 14, 7, 5), pal.extra, line, 1.1));
    parts.push(headGroup(bx + 36, by + 26, H, frontFace(K, pal, bx + 36, by + 18, 7, 10, { mouthW: 8 })).node);
    return { parts, anchors: { floating: true, head: [bx + 36, by - 10], eye: [bx + 46, by + 18], mouth: [bx + 36, by + 30], neck: [bx, by + 40], body: [bx, by], top: by - 60 } };
  }
  // Wüstentitan
  const bx = 100, by = 104;
  const fill = K.vol(pal.body, bx - 20, by - 20, 100);
  parts.push(K.glow(pal.glow || pal.accent, bx, by, 90, 0.35));
  parts.push(h('path', { class: 'c-tail', d: `M ${pt(bx - 20, by + 14)} Q ${pt(bx - 70, by + 40)} ${pt(bx - 92, by + 70)}`, stroke: line, 'stroke-width': 9, fill: 'none', 'stroke-linecap': 'round' }), h('path', { d: `M ${pt(bx - 20, by + 14)} Q ${pt(bx - 70, by + 40)} ${pt(bx - 92, by + 70)}`, stroke: pal.body, 'stroke-width': 5.5, fill: 'none', 'stroke-linecap': 'round' }));
  for (const dir of [-1, 1]) parts.push(h('g', { class: 'c-wing' + (dir < 0 ? ' far' : ''), style: `transform-origin:${bx}px ${by}px` }, K.solid(P(`M ${pt(bx, by - 8)} Q ${pt(bx + dir * 50, by - 50)} ${pt(bx + dir * 94, by - 16)} Q ${pt(bx + dir * 60, by)} ${pt(bx + dir * 70, by + 24)} Q ${pt(bx + dir * 30, by + 10)} ${pt(bx, by + 16)} Z`), fill, line, 2)));
  parts.push(K.blob('c-torso', [E(bx, by, 30, 24)], fill, line));
  for (const [dx, dy] of [[-40, -20], [40, -20], [0, -26]]) parts.push(K.solid(P(`M ${pt(bx + dx - 5, by + dy + 4)} l 5 -14 l 5 14 z`), pal.accent, line, 1.2));
  parts.push(headGroup(bx, by + 6, H, frontFace(K, pal, bx, by - 2, 8, 12, { mouthW: 9, glow: pal.accent })).node);
  return { parts, anchors: { floating: true, head: [bx, by - 24], eye: [bx + 12, by - 2], mouth: [bx, by + 12], neck: [bx, by + 20], body: [bx, by], top: by - 60 } };
}
