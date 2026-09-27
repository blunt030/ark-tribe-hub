/**
 * Körperbaupläne der Landtiere: Raubsaurier (zweibeinig), Sauropoden,
 * vierbeinige Reptilien, Säugetiere, Affen/Humanoide und Laufvögel.
 *
 * Alle Pläne zeichnen im Koordinatensystem 0–200, Blick nach rechts, Boden bei
 * y≈182. Der Kopf wird um das Halsgelenk skaliert – Babys bekommen so den
 * typischen großen Tamagotchi-Kopf, ohne dass jede Form doppelt existiert.
 */
import { h } from './vdom.js';
import { E, C, P, T, pt, r1, light, dark, mix, pivot } from './art-kit.js';

/** Transformation „um Punkt skalieren“ und passende Umrechnung für Ankerpunkte. */
export function around(jx, jy, s) {
  return {
    attr: `translate(${r1(jx)} ${r1(jy)}) scale(${r1(s * 100) / 100}) translate(${r1(-jx)} ${r1(-jy)})`,
    map: (x, y) => [jx + (x - jx) * s, jy + (y - jy) * s],
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Gemeinsamer Kopf für Echsen und Säuger im Profil. */
function profileHead(ctx, o) {
  const { K, pal, f } = ctx;
  const { cx, cy, r, snoutLen = 1, snoutH = 1, jaw = true, teeth = false, muzzle = null, beak = null, eyeR = r * 0.36 } = o;
  const line = pal.line;
  const skin = K.vol(pal.body, cx - r * 0.3, cy - r * 0.4, r * 2.4);
  const sx = cx + r * 0.95 * snoutLen;
  const sy = cy + r * 0.3;
  const shapes = [E(cx, cy, r * 1.05, r * 0.92)];
  if (!beak) shapes.push(E(sx, sy, r * 0.78 * snoutLen, r * 0.52 * snoutH));
  if (jaw && !beak) shapes.push(E(sx - r * 0.2, sy + r * 0.34 * snoutH, r * 0.66 * snoutLen, r * 0.3 * snoutH));
  const parts = [K.blob('c-skull', shapes, skin, line)];
  if (muzzle) parts.push(h('ellipse', { cx: r1(sx + r * 0.05), cy: r1(sy + r * 0.12), rx: r1(r * 0.6 * snoutLen), ry: r1(r * 0.4 * snoutH), fill: muzzle, opacity: 0.95 }));
  let tip = sx + r * 0.72 * snoutLen;
  if (beak) {
    const bl = r * (beak.len || 1);
    const by0 = cy + r * 0.05;
    const hook = beak.hook ? r * 0.35 : 0;
    parts.push(K.solid(P(`M ${pt(cx + r * 0.62, by0 - r * 0.42)} Q ${pt(cx + r * 0.9 + bl * 0.6, by0 - r * 0.45)} ${pt(cx + r * 0.75 + bl, by0 + hook)} Q ${pt(cx + r * 0.9 + bl * 0.4, by0 + r * 0.42)} ${pt(cx + r * 0.62, by0 + r * 0.45)} Z`), K.vol(beak.color, cx + r, by0 - r * 0.3, bl * 1.4), line, 1.8));
    parts.push(h('path', { d: `M ${pt(cx + r * 0.66, by0 + r * 0.05)} Q ${pt(cx + r * 0.8 + bl * 0.55, by0 + r * 0.12)} ${pt(cx + r * 0.72 + bl * 0.95, by0 + hook * 0.8)}`, fill: 'none', stroke: line, 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
    tip = cx + r * 0.75 + bl;
  }
  parts.push(K.sheen(cx - r * 0.25, cy - r * 0.5, r * 0.45, r * 0.22));
  const ex = cx + r * 0.28;
  const ey = cy - r * 0.18;
  parts.push(K.blush(ex + r * 0.3, ey + eyeR * 1.9, eyeR * 0.9));
  if (!beak) {
    parts.push(h('ellipse', { cx: r1(tip - r * 0.16), cy: r1(sy - r * 0.2 * snoutH), rx: r1(r * 0.07 + 0.8), ry: r1(r * 0.05 + 0.6), fill: dark(pal.body, 0.55) }));
    const my = sy + r * 0.22 * snoutH;
    const teethPts = teeth ? [[tip - r * 0.5, my - 0.4, 3.2], [tip - r * 0.95, my + 0.2, 2.6]] : [];
    parts.push(K.mouth(`M ${pt(tip - r * 0.12, my - r * 0.03)} Q ${pt(lerp(tip, cx, 0.45), my + r * 0.2)} ${pt(cx + r * 0.2, my - r * 0.02)}`,
      { open: [tip - r * 0.55 * snoutLen, my + r * 0.12, r * 0.34 * snoutLen, r * 0.26], line, teeth: teethPts }));
  } else {
    parts.push(K.mouth(`M ${pt(cx + r * 0.62, cy + r * 0.32)} q 2 2 4 0`, { open: [cx + r * 0.95, cy + r * 0.28, r * 0.28, r * 0.2], line }));
  }
  parts.push(K.eye(ex, ey, eyeR, { iris: pal.eye, skin: pal.body, line, glow: pal.eyeGlow }));
  return { parts, eye: [ex, ey], mouth: [tip - r * 0.4, sy + r * 0.2], top: cy - r * 0.95, tip };
}

/** Zehen/Krallen an einem Fuß. */
function toes(K, x, y, line, n = 3, s = 3, dir = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([x + dir * (4 + i * 3.4), y - 1.5 + i * 0.4, dir]);
  return K.claws(pts, line, '#f3eadb', s);
}

/* -------------------------------------------------------------------------- */
/* Raubsaurier & zweibeinige Saurier                                           */
/* -------------------------------------------------------------------------- */

export function theropod(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const slim = f.has('slim');
  const heavy = f.has('heavy');
  const bx = 86, by = slim ? 118 : 122;
  const brx = slim ? 31 : heavy ? 41 : 37;
  const bry = slim ? 23 : heavy ? 31 : 28;
  const legLong = f.has('longlegs') ? 8 : 0;
  const bodyFill = K.vol(pal.body, bx + 6, by - 18, 64);
  const farFill = K.vol(dark(pal.body, 0.16), bx, by, 60);
  const parts = [];

  // Hinterer Arm und hinteres Bein
  parts.push(K.blob('c-leg l2', [E(bx - 6, by + 20, 12, 17, 10), T(`M ${pt(bx - 5, by + 30)} L ${pt(bx - 9, 176)}`, 10), E(bx - 3, 179.5, 11.5, 5)], farFill, line));

  // Schwanz
  const tlen = f.has('shorttail') ? 0.7 : 1;
  const tipX = lerp(bx - brx, 8, tlen);
  const tipY = f.has('tailup') ? 80 : 98;
  parts.push(K.blob('c-tail', [P(`M ${pt(bx - brx * 0.6, by - bry * 0.62)} C ${pt(bx - brx - 14, by - bry * 0.8)} ${pt(tipX + 22, tipY - 8)} ${pt(tipX, tipY)} C ${pt(tipX + 20, tipY + 16)} ${pt(bx - brx - 8, by + bry * 0.55)} ${pt(bx - brx * 0.45, by + bry * 0.72)} Z`)],
    bodyFill, line, { style: `transform-origin:${r1(bx - brx * 0.7)}px ${r1(by)}px` }));
  if (f.has('tailfeather')) parts.push(K.solid(P(`M ${pt(tipX + 6, tipY + 2)} q -14 -8 -20 2 q 12 2 20 6 z`), light(pal.accent, 0.1), line, 1.4));

  // Rückenmerkmale hinter dem Körper
  if (f.has('sail')) {
    const sh = 46 * F + 8;
    parts.push(K.solid(P(`M ${pt(bx - 30, by - bry * 0.6)} C ${pt(bx - 26, by - bry - sh * 0.8)} ${pt(bx - 8, by - bry - sh)} ${pt(bx + 4, by - bry - sh * 0.85)} C ${pt(bx + 14, by - bry - sh * 0.95)} ${pt(bx + 26, by - bry - sh * 0.6)} ${pt(bx + 30, by - bry * 0.55)} Z`),
      K.lin(light(pal.accent, 0.2), dark(pal.accent, 0.15), by - bry - sh, by), line, 2));
    for (let i = 0; i < 5; i++) {
      const x = bx - 22 + i * 12;
      parts.push(h('path', { d: `M ${pt(x, by - bry * 0.4)} L ${pt(x + 1, by - bry - sh * (0.55 + 0.35 * Math.sin((i + 0.5) / 5 * Math.PI)))}`, stroke: dark(pal.accent, 0.3), 'stroke-width': 1.4, opacity: 0.6 }));
    }
  }
  if (f.has('ridge')) parts.push(K.solid(P(`M ${pt(bx - 34, by - bry * 0.55)} Q ${pt(bx - 4, by - bry - 20 * F)} ${pt(bx + 30, by - bry * 0.7)} Z`), pal.accent, line, 1.8));
  if (f.has('hump')) parts.push(K.solid(P(`M ${pt(bx - 22, by - bry * 0.72)} L ${pt(bx - 12, by - bry - 22 * F)} L ${pt(bx - 2, by - bry * 0.8)} Z`), pal.accent, line, 1.8));
  if (f.has('spikes') || f.has('quillsback')) {
    for (let i = 0; i < 5; i++) {
      const x = bx - 30 + i * 13;
      const y = by - bry * (0.72 + 0.22 * Math.sin((i + 0.6) / 5 * Math.PI));
      parts.push(K.solid(P(`M ${pt(x - 4, y + 3)} L ${pt(x + 1, y - 8 * F - 3)} L ${pt(x + 5, y + 3)} Z`), pal.accent, line, 1.4));
    }
  }

  // Rumpf, Hals, Bauch
  const neckX = bx + brx * 0.72, neckY = by - bry * 0.55;
  const jx = neckX + 14, jy = neckY - 20 - (f.has('longneck') ? 16 : 0);
  parts.push(K.blob('c-torso', [E(bx, by, brx, bry, -10), T(`M ${pt(neckX - 6, neckY + 8)} L ${pt(jx, jy)}`, slim ? 15 : 20)], bodyFill, line));
  parts.push(h('ellipse', { cx: r1(bx + 12), cy: r1(by + bry * 0.36), rx: r1(brx * 0.6), ry: r1(bry * 0.48), fill: pal.belly, transform: `rotate(-12 ${r1(bx + 12)} ${r1(by + bry * 0.36)})`, opacity: 0.95 }));
  parts.push(K.sheen(bx - 6, by - bry * 0.5, brx * 0.45, bry * 0.2));
  if (f.has('stripes')) {
    for (let i = 0; i < 4; i++) {
      const x = bx - 22 + i * 11;
      parts.push(h('path', { d: `M ${pt(x, by - bry * 0.85 + Math.abs(i - 1.5) * 2)} q 3 8 -1 14`, stroke: dark(pal.accent, 0.1), 'stroke-width': 3.2, 'stroke-linecap': 'round', fill: 'none', opacity: 0.75 }));
    }
  }
  if (f.has('feathers')) {
    parts.push(K.solid(P(`M ${pt(bx - 20, by - bry * 0.78)} q 8 -12 14 -2 q 6 -12 13 -1 q 6 -10 12 1 q -18 8 -39 2 z`), light(pal.accent, 0.05), line, 1.4));
  }

  // Vorderes Bein
  parts.push(K.blob('c-leg l1', [E(bx + 8, by + 20, 14, 19, -12), T(`M ${pt(bx + 10, by + 32)} L ${pt(bx + 14, 176)}`, 12), E(bx + 18, 179.5, 13, 5.2)], bodyFill, line));
  parts.push(toes(K, bx + 22, 181.5, line));
  if (f.has('sickle')) parts.push(K.solid(P(`M ${pt(bx + 12, 176)} q -4 -8 2 -10 q -1 5 1 10 z`), '#f3eadb', line, 1));

  // Arme
  const ax = neckX + 4, ay = by - 2;
  if (f.has('bigclaws') || f.has('longarms')) {
    const len = f.has('longarms') ? 30 : 20;
    parts.push(K.blob('c-arm', [T(`M ${pt(ax, ay - 4)} Q ${pt(ax + len * 0.6, ay + 6)} ${pt(ax + len * 0.5, ay + len * 0.7)}`, 8)], bodyFill, line));
    for (let i = 0; i < 3; i++) {
      parts.push(K.solid(P(`M ${pt(ax + len * 0.45 + i * 3, ay + len * 0.72)} q ${3 + i} ${8 + len * 0.25} ${-4 + i} ${14 + len * 0.3} q ${2} ${-8} ${-1} ${-13 - len * 0.2} z`), '#f3eadb', line, 1));
    }
  } else if (!f.has('noarms')) {
    parts.push(K.blob('c-arm', [T(`M ${pt(ax, ay - 2)} Q ${pt(ax + 8, ay + 2)} ${pt(ax + 10, ay + 9)}`, 6.5)], bodyFill, line));
    parts.push(K.claws([[ax + 9, ay + 11, 1], [ax + 12, ay + 10, 1]], line, '#f3eadb', 2.4));
  }
  if (f.has('thumb')) parts.push(K.solid(P(`M ${pt(ax + 8, ay + 4)} l 5 -7 l 1 8 z`), '#f3eadb', line, 1));

  // Kopf
  const H = form.head;
  const head = around(jx, jy, H);
  const r = f.has('small') ? 24 : heavy ? 29.5 : slim ? 24.5 : 27;
  const hx = jx + 12, hy = jy - 12;
  const hd = profileHead(ctx, {
    cx: hx, cy: hy, r,
    snoutLen: f.has('croc') ? 1.55 : f.has('shortsnout') ? 0.72 : heavy ? 1.15 : 1,
    snoutH: f.has('croc') ? 0.75 : 1,
    teeth: f.has('teeth'),
    beak: f.has('beak') ? { color: pal.extra, len: f.has('bigbeak') ? 1.25 : 0.85, hook: f.has('hook') } : null,
    eyeR: r * (f.has('bigeye') ? 0.46 : 0.37),
  });
  const headParts = [];
  // Schmuck hinter dem Schädel
  if (f.has('frill')) headParts.push(K.solid(P(`M ${pt(hx - 18, hy + 6)} Q ${pt(hx - 40, hy - 6)} ${pt(hx - 30, hy + 26)} Q ${pt(hx - 20, hy + 36)} ${pt(hx - 4, hy + 22)} Z`), K.lin(light(pal.accent, 0.2), dark(pal.accent, 0.1), hy - 10, hy + 36), line, 1.8));
  if (f.has('quills')) {
    for (let i = 0; i < 6; i++) {
      const a = (-160 + i * 26) * Math.PI / 180;
      const x1 = hx - 12 + Math.cos(a) * 12, y1 = hy + 14 + Math.sin(a) * 12;
      const x2 = hx - 12 + Math.cos(a) * (28 + 8 * F), y2 = hy + 14 + Math.sin(a) * (28 + 8 * F);
      headParts.push(h('path', { d: `M ${pt(x1, y1)} L ${pt(x2, y2)}`, stroke: line, 'stroke-width': 5.5, 'stroke-linecap': 'round' }));
      headParts.push(h('path', { d: `M ${pt(x1, y1)} L ${pt(x2, y2)}`, stroke: i % 2 ? pal.accent : light(pal.accent, 0.25), 'stroke-width': 3, 'stroke-linecap': 'round' }));
    }
  }
  headParts.push(...hd.parts);
  if (f.has('dome')) headParts.push(K.solid(P(`M ${pt(hx - r * 0.9, hy - r * 0.3)} Q ${pt(hx - r * 0.2, hy - r * 1.55)} ${pt(hx + r * 0.75, hy - r * 0.45)} Q ${pt(hx, hy - r * 0.8)} ${pt(hx - r * 0.9, hy - r * 0.3)} Z`), K.vol(pal.accent, hx - 4, hy - r, r * 1.3), line, 1.8));
  if (f.has('crest')) headParts.push(K.solid(P(`M ${pt(hx - r * 0.4, hy - r * 0.8)} Q ${pt(hx - r * 0.2, hy - r * 1.9)} ${pt(hx + r * 0.25, hy - r * 1.3)} Q ${pt(hx + r * 0.45, hy - r * 1.95)} ${pt(hx + r * 0.75, hy - r * 1.05)} Q ${pt(hx + r * 0.3, hy - r * 0.95)} ${pt(hx - r * 0.4, hy - r * 0.8)} Z`), K.vol(pal.accent, hx, hy - r * 1.4, r), line, 1.6));
  if (f.has('crest2')) {
    for (const dx of [-0.25, 0.2]) headParts.push(K.solid(P(`M ${pt(hx + r * dx - 3, hy - r * 0.78)} q ${r1(r * 0.3)} ${r1(-r * 1.1)} ${r1(r * 0.75)} ${r1(-r * 0.2)} q ${r1(-r * 0.2)} ${r1(r * 0.25)} ${r1(-r * 0.62)} ${r1(r * 0.35)} z`), K.vol(pal.accent, hx, hy - r, r), line, 1.4));
  }
  if (f.has('tube')) headParts.push(K.solid(P(`M ${pt(hx - r * 0.1, hy - r * 0.75)} Q ${pt(hx - r * 1.2, hy - r * 1.6)} ${pt(hx - r * 1.9, hy - r * 1.35)} Q ${pt(hx - r * 1.95, hy - r * 1.05)} ${pt(hx - r * 1.55, hy - r * 1.02)} Q ${pt(hx - r * 0.9, hy - r * 1.05)} ${pt(hx - r * 0.55, hy - r * 0.45)} Z`), K.vol(pal.accent, hx - r, hy - r * 1.3, r * 1.2), line, 1.6));
  if (f.has('horns2') || f.has('brow')) {
    const big = f.has('horns2');
    headParts.push(K.solid(P(`M ${pt(hx + r * 0.05, hy - r * 0.72)} Q ${pt(hx + r * 0.15, hy - r * (big ? 1.45 : 1.05))} ${pt(hx + r * (big ? 0.5 : 0.35), hy - r * (big ? 1.25 : 1.0))} Q ${pt(hx + r * 0.35, hy - r * 0.95)} ${pt(hx + r * 0.52, hy - r * 0.62)} Z`), big ? '#efe3c8' : pal.accent, line, 1.5));
  }
  if (f.has('nosehorn')) headParts.push(K.solid(P(`M ${pt(hd.tip - r * 0.75, hy - r * 0.1)} Q ${pt(hd.tip - r * 0.55, hy - r * 0.85)} ${pt(hd.tip - r * 0.35, hy - r * 0.05)} Z`), pal.accent, line, 1.4));
  if (f.has('headfeathers')) headParts.push(K.solid(P(`M ${pt(hx - r * 0.6, hy - r * 0.55)} q -4 -14 6 -18 q -1 8 4 10 q 0 -12 10 -12 q -5 9 -2 16 z`), light(pal.accent, 0.1), line, 1.3));
  if (f.has('skullhelm')) headParts.push(K.solid(P(`M ${pt(hx - r * 1.05, hy - r * 0.1)} Q ${pt(hx - r * 0.9, hy - r * 1.25)} ${pt(hx + r * 0.3, hy - r * 1.1)} Q ${pt(hx + r * 1.2, hy - r * 0.95)} ${pt(hx + r * 1.35, hy - r * 0.35)} L ${pt(hx + r * 0.55, hy - r * 0.45)} Q ${pt(hx - r * 0.1, hy - r * 0.6)} ${pt(hx - r * 1.05, hy - r * 0.1)} Z`), K.vol('#e9e1cb', hx, hy - r, r * 1.5), dark('#8a7e66', 0.4), 1.8));
  parts.push(pivot('c-head', jx, jy, head.attr, headParts));

  return {
    parts,
    anchors: { head: head.map(hx, hd.top), eye: head.map(...hd.eye), mouth: head.map(...hd.mouth), neck: [neckX + 6, neckY - 6], body: [bx, by], top: Math.min(head.map(hx, hd.top)[1], by - bry - (f.has('sail') ? 50 * F : 0)) },
  };
}

/* -------------------------------------------------------------------------- */
/* Sauropoden                                                                   */
/* -------------------------------------------------------------------------- */

function pillar(K, x, top, w, fill, line, cls) {
  return K.blob(cls, [T(`M ${pt(x, top)} L ${pt(x, 175)}`, w), E(x + 1, 178.5, w * 0.62, 5)], fill, line);
}

export function sauropod(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const stocky = f.has('stocky');
  const bx = 84, by = 124, brx = stocky ? 46 : 44, bry = stocky ? 33 : 30;
  const bodyFill = K.vol(pal.body, bx, by - 20, 70);
  const farFill = K.vol(dark(pal.body, 0.16), bx, by, 60);
  const parts = [];
  parts.push(pillar(K, bx + 22, by + 12, 15, farFill, line, 'c-leg l2'));
  parts.push(pillar(K, bx - 26, by + 12, 15, farFill, line, 'c-leg l3'));
  const whip = f.has('whip');
  parts.push(K.blob('c-tail', [P(`M ${pt(bx - brx * 0.7, by - bry * 0.5)} C ${pt(bx - brx - 20, by - bry * 0.4)} ${pt(22, by - 4)} ${pt(whip ? -2 : 8, by + (whip ? -14 : 6))} C ${pt(20, by + 16)} ${pt(bx - brx - 10, by + bry * 0.5)} ${pt(bx - brx * 0.5, by + bry * 0.7)} Z`)],
    bodyFill, line, { style: `transform-origin:${r1(bx - brx * 0.7)}px ${r1(by)}px` }));
  // Hals
  const neckLen = lerp(0.55, 1, (F - 0.42) / 0.58);
  const jx = bx + brx * 0.55 + 38 * neckLen, jy = by - bry * 0.4 - (stocky ? 44 : 62) * neckLen;
  parts.push(K.blob('c-torso', [E(bx, by, brx, bry, -3), T(`M ${pt(bx + brx * 0.55, by - bry * 0.35)} Q ${pt(bx + brx * 0.95, by - bry * 1.25)} ${pt(jx, jy)}`, stocky ? 22 : 17)], bodyFill, line));
  parts.push(h('ellipse', { cx: r1(bx + 6), cy: r1(by + bry * 0.4), rx: r1(brx * 0.62), ry: r1(bry * 0.42), fill: pal.belly, opacity: 0.95 }));
  parts.push(K.sheen(bx - 10, by - bry * 0.52, brx * 0.5, bry * 0.2));
  if (f.has('plates')) {
    for (let i = 0; i < 6; i++) parts.push(K.solid(E(bx - 30 + i * 12, by - bry * (0.8 + 0.15 * Math.sin(i / 5 * Math.PI)), 5.5 * F + 2, 4 * F + 1.5), pal.accent, line, 1.3));
  }
  if (f.has('spines')) {
    for (let i = 0; i < 7; i++) {
      const x = bx - 34 + i * 11;
      const y = by - bry * (0.78 + 0.18 * Math.sin(i / 6 * Math.PI));
      parts.push(K.solid(P(`M ${pt(x - 3, y + 2)} L ${pt(x, y - 6 * F - 2)} L ${pt(x + 3, y + 2)} Z`), pal.accent, line, 1.1));
    }
  }
  if (f.has('stripes')) {
    for (let i = 0; i < 4; i++) parts.push(h('path', { d: `M ${pt(bx - 20 + i * 12, by - bry * 0.85)} q 4 10 0 18`, stroke: pal.accent, 'stroke-width': 3.4, 'stroke-linecap': 'round', fill: 'none', opacity: 0.55 }));
  }
  parts.push(pillar(K, bx + 30, by + 14, 16, bodyFill, line, 'c-leg l1'));
  parts.push(pillar(K, bx - 18, by + 14, 17, bodyFill, line, 'c-leg l4'));
  parts.push(K.claws([[bx + 28, 181, 1], [bx + 33, 181, 1], [bx - 20, 181, 1], [bx - 15, 181, 1]], line, '#efe6d2', 2.6));
  const H = form.head;
  const head = around(jx, jy, H);
  const hd = profileHead(ctx, { cx: jx + 8, cy: jy - 8, r: 18, snoutLen: 0.8, snoutH: 0.85, eyeR: 18 * 0.4 });
  parts.push(pivot('c-head', jx, jy, head.attr, hd.parts));
  return { parts, anchors: { head: head.map(jx + 8, hd.top), eye: head.map(...hd.eye), mouth: head.map(...hd.mouth), neck: [jx - 6, jy + 12], body: [bx, by], top: head.map(jx, hd.top)[1] } };
}

/* -------------------------------------------------------------------------- */
/* Vierbeinige Reptilien & Krokodile                                           */
/* -------------------------------------------------------------------------- */

function stubLeg(K, x, top, bottom, w, fill, line, cls, foot = true) {
  return K.blob(cls, [T(`M ${pt(x, top)} L ${pt(x + 1, bottom - 3)}`, w), foot ? E(x + 3, bottom, w * 0.72, 4.8) : null], fill, line);
}

export function quad(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const lizard = f.has('lizard');
  const small = f.has('small');
  const bx = 90, by = lizard ? 142 : 130;
  const brx = lizard ? 44 : small ? 36 : 42, bry = lizard ? 20 : small ? 23 : 27;
  const legTop = by + bry * 0.35;
  const bodyFill = K.vol(pal.body, bx + 4, by - 16, 64);
  const farFill = K.vol(dark(pal.body, 0.16), bx, by, 60);
  const parts = [];
  parts.push(stubLeg(K, bx + 22, legTop, 181, 12, farFill, line, 'c-leg l2'));
  parts.push(stubLeg(K, bx - 30, legTop, 181, 13, farFill, line, 'c-leg l3'));
  // Schwanz
  const tail = lizard ? 1.25 : 1;
  const tipX = bx - brx - 40 * tail, tipY = by + (lizard ? 10 : 8);
  if (f.has('chameleon')) {
    parts.push(K.blob('c-tail', [T(`M ${pt(bx - brx * 0.8, by + 2)} C ${pt(bx - brx - 24, by + 2)} ${pt(bx - brx - 26, by + 30)} ${pt(bx - brx - 12, by + 28)}`, 12), C(bx - brx - 10, by + 20, 7)], bodyFill, line, { style: `transform-origin:${r1(bx - brx * 0.8)}px ${r1(by)}px` }));
  } else {
    parts.push(K.blob('c-tail', [P(`M ${pt(bx - brx * 0.7, by - bry * 0.55)} C ${pt(bx - brx - 16, by - bry * 0.3)} ${pt(tipX + 18, tipY - 6)} ${pt(tipX, tipY)} C ${pt(tipX + 18, tipY + 8)} ${pt(bx - brx - 6, by + bry * 0.6)} ${pt(bx - brx * 0.5, by + bry * 0.72)} Z`)],
      bodyFill, line, { style: `transform-origin:${r1(bx - brx * 0.7)}px ${r1(by)}px` }));
  }
  if (f.has('glowtail')) parts.push(K.glow(pal.glow || pal.accent, tipX + 6, tipY, 16, 0.95), K.solid(C(tipX + 6, tipY, 5), light(pal.accent, 0.4), line, 1.2));
  if (f.has('club')) parts.push(K.blob('c-club', [C(tipX + 4, tipY, 10 * F + 3)], K.vol(pal.accent, tipX, tipY - 4, 14), line), K.claws([[tipX - 4, tipY - 8, -1], [tipX - 6, tipY + 6, -1]], line, '#efe6d2', 3));
  if (f.has('thago')) {
    for (const [dx, dy, a] of [[18, -6, -130], [26, -3, -110], [18, 6, 130]]) {
      const x = tipX + dx, y = tipY + dy;
      const rad = a * Math.PI / 180;
      parts.push(K.solid(P(`M ${pt(x - 3, y)} L ${pt(x + Math.cos(rad) * 14 * F, y + Math.sin(rad) * 14 * F)} L ${pt(x + 3, y)} Z`), '#efe6d2', line, 1.2));
    }
  }
  // Rückenschmuck hinter dem Körper
  if (f.has('sail')) {
    const sh = 40 * F + 8;
    parts.push(K.solid(P(`M ${pt(bx - 28, by - bry * 0.6)} C ${pt(bx - 24, by - bry - sh)} ${pt(bx + 18, by - bry - sh)} ${pt(bx + 26, by - bry * 0.6)} Z`), K.lin(light(pal.accent, 0.2), dark(pal.accent, 0.1), by - bry - sh, by), line, 1.8));
    for (let i = 0; i < 5; i++) parts.push(h('path', { d: `M ${pt(bx - 20 + i * 10, by - bry * 0.55)} L ${pt(bx - 20 + i * 10, by - bry - sh * (0.55 + 0.3 * Math.sin((i + 0.5) / 5 * Math.PI)))}`, stroke: dark(pal.accent, 0.3), 'stroke-width': 1.3, opacity: 0.6 }));
  }
  if (f.has('plates')) {
    for (let i = 0; i < 5; i++) {
      const x = bx - 30 + i * 14, y = by - bry * (0.72 + 0.25 * Math.sin((i + 0.3) / 4.6 * Math.PI));
      const s = (9 + 7 * Math.sin((i + 0.3) / 4.6 * Math.PI)) * F + 3;
      parts.push(K.solid(P(`M ${pt(x - s * 0.55, y + 4)} L ${pt(x - s * 0.5, y - s * 0.45)} L ${pt(x, y - s * 1.05)} L ${pt(x + s * 0.5, y - s * 0.45)} L ${pt(x + s * 0.55, y + 4)} Z`), K.vol(pal.accent, x, y - s * 0.6, s * 1.2), line, 1.6));
    }
  }
  if (f.has('spikes')) {
    for (let i = 0; i < 6; i++) {
      const x = bx - 32 + i * 12, y = by - bry * (0.75 + 0.2 * Math.sin((i + 0.3) / 5.6 * Math.PI));
      parts.push(K.solid(P(`M ${pt(x - 3, y + 3)} L ${pt(x + 2, y - 14 * F - 3)} L ${pt(x + 4, y + 3)} Z`), '#efe6d2', line, 1.2));
    }
  }
  if (f.has('thorns') || f.has('lava')) {
    for (let i = 0; i < 7; i++) {
      const x = bx - 34 + i * 11, y = by - bry * (0.8 + 0.15 * Math.sin(i / 6 * Math.PI));
      parts.push(K.solid(P(`M ${pt(x - 4, y + 3)} L ${pt(x, y - 9 * F - 2)} L ${pt(x + 4, y + 3)} Z`), f.has('lava') ? '#3d3533' : pal.accent, line, 1.2));
    }
  }
  // Rumpf
  parts.push(K.blob('c-torso', [E(bx, by, brx, bry, -2)], bodyFill, line));
  parts.push(h('ellipse', { cx: r1(bx + 6), cy: r1(by + bry * 0.45), rx: r1(brx * 0.7), ry: r1(bry * 0.38), fill: pal.belly, opacity: 0.95 }));
  parts.push(K.sheen(bx - 8, by - bry * 0.5, brx * 0.5, bry * 0.2));
  if (f.has('armor')) {
    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      parts.push(K.solid(E(bx - 22 + col * 20 + row * 4, by - bry * 0.55 + row * 11, 7, 4.5), light(pal.accent, 0.15), line, 1.1));
    }
    for (const x of [bx - 36, bx - 12, bx + 14, bx + 34]) parts.push(K.solid(P(`M ${pt(x - 4, by + 6)} L ${pt(x - 1, by + 16)} L ${pt(x + 4, by + 6)} Z`), '#efe6d2', line, 1.1));
  }
  if (f.has('lava')) {
    parts.push(h('path', { d: `M ${pt(bx - 26, by - 4)} l 10 6 l 8 -8 l 12 10 l 10 -6 M ${pt(bx - 10, by + 10)} l 8 -4 l 10 6`, stroke: pal.accent, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', class: 'c-glowline' }));
  }
  if (f.has('glider')) parts.push(K.solid(P(`M ${pt(bx - 30, by + 4)} Q ${pt(bx - 6, by + bry + 14)} ${pt(bx + 24, by + 6)} Q ${pt(bx - 4, by + 12)} ${pt(bx - 30, by + 4)} Z`), K.lin(light(pal.accent, 0.2), pal.accent, by, by + bry), line, 1.3));
  parts.push(stubLeg(K, bx + 30, legTop + 2, 182, 13, bodyFill, line, 'c-leg l1'));
  parts.push(stubLeg(K, bx - 22, legTop + 2, 182, 14, bodyFill, line, 'c-leg l4'));
  parts.push(K.claws([[bx + 34, 184, 1], [bx + 38, 183.5, 1], [bx - 18, 184, 1], [bx - 14, 183.5, 1]], line, '#efe6d2', 2.5));

  // Kopf
  const H = form.head;
  const big = f.has('bighead');
  const jx = bx + brx * 0.85, jy = by - bry * 0.25;
  const head = around(jx, jy, H);
  const r = big ? 25 : small ? 20 : lizard ? 19 : 22;
  const hx = jx + 14, hy = jy - (lizard ? 4 : 8);
  const hd = profileHead(ctx, {
    cx: hx, cy: hy, r, snoutLen: lizard ? 1.15 : big ? 0.75 : 0.9, snoutH: lizard ? 0.8 : 1,
    teeth: f.has('teeth'), eyeR: r * (f.has('chameleon') ? 0.46 : 0.38),
    beak: f.has('horns3') || f.has('frill') ? { color: dark(pal.body, 0.35), len: 0.62, hook: true } : null,
  });
  const headParts = [];
  if (f.has('frill')) {
    const fr = 30 * F + 10;
    headParts.push(K.solid(P(`M ${pt(hx - 4, hy + r * 0.5)} C ${pt(hx - fr * 1.2, hy + r * 0.2)} ${pt(hx - fr * 1.05, hy - fr * 1.3)} ${pt(hx + 2, hy - fr * 0.95)} C ${pt(hx + 6, hy - fr * 0.4)} ${pt(hx + 2, hy)} ${pt(hx - 4, hy + r * 0.5)} Z`), K.vol(pal.accent, hx - fr * 0.4, hy - fr * 0.4, fr * 1.3), line, 2));
    for (let i = 0; i < 5; i++) {
      const a = (-170 + i * 30) * Math.PI / 180;
      headParts.push(h('circle', { cx: r1(hx - fr * 0.45 + Math.cos(a) * fr * 0.72), cy: r1(hy - fr * 0.35 + Math.sin(a) * fr * 0.72), r: 2.6, fill: light(pal.accent, 0.4) }));
    }
  }
  headParts.push(...hd.parts);
  if (f.has('horns3')) {
    const hl = 22 * F + 5;
    headParts.push(K.solid(P(`M ${pt(hx + 2, hy - r * 0.6)} Q ${pt(hx + hl * 0.6, hy - r * 0.8 - hl * 0.3)} ${pt(hx + hl * 1.25, hy - r * 0.95 - hl * 0.15)} Q ${pt(hx + hl * 0.5, hy - r * 0.45)} ${pt(hx + 8, hy - r * 0.32)} Z`), '#f1e6cc', line, 1.5));
    headParts.push(K.solid(P(`M ${pt(hd.tip - r * 0.6, hy - r * 0.1)} Q ${pt(hd.tip - r * 0.35, hy - r * 0.55)} ${pt(hd.tip - r * 0.1, hy - r * 0.62)} Q ${pt(hd.tip - r * 0.25, hy - r * 0.2)} ${pt(hd.tip - r * 0.2, hy)} Z`), '#f1e6cc', line, 1.3));
  }
  if (f.has('nasal')) headParts.push(K.solid(E(hd.tip - r * 0.5, hy - r * 0.3, r * 0.34, r * 0.22), light(pal.accent, 0.1), line, 1.4));
  if (f.has('tusks')) headParts.push(K.solid(P(`M ${pt(hd.tip - r * 0.45, hy + r * 0.45)} q 4 10 -2 14 q 1 -7 -3 -12 z`), '#f7efdc', line, 1.1));
  if (f.has('chameleon')) headParts.push(K.solid(P(`M ${pt(hx - r * 0.5, hy - r * 0.7)} Q ${pt(hx - r * 0.1, hy - r * 1.5)} ${pt(hx + r * 0.5, hy - r * 0.75)} Z`), pal.accent, line, 1.4));
  if (f.has('lava')) headParts.push(K.solid(P(`M ${pt(hx - r * 0.4, hy - r * 0.8)} l 6 -8 l 4 7 l 5 -9 l 3 10 z`), '#3d3533', line, 1.2));
  parts.push(pivot('c-head', jx, jy, head.attr, headParts));
  return { parts, anchors: { head: head.map(hx, hd.top), eye: head.map(...hd.eye), mouth: head.map(...hd.mouth), neck: [jx - 4, jy + 2], body: [bx, by], top: Math.min(head.map(hx, hd.top)[1], by - bry - (f.has('sail') ? 45 * F : f.has('plates') ? 18 * F : 0)) } };
}

export function croc(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const tall = f.has('tall');
  const heavy = f.has('heavy');
  const bx = 92, by = tall ? 132 : 148;
  const brx = heavy ? 52 : 46, bry = tall ? 22 : 18;
  const bodyFill = K.vol(pal.body, bx, by - 12, 70);
  const farFill = K.vol(dark(pal.body, 0.16), bx, by, 60);
  const parts = [];
  const legTop = by + bry * 0.3;
  parts.push(stubLeg(K, bx + 22, legTop, 181, 11, farFill, line, 'c-leg l2'));
  parts.push(stubLeg(K, bx - 28, legTop, 181, 12, farFill, line, 'c-leg l3'));
  parts.push(K.blob('c-tail', [P(`M ${pt(bx - brx * 0.7, by - bry * 0.6)} C ${pt(bx - brx - 20, by - bry * 0.4)} ${pt(22, by + 4)} ${pt(-2, by + 16)} C ${pt(24, by + 22)} ${pt(bx - brx - 10, by + bry * 0.8)} ${pt(bx - brx * 0.5, by + bry * 0.8)} Z`)],
    bodyFill, line, { style: `transform-origin:${r1(bx - brx * 0.7)}px ${r1(by)}px` }));
  parts.push(K.blob('c-torso', [E(bx, by, brx, bry, -2)], bodyFill, line));
  parts.push(h('ellipse', { cx: r1(bx + 4), cy: r1(by + bry * 0.5), rx: r1(brx * 0.72), ry: r1(bry * 0.34), fill: pal.belly, opacity: 0.9 }));
  for (let i = 0; i < 8; i++) parts.push(K.solid(E(bx - 50 + i * 12, by - bry * 0.78 + Math.abs(i - 4) * 0.8, 3.6, 2.4), dark(pal.body, 0.25), line, 0.9));
  parts.push(K.sheen(bx - 8, by - bry * 0.45, brx * 0.45, bry * 0.2));
  parts.push(stubLeg(K, bx + 30, legTop + 2, 182, 12, bodyFill, line, 'c-leg l1'));
  parts.push(stubLeg(K, bx - 20, legTop + 2, 182, 13, bodyFill, line, 'c-leg l4'));
  parts.push(K.claws([[bx + 34, 184, 1], [bx + 38, 183.5, 1], [bx - 16, 184, 1], [bx - 12, 183.5, 1]], line, '#efe6d2', 2.5));
  const H = form.head;
  const jx = bx + brx * 0.82, jy = by - bry * 0.3;
  const head = around(jx, jy, H);
  const r = heavy ? 21 : 19;
  const hx = jx + 10, hy = jy - 6;
  const hd = profileHead(ctx, { cx: hx, cy: hy, r, snoutLen: 1.85, snoutH: 0.62, teeth: true, eyeR: r * 0.4 });
  const headParts = [...hd.parts];
  if (f.has('tusks')) headParts.push(K.solid(P(`M ${pt(hx + r * 0.9, hy + r * 0.25)} q 3 -10 -3 -14 q 1 7 -1 12 z`), '#f7efdc', line, 1.1));
  parts.push(pivot('c-head', jx, jy, head.attr, headParts));
  return { parts, anchors: { head: head.map(hx, hd.top), eye: head.map(...hd.eye), mouth: head.map(...hd.mouth), neck: [jx - 4, jy], body: [bx, by], top: head.map(hx, hd.top)[1] } };
}

/* -------------------------------------------------------------------------- */
/* Säugetiere                                                                   */
/* -------------------------------------------------------------------------- */

const MUZZLE = {
  dog: { len: 1, h: 0.95 }, fox: { len: 1.12, h: 0.8 }, cat: { len: 0.62, h: 0.9 }, bear: { len: 0.78, h: 1 },
  horse: { len: 1.3, h: 1.05 }, pig: { len: 0.8, h: 1 }, flat: { len: 0.42, h: 1 }, rat: { len: 1.05, h: 0.8 },
  elephant: { len: 0.8, h: 1.05 }, beaver: { len: 0.72, h: 0.95 }, deer: { len: 1.1, h: 0.9 }, camel: { len: 1.15, h: 0.95 },
};

function muzzleKind(f) {
  if (f.has('elephant')) return 'elephant';
  if (f.has('horse') || f.has('unicornhorn')) return 'horse';
  if (f.has('deer')) return 'deer';
  if (f.has('camel')) return 'camel';
  if (f.has('boar')) return 'pig';
  if (f.has('pug')) return 'flat';
  if (f.has('rat') || f.has('jerboa') || f.has('weasel')) return 'rat';
  if (f.has('beaver')) return 'beaver';
  if (f.has('fox')) return 'fox';
  if (f.has('cat') || f.has('ferox') || f.has('shinehorn') || f.has('rabbit')) return 'cat';
  if (f.has('bear') || f.has('otter') || f.has('bison') || f.has('rhino') || f.has('glyptodont') || f.has('sheep')) return 'bear';
  return 'dog';
}

function ears(K, f, cx, cy, r, fill, inner, line, F) {
  const out = [];
  if (f.has('earslong')) {
    for (const [dx, rot] of [[-0.55, -18], [-0.1, 8]]) out.push(K.blob('c-ear', [E(cx + r * dx, cy - r * 1.35, r * 0.28, r * 0.72, rot)], fill, line), h('ellipse', { cx: r1(cx + r * dx), cy: r1(cy - r * 1.3), rx: r1(r * 0.13), ry: r1(r * 0.5), fill: inner, transform: `rotate(${rot} ${r1(cx + r * dx)} ${r1(cy - r * 1.3)})`, opacity: 0.9 }));
  } else if (f.has('earsbig')) {
    out.push(K.blob('c-ear', [E(cx - r * 0.55, cy + r * 0.05, r * 0.62, r * 0.78, -10)], fill, line), h('ellipse', { cx: r1(cx - r * 0.55), cy: r1(cy + r * 0.05), rx: r1(r * 0.4), ry: r1(r * 0.55), fill: inner, opacity: 0.7, transform: `rotate(-10 ${r1(cx - r * 0.55)} ${r1(cy + r * 0.05)})` }));
  } else if (f.has('earsround')) {
    for (const dx of [-0.62, -0.05]) out.push(K.blob('c-ear', [C(cx + r * dx, cy - r * 0.82, r * 0.3)], fill, line), h('circle', { cx: r1(cx + r * dx), cy: r1(cy - r * 0.8), r: r1(r * 0.16), fill: inner, opacity: 0.9 }));
  } else if (f.has('earspointy')) {
    for (const [dx, lean] of [[-0.72, -0.25], [-0.12, 0.15]]) {
      const bx = cx + r * dx, by = cy - r * 0.62, tip = r * (f.has('lynx') ? 1.05 : 0.85);
      out.push(K.blob('c-ear', [P(`M ${pt(bx - r * 0.3, by + 4)} Q ${pt(bx + lean * r - r * 0.05, by - tip * 0.8)} ${pt(bx + lean * r, by - tip)} Q ${pt(bx + lean * r + r * 0.12, by - tip * 0.6)} ${pt(bx + r * 0.32, by + 4)} Z`)], fill, line));
      out.push(h('path', { d: `M ${pt(bx - r * 0.14, by + 1)} Q ${pt(bx + lean * r * 0.8, by - tip * 0.6)} ${pt(bx + lean * r * 0.9, by - tip * 0.72)} Q ${pt(bx + lean * r + r * 0.05, by - tip * 0.4)} ${pt(bx + r * 0.16, by + 1)} Z`, fill: inner, opacity: 0.85 }));
      if (f.has('lynx')) out.push(h('path', { d: `M ${pt(bx + lean * r, by - tip)} l ${r1(lean * 6)} -7`, stroke: line, 'stroke-width': 2, 'stroke-linecap': 'round' }));
    }
  }
  return out;
}

function mammalHead(ctx, o) {
  const { K, pal, f, form } = ctx;
  const F = form.feat;
  const { cx, cy, r } = o;
  const line = pal.line;
  const kind = o.kind || muzzleKind(f);
  const mz = MUZZLE[kind];
  const skinCol = o.skin || pal.body;
  const skin = K.vol(skinCol, cx - r * 0.3, cy - r * 0.4, r * 2.4);
  const muzzleCol = o.muzzle || pal.belly;
  const mx = cx + r * (0.62 + 0.25 * mz.len), my = cy + r * 0.3;
  const back = [];
  const front = [];
  back.push(...ears(K, f, cx, cy, r, skin, light(pal.accent, 0.35), line, F));
  if (f.has('mane') && !o.noMane) {
    const mc = f.has('lion') ? pal.extra : pal.accent;
    if (f.has('lion') || f.has('fire')) {
      for (let i = 0; i < 9; i++) {
        const a = (110 + i * 30) * Math.PI / 180;
        back.push(K.solid(E(cx - r * 0.1 + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95, r * 0.42, r * 0.3, i * 30), f.has('fire') ? (i % 2 ? pal.accent : light(pal.accent, 0.35)) : K.vol(mc, cx, cy - r, r * 2), line, 1.3));
      }
    }
  }
  const shapes = [kind === 'horse' || kind === 'camel' ? E(cx, cy, r * 1.02, r * 0.88, -8) : C(cx, cy, r)];
  shapes.push(E(mx, my, r * 0.5 * mz.len + r * 0.12, r * 0.42 * mz.h));
  back.push(K.blob('c-skull', shapes, skin, line));
  const face = [];
  face.push(h('ellipse', { cx: r1(mx + r * 0.05), cy: r1(my + r * 0.06), rx: r1(r * 0.46 * mz.len + r * 0.08), ry: r1(r * 0.34 * mz.h), fill: muzzleCol, opacity: 0.95 }));
  face.push(K.sheen(cx - r * 0.3, cy - r * 0.5, r * 0.42, r * 0.2));
  const tipX = mx + r * 0.5 * mz.len + r * 0.1;
  if (kind === 'pig') face.push(K.solid(E(tipX - 2, my - 1, r * 0.2, r * 0.26), light(pal.accent, 0.5), line, 1.3), h('ellipse', { cx: r1(tipX - 3), cy: r1(my - 3), rx: 1.3, ry: 2, fill: line }), h('ellipse', { cx: r1(tipX - 1), cy: r1(my + 3), rx: 1.3, ry: 2, fill: line }));
  else if (kind !== 'elephant') face.push(h('ellipse', { cx: r1(tipX - r * 0.08), cy: r1(my - r * 0.14), rx: r1(r * 0.13), ry: r1(r * 0.09), fill: dark(pal.body, 0.6) }), h('ellipse', { cx: r1(tipX - r * 0.1), cy: r1(my - r * 0.18), rx: r1(r * 0.05), ry: r1(r * 0.03), fill: '#ffffff', opacity: 0.7 }));
  if (kind === 'rat' || kind === 'cat' || f.has('whiskers')) {
    for (const dy of [-2, 2]) face.push(h('path', { d: `M ${pt(mx, my + dy)} l 16 ${dy * 2}`, stroke: line, 'stroke-width': 0.9, opacity: 0.6 }));
  }
  const ex = cx + r * 0.3, ey = cy - r * 0.12;
  face.push(K.blush(ex + r * 0.28, ey + r * 0.55, r * 0.2));
  const mouthY = my + r * 0.24 * mz.h;
  const teeth = [];
  front.push(K.mouth(kind === 'cat' || kind === 'flat'
    ? `M ${pt(tipX - r * 0.22, mouthY - r * 0.06)} q ${r1(r * 0.08)} ${r1(r * 0.12)} ${r1(r * 0.16)} 0 q ${r1(r * 0.08)} ${r1(r * 0.12)} ${r1(r * 0.16)} 0`
    : `M ${pt(tipX - r * 0.1, mouthY - r * 0.04)} Q ${pt(mx - r * 0.05, mouthY + r * 0.12)} ${pt(cx + r * 0.35, mouthY - r * 0.04)}`,
  { open: [mx + r * 0.05, mouthY + r * 0.08, r * 0.24, r * 0.2], line, teeth }));
  if (f.has('saber')) front.push(K.solid(P(`M ${pt(mx - 2, mouthY)} q 2 ${r1(10 * F + 6)} -1 ${r1(14 * F + 6)} q -2 ${r1(-8)} -3 ${r1(-13 * F - 5)} z`), '#fbf4e2', line, 1.1), K.solid(P(`M ${pt(mx + 5, mouthY)} q 2 ${r1(9 * F + 5)} -1 ${r1(12 * F + 5)} q -2 -7 -3 ${r1(-11 * F - 4)} z`), '#fbf4e2', line, 1.1));
  if (kind === 'beaver') front.push(K.solid(P(`M ${pt(tipX - 7, mouthY - 1)} h 7 v 6 h -7 z`), '#fff7e0', line, 1));
  if (kind === 'elephant') {
    const tl = f.has('trunkshort') ? 0.55 : 1;
    front.push(K.blob('c-trunk', [T(`M ${pt(mx, my)} Q ${pt(mx + r * 0.7 * tl, my + r * 0.3)} ${pt(mx + r * 0.55 * tl, my + r * (1.1 * tl + 0.1))} Q ${pt(mx + r * 0.45 * tl, my + r * (1.35 * tl + 0.1))} ${pt(mx + r * 0.2 * tl, my + r * (1.2 * tl + 0.1))}`, r * 0.3)], skin, line));
    if (f.has('tusks')) front.push(K.solid(P(`M ${pt(mx - r * 0.2, my + r * 0.25)} Q ${pt(mx + r * 0.7, my + r * 0.9)} ${pt(mx + r * 1.2, my + r * 0.25)} Q ${pt(mx + r * 0.7, my + r * 0.62)} ${pt(mx - r * 0.1, my + r * 0.05)} Z`), '#fbf4e2', line, 1.4));
    if (f.has('tusksdown')) front.push(K.solid(P(`M ${pt(mx - r * 0.1, my + r * 0.4)} Q ${pt(mx + r * 0.1, my + r * 1.1)} ${pt(mx - r * 0.35, my + r * 1.3)} Q ${pt(mx - r * 0.05, my + r * 1.0)} ${pt(mx - r * 0.3, my + r * 0.4)} Z`), '#fbf4e2', line, 1.3));
  }
  if (f.has('tusks') && kind === 'pig') front.push(K.solid(P(`M ${pt(tipX - r * 0.35, mouthY + 1)} q 5 -3 5 -12 q -3 6 -8 9 z`), '#fbf4e2', line, 1.1));
  // Kopfschmuck
  const horn = '#f3e7cd';
  if (f.has('unicornhorn')) front.push(K.solid(P(`M ${pt(cx + r * 0.1, cy - r * 0.78)} L ${pt(cx + r * 0.75, cy - r * 1.9 * (0.5 + F * 0.5))} L ${pt(cx + r * 0.42, cy - r * 0.68)} Z`), K.lin(pal.extra, light(pal.extra, 0.5), cy - r * 1.9, cy - r * 0.6), line, 1.4));
  if (f.has('glowhorn')) front.push(K.glow(pal.glow || pal.accent, cx + r * 0.5, cy - r * 1.35, r * 0.9, 0.8), K.solid(P(`M ${pt(cx + r * 0.1, cy - r * 0.78)} Q ${pt(cx + r * 0.4, cy - r * 1.6)} ${pt(cx + r * 0.7, cy - r * 1.45)} Q ${pt(cx + r * 0.5, cy - r * 1.1)} ${pt(cx + r * 0.45, cy - r * 0.7)} Z`), light(pal.accent, 0.3), line, 1.3));
  if (f.has('rhinohorns')) front.push(K.solid(P(`M ${pt(tipX - r * 0.5, my - r * 0.3)} Q ${pt(tipX - r * 0.1, my - r * 1.3 * F - r * 0.3)} ${pt(tipX + r * 0.2, my - r * 1.2 * F - r * 0.35)} Q ${pt(tipX - r * 0.05, my - r * 0.5)} ${pt(tipX - r * 0.05, my - r * 0.28)} Z`), horn, line, 1.4), K.solid(P(`M ${pt(tipX - r * 0.95, my - r * 0.5)} q 4 -12 10 -12 q -3 6 -2 11 z`), horn, line, 1.2));
  if (f.has('bullhorns')) front.push(K.solid(P(`M ${pt(cx - r * 0.3, cy - r * 0.7)} Q ${pt(cx - r * 0.2, cy - r * 1.45)} ${pt(cx + r * 0.55, cy - r * 1.5)} Q ${pt(cx + r * 0.1, cy - r * 1.15)} ${pt(cx + r * 0.2, cy - r * 0.8)} Z`), horn, line, 1.4));
  if (f.has('rabbithorns')) for (const dx of [-0.35, 0.1]) front.push(K.solid(P(`M ${pt(cx + r * dx, cy - r * 0.85)} q ${r1(r * 0.1)} ${r1(-r * 0.7)} ${r1(r * 0.35)} ${r1(-r * 0.75)} q ${r1(-r * 0.15)} ${r1(r * 0.35)} ${r1(-r * 0.12)} ${r1(r * 0.78)} z`), horn, line, 1.2));
  if (f.has('antlers')) {
    const s = 0.4 + F * 0.6;
    for (const [dx, sc] of [[-0.35, 0.85], [0.1, 1]]) {
      const x0 = cx + r * dx, y0 = cy - r * 0.8, k = s * sc;
      front.push(h('path', { d: `M ${pt(x0, y0)} Q ${pt(x0 - 10 * k, y0 - 26 * k)} ${pt(x0 + 6 * k, y0 - 46 * k)} M ${pt(x0 - 4 * k, y0 - 22 * k)} l ${r1(-14 * k)} ${r1(-8 * k)} M ${pt(x0 + 1 * k, y0 - 36 * k)} l ${r1(12 * k)} ${r1(-6 * k)} M ${pt(x0 - 2 * k, y0 - 12 * k)} l ${r1(12 * k)} ${r1(-10 * k)}`, stroke: line, 'stroke-width': 6.5, fill: 'none', 'stroke-linecap': 'round' }));
      front.push(h('path', { d: `M ${pt(x0, y0)} Q ${pt(x0 - 10 * k, y0 - 26 * k)} ${pt(x0 + 6 * k, y0 - 46 * k)} M ${pt(x0 - 4 * k, y0 - 22 * k)} l ${r1(-14 * k)} ${r1(-8 * k)} M ${pt(x0 + 1 * k, y0 - 36 * k)} l ${r1(12 * k)} ${r1(-6 * k)} M ${pt(x0 - 2 * k, y0 - 12 * k)} l ${r1(12 * k)} ${r1(-10 * k)}`, stroke: pal.extra, 'stroke-width': 3.4, fill: 'none', 'stroke-linecap': 'round' }));
    }
  }
  if (f.has('bulb')) front.push(h('path', { d: `M ${pt(cx - r * 0.1, cy - r * 0.9)} Q ${pt(cx + r * 0.3, cy - r * 1.7)} ${pt(cx + r * 0.75, cy - r * 1.55)}`, stroke: line, 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round' }), K.glow(pal.glow || pal.accent, cx + r * 0.8, cy - r * 1.5, r * 0.8, 0.9), K.solid(C(cx + r * 0.8, cy - r * 1.5, r * 0.22), light(pal.accent, 0.3), line, 1.2));
  if (f.has('icespikes')) for (let i = 0; i < 3; i++) front.push(K.solid(P(`M ${pt(cx - r * 0.6 + i * r * 0.35, cy - r * 0.8)} l ${r1(-r * 0.1)} ${r1(-r * 0.6 * F - 3)} l ${r1(r * 0.3)} ${r1(r * 0.55 * F + 3)} z`), light(pal.accent, 0.3), line, 1.1));
  if (f.has('plant')) front.push(K.solid(P(`M ${pt(cx - r * 0.5, cy - r * 0.75)} q -2 -14 10 -16 q -1 8 -6 16 z`), '#7fb04a', line, 1.1), K.solid(C(cx + r * 0.05, cy - r * 0.95, 4.5), pal.accent, line, 1));
  if (f.has('warts')) for (const [dx, dy] of [[0.1, 0.3], [0.45, 0.1], [0.3, 0.45]]) face.push(K.solid(C(cx + r * dx, cy + r * dy, 2.4), dark(pal.body, 0.1), line, 0.8));
  if (f.has('stripes')) for (let i = 0; i < 3; i++) face.push(h('path', { d: `M ${pt(cx - r * 0.55 + i * r * 0.28, cy - r * 0.95)} q 2 6 0 10`, stroke: pal.accent, 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none', opacity: 0.8 }));
  front.push(K.eye(ex, ey, r * (o.eyeScale || 0.36), { iris: pal.eye, skin: skinCol, line, glow: pal.eyeGlow }));
  return { back, face, front, eye: [ex, ey], mouth: [mx, mouthY], top: cy - r - (f.has('antlers') ? 30 * F : f.has('unicornhorn') ? 20 * F : 0), tip: tipX };
}

function mammalTail(K, f, x, y, fill, line, pal, F) {
  if (f.has('bushytail')) return K.blob('c-tail', [P(`M ${pt(x + 4, y - 6)} C ${pt(x - 24, y - 14)} ${pt(x - 44, y - 48)} ${pt(x - 26, y - 62)} C ${pt(x - 10, y - 50)} ${pt(x - 14, y - 26)} ${pt(x + 6, y + 6)} Z`)], fill, line, { style: `transform-origin:${r1(x)}px ${r1(y)}px` });
  if (f.has('thintail')) return K.blob('c-tail', [T(`M ${pt(x + 2, y)} C ${pt(x - 26, y + 4)} ${pt(x - 36, y - 26)} ${pt(x - 24, y - 38)}`, 6)], fill, line, { style: `transform-origin:${r1(x)}px ${r1(y)}px` });
  if (f.has('flattail')) return K.blob('c-tail', [E(x - 18, y + 16, 22, 8, 20)], K.vol(dark(pal.body, 0.35), x - 20, y + 10, 24), line, { style: `transform-origin:${r1(x)}px ${r1(y)}px` });
  if (f.has('shorttail')) return K.blob('c-tail', [E(x - 2, y - 2, 8, 6, -30)], fill, line, { style: `transform-origin:${r1(x)}px ${r1(y)}px` });
  if (f.has('scorpiontail')) return h('g', { class: 'c-tail', style: `transform-origin:${r1(x)}px ${r1(y)}px` },
    K.blob(null, [T(`M ${pt(x + 2, y)} C ${pt(x - 30, y + 6)} ${pt(x - 44, y - 40)} ${pt(x - 14, y - 58)}`, 9)], K.vol(pal.extra, x - 30, y - 30, 40), line),
    K.solid(P(`M ${pt(x - 18, y - 60)} q 16 -8 20 6 q -8 -2 -14 6 z`), '#f1e6cc', line, 1.3));
  return K.blob('c-tail', [T(`M ${pt(x + 2, y)} Q ${pt(x - 22, y + 6)} ${pt(x - 30, y - 14)}`, 9)], fill, line, { style: `transform-origin:${r1(x)}px ${r1(y)}px` });
}

function wings(K, kind, x, y, pal, line, F, far = false) {
  const s = 0.55 + 0.45 * F;
  const tint = far ? dark(pal.extra || pal.accent, 0.25) : pal.extra || pal.accent;
  if (kind === 'bird') {
    const d = `M ${pt(x, y)} C ${pt(x - 10 * s, y - 40 * s)} ${pt(x - 50 * s, y - 70 * s)} ${pt(x - 70 * s, y - 60 * s)} C ${pt(x - 62 * s, y - 50 * s)} ${pt(x - 70 * s, y - 42 * s)} ${pt(x - 60 * s, y - 34 * s)} C ${pt(x - 58 * s, y - 26 * s)} ${pt(x - 48 * s, y - 20 * s)} ${pt(x - 44 * s, y - 14 * s)} C ${pt(x - 34 * s, y - 6 * s)} ${pt(x - 20 * s, y + 4)} ${pt(x, y + 8)} Z`;
    return h('g', { class: 'c-wing' + (far ? ' far' : ''), style: `transform-origin:${r1(x)}px ${r1(y)}px` },
      K.solid(P(d), K.vol(tint, x - 30 * s, y - 40 * s, 70 * s), line, 2),
      h('path', { d: `M ${pt(x - 18 * s, y - 16 * s)} q -16 -8 -30 -30 M ${pt(x - 12 * s, y - 4)} q -20 -4 -40 -20`, stroke: dark(tint, 0.3), 'stroke-width': 1.3, fill: 'none', opacity: 0.6 }));
  }
  const d = `M ${pt(x, y)} L ${pt(x - 20 * s, y - 50 * s)} L ${pt(x - 66 * s, y - 62 * s)} Q ${pt(x - 60 * s, y - 42 * s)} ${pt(x - 64 * s, y - 28 * s)} Q ${pt(x - 50 * s, y - 30 * s)} ${pt(x - 44 * s, y - 14 * s)} Q ${pt(x - 30 * s, y - 16 * s)} ${pt(x - 22 * s, y + 2)} Q ${pt(x - 12 * s, y)} ${pt(x, y + 8)} Z`;
  return h('g', { class: 'c-wing' + (far ? ' far' : ''), style: `transform-origin:${r1(x)}px ${r1(y)}px` },
    K.solid(P(d), K.lin(light(tint, 0.15), dark(tint, 0.2), y - 62 * s, y + 8), line, 2),
    h('path', { d: `M ${pt(x - 2, y - 2)} L ${pt(x - 20 * s, y - 50 * s)} M ${pt(x - 20 * s, y - 50 * s)} L ${pt(x - 64 * s, y - 28 * s)} M ${pt(x - 20 * s, y - 50 * s)} L ${pt(x - 44 * s, y - 14 * s)} M ${pt(x - 20 * s, y - 50 * s)} L ${pt(x - 22 * s, y + 2)}`, stroke: dark(tint, 0.35), 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }));
}
export { wings, ears, mammalHead };

export function mammal(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const parts = [];
  const upright = f.has('kangaroo') || f.has('jerboa');
  const small = f.has('small');
  const big = f.has('elephant') || f.has('bison') || f.has('rhino');
  const long = f.has('otter') || f.has('weasel');
  const tall = f.has('horse') || f.has('deer') || f.has('camel') || f.has('longneck') || f.has('unicornhorn');
  const bx = upright ? 92 : 86;
  const by = upright ? 128 : long ? 150 : tall ? 118 : big ? 122 : small ? 138 : 128;
  const brx = upright ? 26 : long ? 46 : big ? 44 : small ? 30 : f.has('bear') ? 40 : 38;
  const bry = upright ? 32 : long ? 17 : big ? 31 : small ? 22 : f.has('bear') || f.has('sheep') ? 28 : 25;
  const bodyFill = K.vol(pal.body, bx, by - bry * 0.8, brx * 1.9);
  const farFill = K.vol(dark(pal.body, 0.16), bx, by, brx * 1.7);
  const legW = big ? 17 : tall ? 10.5 : small ? 10 : 12.5;
  const hoof = tall || f.has('bison') || f.has('camel');
  const legTop = by + bry * 0.3;
  const fx = bx + brx * 0.62, hx0 = bx - brx * 0.58;
  const legPart = (x, fill, cls, front) => {
    if (upright) return null;
    const shapes = [T(`M ${pt(x, legTop)} L ${pt(x + (front ? 2 : -1), 177)}`, legW)];
    if (!front && !big) shapes.push(E(x + 2, legTop + 6, legW * 0.95, bry * 0.55));
    if (!hoof) shapes.push(E(x + 4, 179.5, legW * 0.72, 4.6));
    const g = [K.blob(cls, shapes, fill, line)];
    if (hoof) g.push(K.solid(P(`M ${pt(x - legW * 0.5 + (front ? 2 : -1), 174)} h ${r1(legW)} l 1 7 h ${r1(-legW - 2)} z`), dark(pal.accent, 0.3), line, 1.2));
    return g;
  };
  parts.push(legPart(fx - 10, farFill, 'c-leg l2', true), legPart(hx0 - 8, farFill, 'c-leg l3', false));
  // Flügel hinten
  // Greif: Adlerflügel in Gefiederfarbe, das Gelb (extra) bleibt dem Schnabel
  const wingPal = f.has('griffin') ? { ...pal, extra: mix(pal.body, pal.accent, 0.5) } : pal;
  if (f.has('batwings') || f.has('griffin')) parts.push(wings(K, f.has('griffin') ? 'bird' : 'bat', bx + 4, by - bry * 0.6, wingPal, line, F, true));
  // Schwanz
  parts.push(mammalTail(K, f, bx - brx * 0.85, by - bry * 0.2, bodyFill, line, pal, F));
  if (f.has('shell') || f.has('glyptodont')) {
    parts.push(K.solid(P(`M ${pt(bx - brx - 4, by + bry * 0.25)} C ${pt(bx - brx - 2, by - bry * 1.6)} ${pt(bx + brx + 2, by - bry * 1.6)} ${pt(bx + brx + 4, by + bry * 0.25)} Z`), K.vol(pal.accent, bx - 10, by - bry, brx * 1.6), line, 2));
    for (let i = 0; i < 3; i++) parts.push(h('path', { d: `M ${pt(bx - brx + 6, by - bry * 0.1 - i * 12)} Q ${pt(bx, by - bry * 0.6 - i * 14)} ${pt(bx + brx - 6, by - bry * 0.1 - i * 12)}`, stroke: dark(pal.accent, 0.35), 'stroke-width': 1.5, fill: 'none', opacity: 0.7 }));
  }
  if (f.has('club')) {
    const cx = bx - brx - 24, cy = by - 4;
    parts.push(K.blob(null, [T(`M ${pt(bx - brx + 4, by)} L ${pt(cx, cy)}`, 8), C(cx, cy, 9)], K.vol(pal.accent, cx, cy - 6, 14), line), K.claws([[cx - 6, cy - 9, -1], [cx - 9, cy + 2, -1], [cx + 2, cy - 12, 1]], line, '#efe6d2', 3));
  }
  // Rumpf
  const bodyShapes = upright ? [E(bx, by, brx, bry, 10)] : [E(bx, by, brx, bry, -3)];
  if (f.has('hump') || f.has('camel')) bodyShapes.push(E(bx - (f.has('bison') ? -12 : 2), by - bry * 0.75, brx * 0.45, bry * 0.55));
  const neckLong = f.has('longneck') || f.has('camel');
  const jx = upright ? bx + brx * 0.3 : bx + brx * (tall ? 0.72 : 0.78);
  let jy = upright ? by - bry * 0.85 : by - bry * (tall ? 0.6 : 0.55);
  let headX = jx + 12, headY = jy - 12;
  if (tall) { headX = jx + 20; headY = jy - (neckLong ? 58 : 34); bodyShapes.push(T(`M ${pt(jx - 8, jy + 6)} L ${pt(headX - 6, headY + 8)}`, neckLong ? 16 : 20)); }
  if (f.has('wool') || f.has('sheep')) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      bodyShapes.push(C(bx + Math.cos(a) * brx * 0.78, by + Math.sin(a) * bry * 0.72, bry * 0.42));
    }
  }
  parts.push(K.blob('c-torso', bodyShapes, f.has('sheep') ? K.vol(pal.body, bx, by - bry, brx * 2) : bodyFill, line));
  if (!f.has('sheep')) parts.push(h('ellipse', { cx: r1(bx + (upright ? 8 : 6)), cy: r1(by + bry * (upright ? 0.15 : 0.42)), rx: r1(brx * (upright ? 0.55 : 0.62)), ry: r1(bry * (upright ? 0.62 : 0.4)), fill: pal.belly, opacity: 0.95 }));
  parts.push(K.sheen(bx - brx * 0.25, by - bry * 0.5, brx * 0.45, bry * 0.2));
  if (f.has('fluffy') || f.has('spikyfur')) {
    for (let i = 0; i < 6; i++) {
      const x = bx - brx * 0.75 + i * brx * 0.3, y = by - bry * (0.88 + 0.08 * Math.sin(i / 5 * Math.PI));
      parts.push(K.solid(P(`M ${pt(x - 5, y + 4)} Q ${pt(x - 1, y - (f.has('spikyfur') ? 14 : 8))} ${pt(x + 6, y + 3)} Z`), f.has('spikyfur') ? pal.accent : pal.body, line, 1.1));
    }
  }
  if (f.has('quills') || f.has('icespikes')) {
    for (let i = 0; i < 6; i++) {
      const x = bx - brx * 0.7 + i * brx * 0.28, y = by - bry * (0.86 + 0.1 * Math.sin(i / 5 * Math.PI));
      parts.push(K.solid(P(`M ${pt(x - 4, y + 3)} L ${pt(x - 6, y - 14 * F - 4)} L ${pt(x + 4, y + 3)} Z`), f.has('icespikes') ? light(pal.accent, 0.35) : pal.extra, line, 1.1));
    }
  }
  if (f.has('fire')) {
    for (let i = 0; i < 5; i++) {
      const x = bx - brx * 0.6 + i * brx * 0.3, y = by - bry * 0.85;
      parts.push(h('path', { class: 'c-flame', d: `M ${pt(x - 6, y + 4)} Q ${pt(x - 4, y - 10)} ${pt(x + 2, y - 16 * F - 6)} Q ${pt(x + 4, y - 6)} ${pt(x + 7, y + 4)} Z`, fill: i % 2 ? pal.accent : light(pal.accent, 0.4), stroke: dark(pal.accent, 0.4), 'stroke-width': 1, opacity: 0.95 }));
    }
  }
  if (f.has('plant')) {
    for (let i = 0; i < 4; i++) parts.push(K.solid(E(bx - brx * 0.6 + i * brx * 0.4, by - bry * 0.9, 9, 4.5, -20 + i * 14), i % 2 ? '#6fa846' : '#86bf52', line, 1.1));
    parts.push(K.solid(C(bx + 4, by - bry * 1.05, 4), pal.accent, line, 1));
  }
  if (f.has('stripes') && !f.has('cat')) for (let i = 0; i < 4; i++) parts.push(h('path', { d: `M ${pt(bx - brx * 0.5 + i * 11, by - bry * 0.95)} q 4 9 0 16`, stroke: pal.accent, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none', opacity: 0.75 }));
  if (f.has('stripes') && f.has('cat')) for (let i = 0; i < 4; i++) parts.push(h('path', { d: `M ${pt(bx - brx * 0.55 + i * 12, by - bry * 0.95)} q 5 8 1 15`, stroke: pal.accent, 'stroke-width': 3.2, 'stroke-linecap': 'round', fill: 'none', opacity: 0.8 }));
  if (f.has('spots')) for (const [dx, dy] of [[-0.4, -0.3], [0, -0.5], [0.3, -0.2], [-0.15, 0.05], [-0.6, 0]]) parts.push(h('ellipse', { cx: r1(bx + brx * dx), cy: r1(by + bry * dy), rx: 3.4, ry: 2.6, fill: pal.accent, opacity: 0.7 }));
  if (f.has('glider') || f.has('membrane')) parts.push(K.solid(P(`M ${pt(hx0, by + 4)} Q ${pt(bx, by + bry + 16)} ${pt(fx, by + 4)} Q ${pt(bx, by + 10)} ${pt(hx0, by + 4)} Z`), K.lin(light(pal.accent, 0.3), pal.accent, by, by + bry + 10), line, 1.3));
  // Vorderbeine
  parts.push(legPart(fx + 2, bodyFill, 'c-leg l1', true), legPart(hx0, bodyFill, 'c-leg l4', false));
  if (upright) {
    // Känguru-/Springmaus-Haltung: große Hinterbeine, kleine Arme
    parts.push(K.blob('c-leg l1', [E(bx - 8, by + bry * 0.6, 16, 20, -20), T(`M ${pt(bx - 4, by + bry * 0.8)} L ${pt(bx + 2, 176)}`, 10), E(bx + 12, 179, 16, 5)], bodyFill, line));
    parts.push(K.blob('c-arm', [T(`M ${pt(bx + brx * 0.55, by - bry * 0.3)} Q ${pt(bx + brx * 0.9, by)} ${pt(bx + brx * 0.8, by + 8)}`, 6.5)], bodyFill, line));
    parts.push(K.blob('c-tail', [T(`M ${pt(bx - brx * 0.6, by + bry * 0.6)} Q ${pt(bx - brx - 20, by + bry)} ${pt(bx - brx - 34, 178)}`, f.has('jerboa') ? 4 : 11)], bodyFill, line, { style: `transform-origin:${r1(bx - brx * 0.6)}px ${r1(by + bry * 0.6)}px` }));
    if (f.has('jerboa')) parts.push(K.solid(E(bx - brx - 36, 176, 6, 4), light(pal.accent, 0.4), line, 1));
  }
  if (!upright && !hoof && !f.has('elephant')) parts.push(K.claws([[fx + 8, 182, 1], [fx + 11, 181.5, 1], [hx0 + 6, 182, 1], [hx0 + 9, 181.5, 1]], line, '#f3eadb', 2.2));
  if (f.has('batwings') || f.has('griffin')) parts.push(wings(K, f.has('griffin') ? 'bird' : 'bat', bx + 8, by - bry * 0.55, wingPal, line, F));
  if (f.has('longarms')) parts.push(K.blob('c-arm', [T(`M ${pt(fx, by - 4)} Q ${pt(fx + 16, by + 20)} ${pt(fx + 12, 176)}`, 12)], bodyFill, line), K.claws([[fx + 14, 179, 1], [fx + 18, 178, 1]], line, '#f3eadb', 3.2));

  // Kopf(e)
  const H = form.head;
  const head = around(jx, jy, H);
  const r = f.has('rat') || long ? 20 : small ? 22 : big ? 24 : f.has('horse') ? 21 : 23;
  const griffin = f.has('griffin');
  const heads = f.has('threeheads') ? [[-16, -14, 0.8], [-6, -24, 0.86], [0, 0, 1]] : [[0, 0, 1]];
  let main = null;
  for (const [dx, dy, s] of heads) {
    const sub = { attr: `translate(${dx} ${dy}) ${around(headX, headY, s).attr}` };
    const hd = griffin
      ? profileHead(ctx, { cx: headX, cy: headY, r: r * 0.95, beak: { color: pal.extra, len: 0.7, hook: true }, eyeR: r * 0.36 })
      : mammalHead(ctx, { cx: headX, cy: headY, r, skin: f.has('sheep') ? pal.accent : undefined, muzzle: f.has('sheep') ? light(pal.accent, 0.12) : undefined });
    const group = griffin ? hd.parts : [...hd.back, ...hd.face, ...hd.front];
    parts.push(pivot(s === 1 ? 'c-head' : 'c-head c-subhead', jx, jy, `${head.attr} ${sub.attr}`, group));
    main = hd;
  }
  if (f.has('mane') && f.has('horse')) {
    const pts = [];
    for (let i = 0; i < 5; i++) pts.push([lerp(jx - 8, headX - 8, i / 4), lerp(jy + 4, headY - r * 0.6, i / 4)]);
    parts.splice(parts.length - 1, 0, h('g', { class: 'c-mane' }, pts.map(([x, y], i) => K.solid(E(x - 7, y, 9, 6, -40), i % 2 ? pal.accent : light(pal.accent, 0.2), line, 1.2))));
  }
  return {
    parts,
    anchors: { head: head.map(headX, main.top), eye: head.map(...main.eye), mouth: head.map(...main.mouth), neck: head.map(headX - r * 0.4, headY + r * 0.85), body: [bx, by], top: Math.min(head.map(headX, main.top)[1], by - bry) },
  };
}

/* -------------------------------------------------------------------------- */
/* Affen, Humanoide, Titanen, Golems                                           */
/* -------------------------------------------------------------------------- */

export function ape(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const small = f.has('small') || f.has('monkey');
  const giant = f.has('titan') || f.has('gorilla') || f.has('golem');
  const humanoid = f.has('humanoid') || f.has('snakehair') || f.has('undead') || f.has('corrupt');
  const bx = 100, by = small ? 140 : giant ? 124 : 130;
  const brx = small ? 24 : giant ? 37 : humanoid ? 25 : 31;
  const bry = small ? 26 : giant ? 37 : humanoid ? 32 : 33;
  const skin = f.has('golem') ? pal.body : pal.body;
  const bodyFill = K.vol(skin, bx - 8, by - bry * 0.6, bry * 2.3);
  const farFill = K.vol(dark(skin, 0.18), bx, by, bry * 2.1);
  const parts = [];
  if (f.has('monkey')) parts.push(K.blob('c-tail', [T(`M ${pt(bx - 8, by + 12)} C ${pt(bx - 52, by + 22)} ${pt(bx - 62, by - 28)} ${pt(bx - 38, by - 40)}`, 5)], bodyFill, line, { style: `transform-origin:${r1(bx - 8)}px ${r1(by + 12)}px` }));
  if (f.has('tree')) for (const [x, y, rot] of [[bx - 40, by - bry - 12, -30], [bx + 38, by - bry - 16, 30]]) parts.push(K.solid(P(`M ${pt(bx + (x < bx ? -brx * 0.6 : brx * 0.6), by - bry * 0.6)} L ${pt(x, y)}`), 'none', dark(pal.body, 0.2), 5), K.solid(C(x, y, 11), '#6fa846', dark('#6fa846', 0.5), 1.4));
  const shY = by - bry * 0.55;
  const armLen = small ? 34 : giant ? 58 : humanoid ? 44 : 52;
  const armW = small ? 9 : giant ? 18 : humanoid ? 10 : 13;
  const handR = small ? 6 : giant ? 12 : humanoid ? 6.5 : 8.5;
  // hinterer Arm
  parts.push(K.blob('c-arm far', [T(`M ${pt(bx - brx * 0.7, shY)} Q ${pt(bx - brx - 16, shY + armLen * 0.5)} ${pt(bx - brx - 10, shY + armLen)}`, armW), C(bx - brx - 10, shY + armLen + 2, handR)], farFill, line));
  // Beine
  for (const [dx, cls] of [[-13, 'c-leg l2'], [13, 'c-leg l1']]) {
    parts.push(K.blob(cls, [T(`M ${pt(bx + dx, by + bry * 0.55)} L ${pt(bx + dx * 1.15, 175)}`, small ? 11 : giant ? 19 : 14), E(bx + dx * 1.2 + 3, 179, small ? 9 : 13, 5)], bodyFill, line));
  }
  // Rumpf
  const torso = [E(bx, by, brx, bry)];
  if (f.has('golem')) torso.push(E(bx - brx * 0.6, by - bry * 0.55, brx * 0.55, bry * 0.4), E(bx + brx * 0.6, by - bry * 0.55, brx * 0.55, bry * 0.4));
  parts.push(K.blob('c-torso', torso, bodyFill, line));
  if (!f.has('golem') && !f.has('tree')) parts.push(h('ellipse', { cx: r1(bx + 4), cy: r1(by + bry * 0.18), rx: r1(brx * 0.62), ry: r1(bry * 0.66), fill: pal.belly, opacity: humanoid ? 0.6 : 0.92 }));
  parts.push(K.sheen(bx - brx * 0.35, by - bry * 0.55, brx * 0.4, bry * 0.18));
  if (f.has('fur') || f.has('yeti')) for (let i = 0; i < 5; i++) {
    const a = (200 + i * 35) * Math.PI / 180;
    const x = bx + Math.cos(a) * brx, y = by + Math.sin(a) * bry;
    parts.push(K.solid(P(`M ${pt(x - 5, y + 2)} Q ${pt(x + Math.cos(a) * 9, y + Math.sin(a) * 9)} ${pt(x + 5, y + 2)} Z`), pal.body, line, 1.1));
  }
  if (f.has('tree')) for (let i = 0; i < 4; i++) parts.push(h('path', { d: `M ${pt(bx - 18 + i * 12, by - bry * 0.6)} q 3 ${r1(bry * 0.6)} -1 ${r1(bry * 1.2)}`, stroke: dark(pal.body, 0.35), 'stroke-width': 2, fill: 'none', opacity: 0.7 }));
  if (f.has('golem') || f.has('corrupt') || f.has('titan')) {
    parts.push(h('path', { class: 'c-glowline', d: `M ${pt(bx - 14, by - 16)} l 8 10 l -4 12 l 10 8 M ${pt(bx + 12, by - 20)} l -6 12 l 8 6`, stroke: pal.accent, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  if (f.has('undead')) for (let i = 0; i < 3; i++) parts.push(h('path', { d: `M ${pt(bx - 14, by - 10 + i * 9)} q 14 -5 28 0`, stroke: light(pal.belly, 0.4), 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }));
  if (f.has('ice') || f.has('armor')) for (const sx of [-1, 1]) parts.push(K.solid(P(`M ${pt(bx + sx * brx * 0.35, shY - 2)} l ${r1(sx * 10)} -22 l ${r1(sx * 10)} 18 l ${r1(sx * 6)} -14 l ${r1(sx * 4)} 16 z`), f.has('armor') ? K.vol('#6e6e86', bx, shY - 12, 30) : light(pal.accent, 0.5), line, 1.4));
  // vorderer Arm
  parts.push(K.blob('c-arm', [T(`M ${pt(bx + brx * 0.7, shY)} Q ${pt(bx + brx + 18, shY + armLen * 0.5)} ${pt(bx + brx + 12, shY + armLen)}`, armW), C(bx + brx + 12, shY + armLen + 2, handR)], bodyFill, line));
  if (f.has('claws')) parts.push(K.claws([[bx + brx + 12, shY + armLen + 8, 1], [bx + brx + 17, shY + armLen + 6, 1], [bx + brx + 7, shY + armLen + 9, 1]], line, '#f3eadb', 4.2));

  // Kopf (Dreiviertel-Frontansicht mit zwei Augen)
  const H = form.head;
  const jx = bx + 2, jy = by - bry * 0.9;
  const head = around(jx, jy, H);
  const hr = small ? 21 : giant ? 24 : 24;
  const hx = bx + 4, hy = jy - hr * 0.72 - (f.has('golem') ? -6 : 0);
  const headParts = [];
  const headSkin = K.vol(f.has('bullhead') ? pal.body : pal.body, hx - hr * 0.3, hy - hr * 0.4, hr * 2.3);
  if (f.has('snakehair')) for (let i = 0; i < 7; i++) {
    const a = (170 + i * 33) * Math.PI / 180;
    const x = hx + Math.cos(a) * hr * 1.05, y = hy + Math.sin(a) * hr * 1.0;
    headParts.push(K.blob(null, [T(`M ${pt(hx + Math.cos(a) * hr * 0.6, hy + Math.sin(a) * hr * 0.6)} Q ${pt(x + Math.cos(a + 0.6) * 10, y + Math.sin(a + 0.6) * 10)} ${pt(x + Math.cos(a) * 14, y + Math.sin(a) * 14)}`, 6)], K.vol('#5c9a52', x, y, 20), dark('#5c9a52', 0.55)));
    headParts.push(h('circle', { cx: r1(x + Math.cos(a) * 14), cy: r1(y + Math.sin(a) * 14), r: 1.3, fill: '#ffe45a' }));
  }
  if (f.has('tree')) for (const [dx, dy, rr] of [[-18, -18, 12], [0, -26, 13], [18, -18, 12], [-26, -4, 9], [26, -4, 9]]) headParts.push(K.solid(C(hx + dx, hy + dy, rr), K.vol('#6fa846', hx + dx - 4, hy + dy - 4, rr * 2), dark('#6fa846', 0.5), 1.4));
  if (!f.has('bullhead') && !f.has('golem') && !humanoid && !f.has('cyclops') && !f.has('helmet') && !f.has('nameless')) {
    for (const dx of [-1, 1]) headParts.push(K.blob('c-ear', [C(hx + dx * hr * 0.92, hy + 2, hr * 0.26)], headSkin, line), h('circle', { cx: r1(hx + dx * hr * 0.92), cy: r1(hy + 2), r: r1(hr * 0.13), fill: light(pal.belly, 0.1) }));
  }
  if (f.has('bullhead')) for (const dx of [-1, 1]) headParts.push(K.solid(P(`M ${pt(hx + dx * hr * 0.55, hy - hr * 0.55)} Q ${pt(hx + dx * hr * 1.4, hy - hr * 0.9)} ${pt(hx + dx * hr * 1.35, hy - hr * 1.7)} Q ${pt(hx + dx * hr * 1.05, hy - hr * 1.05)} ${pt(hx + dx * hr * 0.35, hy - hr * 0.75)} Z`), '#f3e7cd', line, 1.5));
  const headShapes = f.has('golem') ? [P(`M ${pt(hx - hr * 0.9, hy + hr * 0.5)} L ${pt(hx - hr * 0.8, hy - hr * 0.6)} L ${pt(hx, hy - hr * 0.95)} L ${pt(hx + hr * 0.85, hy - hr * 0.55)} L ${pt(hx + hr * 0.9, hy + hr * 0.6)} Z`)] : [C(hx, hy, hr)];
  if (f.has('gorilla') || f.has('titan')) headShapes.push(E(hx, hy - hr * 0.72, hr * 0.5, hr * 0.35));
  if (f.has('bullhead')) headShapes.push(E(hx + 2, hy + hr * 0.45, hr * 0.62, hr * 0.42));
  headParts.push(K.blob('c-skull', headShapes, headSkin, line));
  if (humanoid) headParts.push(K.solid(P(`M ${pt(hx - hr * 1.0, hy)} Q ${pt(hx - hr * 1.05, hy - hr * 1.15)} ${pt(hx, hy - hr * 1.08)} Q ${pt(hx + hr * 1.05, hy - hr * 1.1)} ${pt(hx + hr * 1.0, hy)} Q ${pt(hx + hr * 0.6, hy - hr * 0.55)} ${pt(hx, hy - hr * 0.55)} Q ${pt(hx - hr * 0.6, hy - hr * 0.55)} ${pt(hx - hr * 1.0, hy)} Z`), K.vol(f.has('undead') ? '#3a3a3a' : dark(pal.accent, 0.5), hx, hy - hr, hr * 1.5), line, 1.5));
  if (!f.has('golem') && !f.has('helmet')) headParts.push(h('ellipse', { cx: r1(hx + 3), cy: r1(hy + hr * 0.22), rx: r1(hr * (f.has('bullhead') ? 0.55 : 0.68)), ry: r1(hr * 0.55), fill: f.has('yeti') ? pal.accent : light(pal.belly, humanoid ? 0.15 : 0.05), opacity: 0.95 }));
  headParts.push(K.sheen(hx - hr * 0.35, hy - hr * 0.5, hr * 0.38, hr * 0.18));
  if (f.has('helmet')) headParts.push(K.solid(P(`M ${pt(hx - hr * 1.02, hy + hr * 0.3)} Q ${pt(hx - hr * 1.05, hy - hr * 1.1)} ${pt(hx, hy - hr * 1.1)} Q ${pt(hx + hr * 1.05, hy - hr * 1.1)} ${pt(hx + hr * 1.02, hy + hr * 0.3)} Z`), K.vol('#7a7f8e', hx, hy - hr, hr * 1.6), line, 1.6), h('rect', { x: r1(hx - hr * 0.7), y: r1(hy - hr * 0.12), width: r1(hr * 1.4), height: r1(hr * 0.26), rx: 3, fill: pal.eyeGlow || '#ff3a3a', class: 'c-visor' }));
  const eyeR = hr * (small ? 0.3 : 0.27);
  if (f.has('cyclops')) headParts.push(K.eye(hx + 2, hy - hr * 0.12, hr * 0.46, { iris: pal.accent, skin: pal.body, line, glow: pal.accent, front: true }));
  else if (f.has('nameless')) headParts.push(h('path', { d: `M ${pt(hx - hr * 0.6, hy + hr * 0.15)} Q ${pt(hx, hy + hr * 0.9)} ${pt(hx + hr * 0.6, hy + hr * 0.15)} Z`, fill: '#3a0a12', stroke: line, 'stroke-width': 1.6 }), K.claws([[hx - hr * 0.4, hy + hr * 0.18, 1], [hx - hr * 0.1, hy + hr * 0.2, 1], [hx + hr * 0.2, hy + hr * 0.18, 1]], line, '#f7efdc', 3));
  else if (!f.has('helmet')) for (const dx of [-0.36, 0.44]) headParts.push(K.eye(hx + hr * dx, hy - hr * 0.08, eyeR, { iris: pal.eye, skin: f.has('yeti') ? pal.accent : light(pal.belly, 0.05), line, glow: pal.eyeGlow, front: true }));
  if (!f.has('nameless') && !f.has('helmet')) {
    headParts.push(K.blush(hx - hr * 0.5, hy + hr * 0.32, hr * 0.16), K.blush(hx + hr * 0.62, hy + hr * 0.32, hr * 0.16));
    if (f.has('bullhead')) headParts.push(h('ellipse', { cx: r1(hx - 5), cy: r1(hy + hr * 0.45), rx: 2.2, ry: 3, fill: line }), h('ellipse', { cx: r1(hx + 9), cy: r1(hy + hr * 0.45), rx: 2.2, ry: 3, fill: line }), h('path', { d: `M ${pt(hx - 4, hy + hr * 0.78)} a 6 5 0 1 0 12 0`, stroke: '#d8b34a', 'stroke-width': 2, fill: 'none' }));
    else headParts.push(h('ellipse', { cx: r1(hx + 3), cy: r1(hy + hr * 0.2), rx: r1(hr * 0.12), ry: r1(hr * 0.08), fill: dark(pal.body, 0.55) }));
    headParts.push(K.mouth(`M ${pt(hx - hr * 0.18, hy + hr * 0.46)} Q ${pt(hx + 3, hy + hr * 0.62)} ${pt(hx + hr * 0.3, hy + hr * 0.46)}`, { open: [hx + 3, hy + hr * 0.55, hr * 0.22, hr * 0.16], line }));
  }
  if (f.has('horns')) for (const dx of [-1, 1]) headParts.push(K.solid(P(`M ${pt(hx + dx * hr * 0.45, hy - hr * 0.75)} Q ${pt(hx + dx * hr * 0.9, hy - hr * 1.3)} ${pt(hx + dx * hr * 0.55, hy - hr * 1.9 * (0.5 + F * 0.5))} Q ${pt(hx + dx * hr * 0.55, hy - hr * 1.2)} ${pt(hx + dx * hr * 0.15, hy - hr * 0.9)} Z`), K.vol('#2a1a1a', hx, hy - hr * 1.4, hr), line, 1.4));
  if (f.has('crown')) headParts.push(K.solid(P(`M ${pt(hx - hr * 0.6, hy - hr * 0.78)} L ${pt(hx - hr * 0.62, hy - hr * 1.3)} L ${pt(hx - hr * 0.3, hy - hr * 1.02)} L ${pt(hx, hy - hr * 1.42)} L ${pt(hx + hr * 0.3, hy - hr * 1.02)} L ${pt(hx + hr * 0.62, hy - hr * 1.3)} L ${pt(hx + hr * 0.6, hy - hr * 0.78)} Z`), K.vol('#f2c14e', hx, hy - hr * 1.2, hr), '#7a5410', 1.5), h('circle', { cx: r1(hx), cy: r1(hy - hr * 0.98), r: 2.6, fill: pal.accent }));
  if (f.has('ice')) headParts.push(K.solid(P(`M ${pt(hx - 8, hy - hr * 0.9)} l 4 -12 l 4 10 l 5 -14 l 4 15 z`), light(pal.accent, 0.5), line, 1.2));
  if (f.has('sloth')) for (const dx of [-0.36, 0.44]) headParts.unshift(h('ellipse', { cx: r1(hx + hr * dx), cy: r1(hy - hr * 0.02), rx: r1(hr * 0.34), ry: r1(hr * 0.22), fill: dark(pal.body, 0.35), transform: `rotate(${dx < 0 ? 15 : -15} ${r1(hx + hr * dx)} ${r1(hy)})` }));
  parts.push(pivot('c-head', jx, jy, head.attr, headParts));
  return { parts, anchors: { head: head.map(hx, hy - hr), eye: head.map(hx + hr * 0.44, hy - hr * 0.08), mouth: head.map(hx + 3, hy + hr * 0.5), neck: head.map(hx, hy + hr * 0.95), body: [bx, by], top: head.map(hx, hy - hr * (f.has('crown') || f.has('horns') ? 1.6 : 1.1))[1] } };
}

/* -------------------------------------------------------------------------- */
/* Laufvögel                                                                    */
/* -------------------------------------------------------------------------- */

export function bird(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const penguin = f.has('penguin');
  const swim = f.has('swimbird');
  const terror = f.has('terror');
  const bx = penguin ? 98 : 90, by = penguin ? 130 : swim ? 138 : terror ? 118 : 128;
  const brx = penguin ? 27 : swim ? 36 : 32, bry = penguin ? 36 : swim ? 22 : 28;
  const bodyFill = K.vol(pal.body, bx - 6, by - bry * 0.6, bry * 2.4);
  const parts = [];
  const legCol = pal.extra || '#e8a040';
  const legTop = by + bry * 0.6;
  const leg = (x, cls) => {
    const g = [];
    if (!penguin) g.push(h('path', { class: cls, d: `M ${pt(x, legTop)} L ${pt(x, 178)}`, stroke: dark(legCol, 0.45), 'stroke-width': 6.5, 'stroke-linecap': 'round' }), h('path', { d: `M ${pt(x, legTop)} L ${pt(x, 178)}`, stroke: legCol, 'stroke-width': 3.6, 'stroke-linecap': 'round' }));
    g.push(K.solid(P(`M ${pt(x - 5, 181)} L ${pt(x + 2, 176)} L ${pt(x + 12, 181)} Z`), legCol, dark(legCol, 0.45), 1.3));
    return g;
  };
  parts.push(leg(bx - 8, 'c-leg l2'));
  if (f.has('turkey')) {
    const cols = [pal.accent, '#e8a040', '#3a6adf', '#48a860', pal.accent];
    for (let i = 0; i < 7; i++) {
      const a = (-160 + i * 20) * Math.PI / 180;
      parts.push(K.solid(E(bx - 18 + Math.cos(a) * 34, by - 8 + Math.sin(a) * 34, 8, 20, (-160 + i * 20) + 90), K.vol(cols[i % cols.length], bx - 18 + Math.cos(a) * 34, by - 20 + Math.sin(a) * 34, 24), line, 1.3));
    }
  } else if (!penguin) {
    parts.push(K.blob('c-tail', [P(`M ${pt(bx - brx * 0.7, by - 6)} Q ${pt(bx - brx - 22, by - 30)} ${pt(bx - brx - 18, by - 14)} Q ${pt(bx - brx - 26, by - 4)} ${pt(bx - brx - 8, by + 8)} Z`)], K.vol(pal.extra === legCol ? pal.accent : pal.body, bx - brx, by - 14, 30), line, { style: `transform-origin:${r1(bx - brx * 0.7)}px ${r1(by)}px` }));
  }
  const neck = terror || swim ? 26 : penguin ? 0 : 12;
  const jx = bx + brx * (penguin ? 0.2 : 0.6), jy = by - bry * 0.7;
  const hx = jx + (penguin ? 6 : 14 + (swim ? 12 : 0)), hy = jy - 10 - neck;
  const shapes = [E(bx, by, brx, bry, penguin ? 0 : -6)];
  if (neck) shapes.push(T(`M ${pt(jx - 6, jy + 8)} L ${pt(hx - 4, hy + 8)}`, terror ? 16 : 13));
  parts.push(K.blob('c-torso', shapes, bodyFill, line));
  parts.push(h('ellipse', { cx: r1(bx + (penguin ? 6 : 8)), cy: r1(by + bry * (penguin ? 0.1 : 0.35)), rx: r1(brx * (penguin ? 0.62 : 0.6)), ry: r1(bry * (penguin ? 0.75 : 0.45)), fill: pal.belly, opacity: 0.96 }));
  parts.push(K.sheen(bx - brx * 0.35, by - bry * 0.55, brx * 0.4, bry * 0.18));
  // Flügel am Körper
  parts.push(h('g', { class: 'c-wing', style: `transform-origin:${r1(bx + 6)}px ${r1(by - bry * 0.4)}px` },
    K.solid(P(penguin
      ? `M ${pt(bx - 10, by - bry * 0.5)} Q ${pt(bx - 30, by + 10)} ${pt(bx - 24, by + bry * 0.7)} Q ${pt(bx - 8, by + 4)} ${pt(bx - 10, by - bry * 0.5)} Z`
      : `M ${pt(bx + 8, by - bry * 0.45)} Q ${pt(bx - 26, by - bry * 0.55)} ${pt(bx - 30, by + bry * 0.25)} Q ${pt(bx - 8, by + bry * 0.25)} ${pt(bx + 8, by - bry * 0.45)} Z`),
    K.vol(dark(pal.body, 0.12), bx - 12, by - 6, 30), line, 1.8)));
  parts.push(leg(bx + 10, 'c-leg l1'));
  const H = form.head;
  const head = around(jx, jy, H);
  const r = penguin ? 22 : terror ? 23 : 21;
  const beak = f.has('dodo')
    ? { color: pal.accent, len: 1.05, hook: true }
    : terror ? { color: pal.accent, len: 1.25, hook: true }
      : f.has('turkey') ? { color: '#e8c070', len: 0.55, hook: false }
        : { color: pal.extra || pal.accent, len: penguin ? 0.55 : 0.95, hook: false };
  const hd = profileHead(ctx, { cx: hx, cy: hy, r, beak, eyeR: r * 0.38 });
  const headParts = [...hd.parts];
  if (f.has('turkey')) headParts.push(K.solid(P(`M ${pt(hx + r * 0.9, hy + r * 0.2)} q 4 10 -2 16 q -3 -6 -1 -16 z`), pal.accent, line, 1.2));
  if (f.has('dodo')) headParts.push(K.solid(P(`M ${pt(hx - r * 0.4, hy - r * 0.85)} q 2 -10 9 -8 q -3 4 -2 9 z`), pal.body, line, 1.2));
  parts.push(pivot('c-head', jx, jy, head.attr, headParts));
  return { parts, anchors: { head: head.map(hx, hd.top), eye: head.map(...hd.eye), mouth: head.map(...hd.mouth), neck: [jx, jy + 4], body: [bx, by], top: head.map(hx, hd.top)[1] } };
}
