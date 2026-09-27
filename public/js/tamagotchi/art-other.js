/**
 * Körperbaupläne für Flieger, Drachen, Wasserbewohner, Insekten, Spinnentiere,
 * Weichtiere, Tek-Roboter und Sonderformen (Titanen, Oasisaur, Gasbags …).
 * Gleiches Koordinatensystem wie art-land.js: 0–200, Blick nach rechts.
 */
import { h } from './vdom.js';
import { E, C, P, T, pt, r1, light, dark, mix, pivot } from './art-kit.js';
import { around, wings } from './art-land.js';

const headGroup = (jx, jy, s, parts) => {
  const t = around(jx, jy, s);
  return { node: pivot('c-head', jx, jy, t.attr, parts), map: t.map };
};

/** Seitlicher Kopf mit Schnabel oder Schnauze (kompakte Variante für Flieger & Schwimmer). */
function sideHead(ctx, o) {
  const { K, pal } = ctx;
  const { cx, cy, r, beak = null, snout = 0, teeth = false, eyeR = r * 0.4, skin = pal.body, eyeX = 0.25 } = o;
  const line = pal.line;
  const fill = K.vol(skin, cx - r * 0.3, cy - r * 0.4, r * 2.4);
  const shapes = [C(cx, cy, r)];
  if (snout) shapes.push(E(cx + r * (0.7 + 0.35 * snout), cy + r * 0.25, r * (0.45 + 0.4 * snout), r * 0.42));
  const parts = [K.blob('c-skull', shapes, fill, line)];
  let tip = cx + r * (snout ? 1.1 + 0.75 * snout : 0.9);
  if (beak) {
    const bl = r * beak.len;
    const hook = beak.hook ? r * 0.3 : 0;
    parts.push(K.solid(P(`M ${pt(cx + r * 0.72, cy - r * 0.32)} Q ${pt(cx + r * 0.9 + bl * 0.6, cy - r * 0.34)} ${pt(cx + r * 0.8 + bl, cy + hook)} Q ${pt(cx + r * 0.9 + bl * 0.45, cy + r * 0.32)} ${pt(cx + r * 0.72, cy + r * 0.34)} Z`), K.vol(beak.color, cx + r, cy - r * 0.3, bl * 1.4), line, 1.7));
    parts.push(h('path', { d: `M ${pt(cx + r * 0.75, cy + r * 0.04)} Q ${pt(cx + r * 0.9 + bl * 0.5, cy + r * 0.08)} ${pt(cx + r * 0.8 + bl * 0.95, cy + hook * 0.8)}`, fill: 'none', stroke: line, 'stroke-width': 1.3, 'stroke-linecap': 'round' }));
    tip = cx + r * 0.8 + bl;
  } else {
    const my = cy + r * 0.38;
    parts.push(K.mouth(`M ${pt(tip - r * 0.12, my - r * 0.05)} Q ${pt((tip + cx) / 2 + r * 0.2, my + r * 0.15)} ${pt(cx + r * 0.35, my - r * 0.02)}`,
      { open: [tip - r * 0.45, my + r * 0.08, r * 0.3, r * 0.22], line, teeth: teeth ? [[tip - r * 0.4, my - 0.3, 3], [tip - r * 0.8, my + 0.4, 2.6]] : [] }));
  }
  parts.push(K.sheen(cx - r * 0.3, cy - r * 0.5, r * 0.42, r * 0.2));
  const ex = cx + r * eyeX, ey = cy - r * 0.15;
  parts.push(K.blush(ex + r * 0.3, ey + eyeR * 1.8, eyeR * 0.85));
  parts.push(K.eye(ex, ey, eyeR, { iris: pal.eye, skin, line, glow: pal.eyeGlow }));
  return { parts, eye: [ex, ey], mouth: [tip - r * 0.3, cy + r * 0.3], top: cy - r, tip };
}

/* -------------------------------------------------------------------------- */
/* Vögel im Flug                                                                */
/* -------------------------------------------------------------------------- */

export function flyer(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const small = f.has('archaeo') || f.has('micro') || f.has('featherlight') || f.has('parrot');
  const bx = 94, by = small ? 118 : 114;
  const brx = small ? 23 : 28, bry = small ? 19 : 23;
  const bodyFill = K.vol(pal.body, bx - 6, by - 14, 60);
  const wingCol = f.has('eagle') ? pal.accent : f.has('parrot') ? pal.accent : f.has('gull') || f.has('albatross') ? mix(pal.body, '#8a95a0', 0.45) : f.has('phoenix') ? pal.accent : dark(pal.body, 0.08);
  const parts = [];
  const wing = (far) => {
    const s = (f.has('albatross') ? 1.2 : small ? 0.8 : 1) * (0.62 + 0.38 * F);
    const x = bx + 6, y = by - bry * 0.4;
    const col = far ? dark(wingCol, 0.22) : wingCol;
    const d = `M ${pt(x, y)} C ${pt(x - 6 * s, y - 36 * s)} ${pt(x - 30 * s, y - 70 * s)} ${pt(x - 62 * s, y - 78 * s)} C ${pt(x - 56 * s, y - 68 * s)} ${pt(x - 66 * s, y - 60 * s)} ${pt(x - 60 * s, y - 52 * s)} C ${pt(x - 66 * s, y - 46 * s)} ${pt(x - 62 * s, y - 38 * s)} ${pt(x - 54 * s, y - 34 * s)} C ${pt(x - 58 * s, y - 26 * s)} ${pt(x - 50 * s, y - 20 * s)} ${pt(x - 42 * s, y - 18 * s)} C ${pt(x - 40 * s, y - 8 * s)} ${pt(x - 24 * s, y)} ${pt(x - 8, y + 10)} Z`;
    return pivot('c-wing' + (far ? ' far' : ''), x, y, far ? `rotate(14 ${r1(x)} ${r1(y)})` : null,
      K.solid(P(d), K.vol(col, x - 30 * s, y - 50 * s, 70 * s), line, 2),
      h('path', { d: `M ${pt(x - 14 * s, y - 20 * s)} Q ${pt(x - 34 * s, y - 40 * s)} ${pt(x - 54 * s, y - 60 * s)} M ${pt(x - 10 * s, y - 6 * s)} Q ${pt(x - 30 * s, y - 18 * s)} ${pt(x - 50 * s, y - 34 * s)}`, stroke: dark(col, 0.3), 'stroke-width': 1.3, fill: 'none', opacity: 0.55 }),
      f.has('phoenix') ? h('path', { class: 'c-flame', d: `M ${pt(x - 62 * s, y - 78 * s)} q -6 -10 2 -18 q 0 10 8 12 z`, fill: '#ffd35a', opacity: 0.9 }) : null,
      f.has('featherlight') ? h('circle', { cx: r1(x - 40 * s), cy: r1(y - 50 * s), r: 4, fill: pal.glow, class: 'c-glowdot' }) : null,
      f.has('archaeo') ? K.claws([[x - 8 * s, y - 34 * s, 1], [x - 4 * s, y - 30 * s, 1]], line, '#f3eadb', 2.4) : null);
  };
  parts.push(wing(true));
  // Schwanzfedern
  const tailLong = f.has('archaeo') || f.has('featherlight') || f.has('phoenix') || f.has('parrot');
  const tl = tailLong ? 46 : 24;
  parts.push(K.blob('c-tail', [P(`M ${pt(bx - brx * 0.6, by - 4)} L ${pt(bx - brx - tl, by + 12 + tl * 0.2)} L ${pt(bx - brx - tl + 6, by + 22 + tl * 0.25)} L ${pt(bx - brx * 0.4, by + bry * 0.55)} Z`)],
    K.vol(f.has('parrot') ? pal.extra : f.has('eagle') ? pal.belly : wingCol, bx - brx - 10, by + 6, 40), line, { style: `transform-origin:${r1(bx - brx * 0.6)}px ${r1(by)}px` }));
  if (f.has('featherlight')) parts.push(h('path', { d: `M ${pt(bx - brx - tl + 4, by + 20)} q -14 10 -4 26 M ${pt(bx - brx - tl + 8, by + 18)} q -6 16 8 24`, stroke: pal.accent, 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }), K.glow(pal.glow, bx - brx - tl, by + 40, 12, 0.9));
  if (f.has('micro')) parts.push(K.solid(P(`M ${pt(bx - 6, by + bry * 0.4)} q -30 10 -46 32 q 20 -4 46 -18 z`), K.vol(pal.accent, bx - 30, by + 30, 30), line, 1.6));
  // Körper
  const neckX = bx + brx * 0.7, neckY = by - bry * 0.7;
  const owl = f.has('owl');
  const hr = owl ? 26 : small ? 18 : 20;
  const hx = owl ? bx + 8 : neckX + 12, hy = owl ? by - bry - 12 : neckY - 12;
  parts.push(K.blob('c-torso', [E(bx, by, brx, bry, -15), owl ? null : T(`M ${pt(neckX - 6, neckY + 8)} L ${pt(hx - 6, hy + 6)}`, 14)], bodyFill, line));
  parts.push(h('ellipse', { cx: r1(bx + 6), cy: r1(by + bry * 0.3), rx: r1(brx * 0.6), ry: r1(bry * 0.5), fill: pal.belly, opacity: 0.95, transform: `rotate(-15 ${r1(bx + 6)} ${r1(by + bry * 0.3)})` }));
  if (owl) for (let i = 0; i < 4; i++) parts.push(h('path', { d: `M ${pt(bx - 6 + (i % 2) * 12, by - 4 + Math.floor(i / 2) * 10)} l 3 3 l 3 -3`, stroke: pal.accent, 'stroke-width': 1.6, fill: 'none' }));
  parts.push(K.sheen(bx - 8, by - bry * 0.55, brx * 0.4, bry * 0.18));
  // Füße angezogen
  parts.push(K.claws([[bx + 2, by + bry + 3, 1], [bx + 6, by + bry + 2, 1], [bx - 8, by + bry + 2, 1]], line, pal.extra || '#e8a040', 3.2));
  parts.push(wing(false));
  // Kopf
  const H = form.head;
  const jx = owl ? bx + 4 : neckX, jy = owl ? by - bry * 0.7 : neckY;
  let hd;
  if (owl) {
    const fill = K.vol(pal.body, hx - 8, hy - 10, hr * 2.4);
    const headParts = [
      K.solid(P(`M ${pt(hx - hr * 0.75, hy - hr * 0.55)} l -4 -16 l 13 10 z`), pal.body, line, 1.4),
      K.solid(P(`M ${pt(hx + hr * 0.75, hy - hr * 0.55)} l 4 -16 l -13 10 z`), pal.body, line, 1.4),
      K.blob('c-skull', [C(hx, hy, hr)], fill, line),
      h('ellipse', { cx: r1(hx - hr * 0.38), cy: r1(hy), rx: r1(hr * 0.42), ry: r1(hr * 0.46), fill: pal.belly }),
      h('ellipse', { cx: r1(hx + hr * 0.38), cy: r1(hy), rx: r1(hr * 0.42), ry: r1(hr * 0.46), fill: pal.belly }),
      K.eye(hx - hr * 0.38, hy, hr * 0.3, { iris: pal.eye, skin: pal.belly, line, front: true }),
      K.eye(hx + hr * 0.38, hy, hr * 0.3, { iris: pal.eye, skin: pal.belly, line, front: true }),
      K.solid(P(`M ${pt(hx - 4, hy + hr * 0.3)} L ${pt(hx + 4, hy + hr * 0.3)} L ${pt(hx, hy + hr * 0.62)} Z`), '#e8b33a', line, 1.2),
      K.mouth(`M ${pt(hx - 3, hy + hr * 0.7)} q 3 2 6 0`, { open: [hx, hy + hr * 0.7, 4, 3], line }),
    ];
    hd = { parts: headParts, eye: [hx + hr * 0.38, hy], mouth: [hx, hy + hr * 0.6], top: hy - hr - 10 };
  } else {
    const beak = f.has('archaeo') ? null
      : f.has('eagle') ? { color: pal.extra, len: 0.85, hook: true }
        : f.has('parrot') ? { color: '#2e2e36', len: 0.7, hook: true }
          : f.has('vulture') ? { color: '#d8c8a8', len: 0.8, hook: true }
            : f.has('albatross') ? { color: pal.extra, len: 1.15, hook: true }
              : f.has('micro') ? null
                : { color: pal.extra || '#e8a040', len: 0.8, hook: f.has('phoenix') };
    hd = sideHead(ctx, { cx: hx, cy: hy, r: hr, beak, snout: beak ? 0 : 0.35, teeth: !beak, skin: f.has('eagle') ? pal.belly : f.has('vulture') ? pal.accent : pal.body });
    if (f.has('parrot') || f.has('phoenix') || f.has('featherlight')) hd.parts.unshift(K.solid(P(`M ${pt(hx - hr * 0.5, hy - hr * 0.7)} q -6 -18 8 -22 q -2 10 4 12 q 2 -12 12 -10 q -6 8 -4 16 z`), f.has('parrot') ? pal.extra : pal.accent, line, 1.3));
    if (f.has('vulture')) hd.parts.unshift(K.solid(E(hx - hr * 0.6, hy + hr * 0.8, hr * 0.8, hr * 0.45), pal.belly, line, 1.5));
  }
  const hg = headGroup(jx, jy, H, hd.parts);
  parts.push(hg.node);
  if (f.has('phoenix')) parts.unshift(K.glow(pal.glow, bx, by - 20, 80, 0.45));
  return { parts, anchors: { floating: true, head: hg.map(hx, hd.top), eye: hg.map(...hd.eye), mouth: hg.map(...hd.mouth), neck: [neckX, neckY + 4], body: [bx, by], top: Math.min(hg.map(hx, hd.top)[1], by - 80) } };
}

/* -------------------------------------------------------------------------- */
/* Flugsaurier                                                                  */
/* -------------------------------------------------------------------------- */

export function ptero(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const bx = 92, by = 122;
  const bodyFill = K.vol(pal.body, bx - 6, by - 12, 50);
  const parts = [];
  const membrane = (far) => {
    const s = (f.has('giant') ? 1.12 : 1) * (0.62 + 0.38 * F);
    const x = bx + 4, y = by - 8;
    const col = far ? dark(pal.accent, 0.25) : pal.accent;
    return pivot('c-wing' + (far ? ' far' : ''), x, y, far ? `rotate(12 ${r1(x)} ${r1(y)})` : null,
      K.solid(P(`M ${pt(x, y)} L ${pt(x - 18 * s, y - 44 * s)} L ${pt(x - 74 * s, y - 66 * s)} Q ${pt(x - 50 * s, y - 36 * s)} ${pt(x - 44 * s, y - 6 * s)} Q ${pt(x - 26 * s, y + 4)} ${pt(x - 14, y + 24)} Z`), K.lin(light(col, 0.25), dark(col, 0.1), y - 66 * s, y + 20), line, 2),
      h('path', { d: `M ${pt(x, y)} L ${pt(x - 18 * s, y - 44 * s)} L ${pt(x - 74 * s, y - 66 * s)}`, stroke: pal.body, 'stroke-width': 3.6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      K.claws([[x - 18 * s, y - 44 * s, 1]], line, '#f3eadb', 2.4));
  };
  parts.push(membrane(true));
  parts.push(K.blob('c-torso', [E(bx, by, 22, 17, -12), T(`M ${pt(bx + 14, by - 8)} L ${pt(bx + 26, by - 26)}`, 11)], bodyFill, line));
  parts.push(h('ellipse', { cx: r1(bx + 4), cy: r1(by + 5), rx: 14, ry: 9, fill: pal.belly, opacity: 0.95 }));
  parts.push(K.claws([[bx - 6, by + 18, 1], [bx + 2, by + 18, 1]], line, '#f3eadb', 3));
  parts.push(membrane(false));
  const H = form.head;
  const jx = bx + 26, jy = by - 26;
  const big = f.has('bighead');
  const hr = big ? 20 : 17;
  const hx = jx + 8, hy = jy - 10;
  const hd = sideHead(ctx, { cx: hx, cy: hy, r: hr, beak: big ? null : { color: light(pal.body, 0.25), len: f.has('giant') ? 2.3 : 2.1, hook: false }, snout: big ? 0.6 : 0, teeth: big, eyeX: 0.1 });
  const headParts = [];
  if (f.has('crestback')) headParts.push(K.solid(P(`M ${pt(hx - hr * 0.2, hy - hr * 0.7)} Q ${pt(hx - hr * 1.6, hy - hr * 1.5)} ${pt(hx - hr * 2.4 * (0.5 + F * 0.5), hy - hr * 1.4)} Q ${pt(hx - hr * 1.2, hy - hr * 0.7)} ${pt(hx - hr * 0.6, hy - hr * 0.2)} Z`), K.vol(pal.extra, hx - hr, hy - hr, hr * 1.6), line, 1.6));
  if (f.has('crestsail')) headParts.push(K.solid(P(`M ${pt(hx - hr * 0.6, hy - hr * 0.5)} Q ${pt(hx - hr * 0.2, hy - hr * 3.2 * (0.45 + F * 0.55))} ${pt(hx + hr * 1.2, hy - hr * 0.5)} Z`), K.vol(pal.extra, hx, hy - hr * 2, hr * 2), line, 1.6));
  headParts.push(...hd.parts);
  const hg = headGroup(jx, jy, H, headParts);
  parts.push(hg.node);
  return { parts, anchors: { floating: true, head: hg.map(hx, hd.top), eye: hg.map(...hd.eye), mouth: hg.map(...hd.mouth), neck: [jx - 4, jy + 6], body: [bx, by], top: hg.map(hx, hd.top - (f.has('crestsail') ? hr * 2 : 0))[1] } };
}

/* -------------------------------------------------------------------------- */
/* Drachen & Wyvern                                                             */
/* -------------------------------------------------------------------------- */

export function dragon(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const parts = [];
  if (f.has('serpent')) return serpentDragon(ctx);
  const small = f.has('small') || f.has('yiling');
  const four = f.has('fourlegs');
  const bx = 88, by = four ? 130 : small ? 134 : 124;
  const brx = small ? 28 : four ? 40 : 35, bry = small ? 21 : four ? 25 : 26;
  const bodyFill = K.vol(pal.body, bx, by - 16, 64);
  const farFill = K.vol(dark(pal.body, 0.16), bx, by, 60);
  const wingKind = f.has('feathered') ? 'bird' : 'bat';
  const wingPal = { ...pal, extra: f.has('crystals') ? light(pal.extra, 0.2) : f.has('feathered') ? pal.accent : f.has('obsidian') ? pal.body : f.has('beakhead') ? pal.accent : light(pal.body, 0.1) };
  if (!four) parts.push(K.blob('c-leg l2', [E(bx - 4, by + 18, 12, 16, 10), T(`M ${pt(bx - 4, by + 28)} L ${pt(bx - 8, 176)}`, 10), E(bx - 3, 179.5, 11, 5)], farFill, line));
  else {
    parts.push(K.blob('c-leg l2', [T(`M ${pt(bx + 24, by + 10)} L ${pt(bx + 26, 177)}`, 12), E(bx + 29, 179.5, 9, 4.6)], farFill, line));
    parts.push(K.blob('c-leg l3', [T(`M ${pt(bx - 26, by + 10)} L ${pt(bx - 28, 177)}`, 13), E(bx - 25, 179.5, 9, 4.6)], farFill, line));
  }
  parts.push(wings(K, wingKind, bx + 8, by - bry * 0.6, wingPal, line, F, true));
  // Schwanz mit Spitze
  const tipX = small ? 16 : 6, tipY = by - 20;
  parts.push(h('g', { class: 'c-tail', style: `transform-origin:${r1(bx - brx * 0.7)}px ${r1(by)}px` },
    K.blob(null, [P(`M ${pt(bx - brx * 0.6, by - bry * 0.55)} C ${pt(bx - brx - 16, by - bry * 0.4)} ${pt(tipX + 26, tipY + 4)} ${pt(tipX + 6, tipY)} C ${pt(tipX + 24, tipY + 14)} ${pt(bx - brx - 6, by + bry * 0.6)} ${pt(bx - brx * 0.45, by + bry * 0.72)} Z`)], bodyFill, line),
    K.solid(P(`M ${pt(tipX + 10, tipY + 2)} L ${pt(tipX - 6, tipY - 12)} L ${pt(tipX - 4, tipY + 8)} Z`), f.has('obsidian') ? pal.accent : dark(pal.accent, 0.1), line, 1.4)));
  const spikes = f.has('obsidian') || f.has('crystals') || f.has('icicles') || f.has('armored');
  if (spikes || f.has('feathered')) {
    for (let i = 0; i < 5; i++) {
      const x = bx - 26 + i * 12, y = by - bry * (0.75 + 0.2 * Math.sin((i + 0.5) / 5 * Math.PI));
      const col = f.has('crystals') ? light(pal.extra, 0.3) : f.has('icicles') ? '#e8f8ff' : f.has('feathered') ? pal.accent : f.has('armored') ? dark(pal.belly, 0.2) : pal.accent;
      parts.push(K.solid(P(`M ${pt(x - 4, y + 3)} L ${pt(x, y - 12 * F - 3)} L ${pt(x + 4, y + 3)} Z`), col, line, 1.2));
    }
  }
  if (f.has('crystals') || f.has('obsidian')) parts.unshift(K.glow(pal.glow || pal.accent, bx, by - 20, 80, 0.4));
  // Rumpf + Hals
  const neckX = bx + brx * 0.7, neckY = by - bry * 0.55;
  const jx = neckX + 16, jy = neckY - (small ? 16 : 26);
  parts.push(K.blob('c-torso', [E(bx, by, brx, bry, -8), T(`M ${pt(neckX - 6, neckY + 8)} Q ${pt(neckX + 12, neckY - 6)} ${pt(jx, jy)}`, small ? 14 : 18)], bodyFill, line));
  parts.push(h('ellipse', { cx: r1(bx + 10), cy: r1(by + bry * 0.35), rx: r1(brx * 0.6), ry: r1(bry * 0.45), fill: pal.belly, opacity: 0.95 }));
  for (let i = 0; i < 4; i++) parts.push(h('path', { d: `M ${pt(bx - 8 + i * 9, by + bry * 0.05)} q 3 6 0 12`, stroke: dark(pal.belly, 0.2), 'stroke-width': 1.4, fill: 'none', opacity: 0.6 }));
  parts.push(K.sheen(bx - 8, by - bry * 0.5, brx * 0.45, bry * 0.2));
  if (f.has('armored')) for (let i = 0; i < 6; i++) parts.push(K.solid(E(bx - 20 + (i % 3) * 16, by - 10 + Math.floor(i / 3) * 10, 7, 4.5), light(pal.body, 0.18), line, 1));
  if (!four) {
    parts.push(K.blob('c-leg l1', [E(bx + 8, by + 18, 13, 17, -12), T(`M ${pt(bx + 10, by + 30)} L ${pt(bx + 14, 176)}`, 11), E(bx + 18, 179.5, 12, 5)], bodyFill, line));
    parts.push(K.claws([[bx + 22, 182, 1], [bx + 25, 181.5, 1], [bx + 28, 181, 1]], line, '#f3eadb', 3));
  } else {
    parts.push(K.blob('c-leg l1', [T(`M ${pt(bx + 30, by + 12)} L ${pt(bx + 33, 177)}`, 13), E(bx + 36, 179.5, 10, 5)], bodyFill, line));
    parts.push(K.blob('c-leg l4', [E(bx - 22, by + 12, 13, 15), T(`M ${pt(bx - 22, by + 16)} L ${pt(bx - 20, 177)}`, 14), E(bx - 17, 179.5, 10, 5)], bodyFill, line));
    parts.push(K.claws([[bx + 40, 182, 1], [bx + 43, 181.5, 1], [bx - 13, 182, 1], [bx - 10, 181.5, 1]], line, '#f3eadb', 3));
  }
  parts.push(wings(K, wingKind, bx + 12, by - bry * 0.55, wingPal, line, F));
  // Kopf
  const H = form.head;
  const r = small ? 21 : 24;
  const hx = jx + 12, hy = jy - 10;
  const hd = sideHead(ctx, {
    cx: hx, cy: hy, r, snout: f.has('beakhead') ? 0 : 0.8, teeth: !f.has('beakhead'),
    beak: f.has('beakhead') ? { color: '#e8a040', len: 1, hook: true } : null, eyeR: r * 0.38, eyeX: 0.15,
  });
  const headParts = [];
  if (f.has('horns') || f.has('icicles') || f.has('obsidian')) for (const [dx, len] of [[-0.55, 1], [-0.15, 0.8]]) {
    headParts.push(K.solid(P(`M ${pt(hx + r * dx, hy - r * 0.7)} Q ${pt(hx + r * dx - r * 0.5, hy - r * 1.3)} ${pt(hx + r * dx - r * 1.1 * len * (0.5 + F * 0.5), hy - r * 1.5 * len * (0.5 + F * 0.5))} Q ${pt(hx + r * dx - r * 0.3, hy - r * 0.95)} ${pt(hx + r * dx + r * 0.3, hy - r * 0.72)} Z`), f.has('icicles') ? '#e8f8ff' : f.has('obsidian') ? pal.accent : '#efe3c8', line, 1.4));
  }
  if (f.has('rhinohorn')) headParts.push(K.solid(P(`M ${pt(hx + r * 1.1, hy - r * 0.05)} Q ${pt(hx + r * 1.5, hy - r * 1.3)} ${pt(hx + r * 1.9, hy - r * 1.2)} Q ${pt(hx + r * 1.7, hy - r * 0.5)} ${pt(hx + r * 1.65, hy + r * 0.05)} Z`), K.lin(light(pal.extra, 0.4), pal.extra, hy - r * 1.3, hy), line, 1.5));
  if (f.has('crystals')) headParts.push(K.solid(P(`M ${pt(hx - r * 0.4, hy - r * 0.8)} l 4 -16 l 5 14 l 6 -20 l 5 20 z`), light(pal.extra, 0.3), line, 1.2));
  headParts.push(...hd.parts);
  if (f.has('beakhead')) headParts.push(K.solid(P(`M ${pt(hx - r * 0.3, hy - r * 0.9)} q 3 -9 9 -7 q -3 4 -2 8 z`), pal.body, line, 1.2));
  const hg = headGroup(jx, jy, H, headParts);
  parts.push(hg.node);
  return { parts, anchors: { head: hg.map(hx, hd.top), eye: hg.map(...hd.eye), mouth: hg.map(...hd.mouth), neck: [neckX + 4, neckY - 6], body: [bx, by], top: Math.min(hg.map(hx, hd.top)[1], by - 90 * F) } };
}

function serpentDragon(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const parts = [];
  const d = 'M 20 150 C 40 110, 80 176, 104 140 C 124 110, 90 90, 118 74';
  const bodyFill = K.vol(pal.body, 80, 100, 110);
  parts.push(h('g', { class: 'c-tail' }, h('path', { d: 'M 20 150 q -12 -4 -14 -18 q 10 6 18 6 z', fill: pal.accent, stroke: line, 'stroke-width': 1.5 })));
  parts.push(K.blob('c-torso', [T(d, 24)], bodyFill, line));
  parts.push(h('path', { d, fill: 'none', stroke: pal.belly, 'stroke-width': 7, 'stroke-dasharray': '4 6', opacity: 0.7, transform: 'translate(2 7)' }));
  for (let i = 0; i < 7; i++) {
    const x = 26 + i * 14, y = [138, 132, 150, 160, 146, 120, 104][i];
    parts.push(K.solid(P(`M ${pt(x - 5, y - 8)} q 3 -12 10 -6 q -4 2 -4 8 z`), pal.accent, line, 1.1));
  }
  for (const [x, y] of [[62, 160], [108, 146], [100, 104]]) parts.push(K.blob('c-leg', [T(`M ${pt(x, y)} l 4 14`, 6)], bodyFill, line), K.claws([[x + 5, y + 16, 1], [x + 8, y + 15, 1]], line, '#f3eadb', 2.4));
  const H = form.head;
  const jx = 118, jy = 74;
  const r = 22;
  const hx = jx + 14, hy = jy - 8;
  const hd = sideHead(ctx, { cx: hx, cy: hy, r, snout: 0.75, teeth: true, eyeR: r * 0.38, eyeX: 0.1 });
  const headParts = [];
  for (let i = 0; i < 5; i++) headParts.push(K.solid(E(hx - r * 0.9 + i * 2, hy + r * 0.1 + i * 5, 9, 5, -30 + i * 10), i % 2 ? pal.accent : light(pal.accent, 0.2), line, 1));
  for (const dx of [-0.4, 0]) headParts.push(h('path', { d: `M ${pt(hx + r * dx, hy - r * 0.8)} q -6 -14 -2 -24 m 1 8 l -8 -4 m 6 -1 l 6 -6`, stroke: '#efe3c8', 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round' }));
  headParts.push(...hd.parts);
  if (f.has('whiskers')) headParts.push(h('path', { d: `M ${pt(hd.tip - 6, hy + r * 0.2)} q 16 4 26 18 M ${pt(hd.tip - 8, hy + r * 0.35)} q 12 10 16 26`, stroke: pal.accent, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }));
  const hg = headGroup(jx, jy, H, headParts);
  parts.push(hg.node);
  parts.unshift(K.glow('#fff1a8', 100, 110, 90, 0.3));
  return { parts, anchors: { floating: true, head: hg.map(hx, hd.top), eye: hg.map(...hd.eye), mouth: hg.map(...hd.mouth), neck: [112, 88], body: [90, 130], top: hg.map(hx, hd.top)[1] - 20 * F } };
}

/* -------------------------------------------------------------------------- */
/* Fledermäuse (Frontansicht)                                                   */
/* -------------------------------------------------------------------------- */

export function bat(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const giant = f.has('giant');
  const small = f.has('small');
  const bx = 100, by = 118;
  const s = (giant ? 1.15 : small ? 0.8 : 1) * (0.65 + 0.35 * F);
  const bodyFill = K.vol(pal.body, bx - 6, by - 12, 50);
  const wingFill = K.lin(light(pal.accent, 0.1), dark(pal.body, 0.1), by - 70 * s, by + 30);
  const parts = [];
  if (giant) parts.push(K.glow(pal.accent, bx, by, 90, 0.35));
  for (const dir of [-1, 1]) {
    const x = bx + dir * 14, y = by - 10;
    const d = `M ${pt(x, y)} L ${pt(x + dir * 30 * s, y - 40 * s)} L ${pt(x + dir * 82 * s, y - 26 * s)} Q ${pt(x + dir * 70 * s, y - 6 * s)} ${pt(x + dir * 74 * s, y + 10 * s)} Q ${pt(x + dir * 56 * s, y + 2 * s)} ${pt(x + dir * 50 * s, y + 20 * s)} Q ${pt(x + dir * 34 * s, y + 10 * s)} ${pt(x + dir * 26 * s, y + 28 * s)} Q ${pt(x + dir * 14, y + 18)} ${pt(x, y + 22)} Z`;
    parts.push(h('g', { class: 'c-wing' + (dir < 0 ? ' far' : ''), style: `transform-origin:${r1(x)}px ${r1(y)}px` },
      K.solid(P(d), wingFill, line, 2),
      h('path', { d: `M ${pt(x, y)} L ${pt(x + dir * 30 * s, y - 40 * s)} M ${pt(x + dir * 30 * s, y - 40 * s)} L ${pt(x + dir * 74 * s, y + 10 * s)} M ${pt(x + dir * 30 * s, y - 40 * s)} L ${pt(x + dir * 50 * s, y + 20 * s)} M ${pt(x + dir * 30 * s, y - 40 * s)} L ${pt(x + dir * 26 * s, y + 28 * s)}`, stroke: dark(pal.body, 0.2), 'stroke-width': 1.8, fill: 'none', 'stroke-linecap': 'round' }),
      giant ? h('path', { class: 'c-glowline', d: `M ${pt(x + dir * 20 * s, y - 6)} l ${r1(dir * 16 * s)} 6 l ${r1(dir * 14 * s)} -4`, stroke: pal.accent, 'stroke-width': 2, fill: 'none' }) : null));
  }
  parts.push(K.blob('c-torso', [E(bx, by, 22, 25)], bodyFill, line));
  parts.push(h('ellipse', { cx: bx, cy: r1(by + 6), rx: 13, ry: 15, fill: pal.belly, opacity: 0.9 }));
  parts.push(K.claws([[bx - 8, by + 26, -1], [bx + 8, by + 26, 1]], line, '#f3eadb', 3));
  const H = form.head;
  const jx = bx, jy = by - 22;
  const hr = 22;
  const hx = bx, hy = jy - 14;
  const headFill = K.vol(pal.body, hx - 8, hy - 10, hr * 2.4);
  const headParts = [];
  if (!f.has('seeker')) for (const dir of [-1, 1]) headParts.push(K.blob('c-ear', [P(`M ${pt(hx + dir * hr * 0.3, hy - hr * 0.6)} L ${pt(hx + dir * hr * 1.0, hy - hr * 1.7)} L ${pt(hx + dir * hr * 0.95, hy - hr * 0.4)} Z`)], headFill, line), h('path', { d: `M ${pt(hx + dir * hr * 0.45, hy - hr * 0.65)} L ${pt(hx + dir * hr * 0.9, hy - hr * 1.4)} L ${pt(hx + dir * hr * 0.82, hy - hr * 0.55)} Z`, fill: light(pal.accent, 0.4), opacity: 0.8 }));
  headParts.push(K.blob('c-skull', [C(hx, hy, hr)], headFill, line));
  headParts.push(h('ellipse', { cx: hx, cy: r1(hy + hr * 0.35), rx: r1(hr * 0.55), ry: r1(hr * 0.4), fill: pal.belly, opacity: 0.9 }));
  headParts.push(K.sheen(hx - hr * 0.35, hy - hr * 0.5, hr * 0.38, hr * 0.18));
  const eyeR = hr * (f.has('seeker') ? 0.36 : 0.28);
  headParts.push(K.eye(hx - hr * 0.42, hy - hr * 0.05, eyeR, { iris: pal.eye, skin: pal.body, line, glow: pal.eyeGlow, front: true }));
  headParts.push(K.eye(hx + hr * 0.42, hy - hr * 0.05, eyeR, { iris: pal.eye, skin: pal.body, line, glow: pal.eyeGlow, front: true }));
  headParts.push(K.solid(E(hx, hy + hr * 0.3, hr * 0.18, hr * 0.13), light(pal.accent, 0.3), line, 1));
  headParts.push(K.mouth(`M ${pt(hx - hr * 0.22, hy + hr * 0.52)} Q ${pt(hx, hy + hr * 0.68)} ${pt(hx + hr * 0.22, hy + hr * 0.52)}`, { open: [hx, hy + hr * 0.6, hr * 0.2, hr * 0.14], line, teeth: [[hx - hr * 0.15, hy + hr * 0.56, 3], [hx + hr * 0.15, hy + hr * 0.56, 3]] }));
  const hg = headGroup(jx, jy, H, headParts);
  parts.push(hg.node);
  return { parts, anchors: { floating: true, head: hg.map(hx, hy - hr), eye: hg.map(hx + hr * 0.42, hy), mouth: hg.map(hx, hy + hr * 0.55), neck: [bx, by - 16], body: [bx, by], top: hg.map(hx, hy - hr * 1.7)[1] } };
}

/* -------------------------------------------------------------------------- */
/* Fische                                                                        */
/* -------------------------------------------------------------------------- */

export function fish(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const parts = [];
  if (f.has('ray')) return ray(ctx);
  const deep = f.has('piranha') || f.has('angler');
  const big = f.has('whaleshark') || f.has('shark');
  const bx = 100, by = 110;
  const len = f.has('whaleshark') ? 70 : big ? 66 : deep ? 48 : 60;
  const ht = f.has('whaleshark') ? 34 : deep ? 36 : f.has('shark') ? 26 : 25;
  const nose = bx + len * 0.95, tail = bx - len * 0.85;
  const bodyFill = K.vol(pal.body, bx, by - ht, len * 1.6);
  const body = P(`M ${pt(nose, by + 2)} C ${pt(nose - 6, by - ht * 1.05)} ${pt(bx - len * 0.3, by - ht * 1.1)} ${pt(tail, by - 4)} L ${pt(tail, by + 6)} C ${pt(bx - len * 0.3, by + ht * 1.05)} ${pt(nose - 8, by + ht * 0.95)} ${pt(nose, by + 2)} Z`);
  // Schwanzflosse
  const fork = f.has('shark') ? [[-30, -38], [-18, 24]] : [[-28, -30], [-28, 30]];
  parts.push(K.blob('c-tail', [P(`M ${pt(tail + 6, by)} L ${pt(tail + fork[0][0], by + fork[0][1])} Q ${pt(tail - 8, by)} ${pt(tail + fork[1][0], by + fork[1][1])} Z`)], K.vol(pal.accent, tail - 10, by - 20, 40), line, { style: `transform-origin:${r1(tail + 6)}px ${r1(by)}px` }));
  // Rückenflosse
  const finH = f.has('shark') ? 34 : 20;
  parts.push(K.solid(P(`M ${pt(bx - 18, by - ht * 0.85)} Q ${pt(bx - 10, by - ht - finH * (0.6 + 0.4 * F))} ${pt(bx + 6, by - ht - finH * (0.65 + 0.35 * F))} Q ${pt(bx + 6, by - ht * 0.9)} ${pt(bx + 18, by - ht * 0.8)} Z`), K.vol(pal.accent, bx, by - ht - finH, finH * 1.6), line, 1.8));
  parts.push(K.blob('c-torso', [body], bodyFill, line));
  parts.push(h('path', { d: `M ${pt(nose - 4, by + 6)} C ${pt(nose - 12, by + ht * 0.8)} ${pt(bx - len * 0.4, by + ht * 0.8)} ${pt(tail + 8, by + 6)} C ${pt(bx - len * 0.3, by + ht * 0.3)} ${pt(nose - 20, by + ht * 0.2)} ${pt(nose - 4, by + 6)} Z`, fill: pal.belly, opacity: 0.95 }));
  parts.push(K.sheen(bx, by - ht * 0.6, len * 0.35, ht * 0.18, -8));
  if (f.has('spots')) for (const [dx, dy] of [[-0.4, -0.4], [-0.15, -0.55], [0.1, -0.35], [-0.55, -0.1], [0.3, -0.5], [-0.25, -0.15]]) parts.push(h('circle', { cx: r1(bx + len * dx), cy: r1(by + ht * dy), r: 3, fill: '#ffffff', opacity: 0.55 }));
  if (f.has('shark') || f.has('whaleshark')) for (let i = 0; i < 3; i++) parts.push(h('path', { d: `M ${pt(nose - len * 0.45 - i * 5, by - 6)} q 3 8 0 14`, stroke: dark(pal.body, 0.35), 'stroke-width': 1.5, fill: 'none', 'stroke-linecap': 'round' }));
  if (f.has('armored')) parts.push(K.solid(P(`M ${pt(nose, by + 2)} C ${pt(nose - 4, by - ht)} ${pt(nose - len * 0.5, by - ht * 1.05)} ${pt(nose - len * 0.55, by)} C ${pt(nose - len * 0.5, by + ht * 0.8)} ${pt(nose - 8, by + ht * 0.9)} ${pt(nose, by + 2)} Z`), K.vol(light(pal.body, 0.25), nose - 20, by - 20, 40), line, 1.8));
  // Brustflosse
  parts.push(K.solid(P(`M ${pt(bx + 16, by + 8)} Q ${pt(bx + 2, by + 30)} ${pt(bx - 10, by + (f.has('lobed') ? 30 : 26))} Q ${pt(bx + 4, by + 16)} ${pt(bx + 16, by + 8)} Z`), K.vol(pal.accent, bx, by + 20, 20), line, 1.6));
  if (f.has('lobed')) parts.push(K.solid(E(bx - 26, by + ht * 0.9, 9, 5, 30), pal.accent, line, 1.4));
  // Gesicht
  const ex = nose - len * 0.3, ey = by - ht * 0.3;
  const eyeR = f.has('whaleshark') ? 6 : 8.5;
  const my = by + ht * 0.25;
  const teeth = f.has('teeth') ? [[nose - 8, my - 1, 3.2], [nose - 16, my + 0.5, 2.8]] : [];
  const face = [];
  face.push(K.blush(ex + 4, ey + 12, 5));
  face.push(K.mouth(f.has('xiph') ? `M ${pt(nose - 2, by - 2)} Q ${pt(nose - 10, my + 4)} ${pt(nose - 24, my)}` : `M ${pt(nose - 3, my - 4)} Q ${pt(nose - 12, my + 3)} ${pt(nose - (f.has('whaleshark') ? 34 : 22), my - 2)}`, { open: [nose - 12, my, 9, 6], line, teeth }));
  if (f.has('salmon')) face.push(K.solid(P(`M ${pt(nose - 10, my)} q 1 8 -2 10 q -1 -5 -2 -10 z`), '#fbf4e2', line, 0.9));
  if (f.has('whorl')) face.push(h('path', { d: `M ${pt(nose - 22, my + 10)} a 8 8 0 1 1 -1 0.1 a 5 5 0 1 1 0 0.1`, stroke: '#fbf4e2', 'stroke-width': 3, fill: 'none', 'stroke-dasharray': '2 1.5' }), h('path', { d: `M ${pt(nose - 22, my + 10)} a 8 8 0 1 1 -1 0.1`, stroke: line, 'stroke-width': 1, fill: 'none' }));
  face.push(K.eye(ex, ey, eyeR, { iris: pal.eye, skin: pal.body, line, glow: pal.eyeGlow }));
  if (f.has('angler')) {
    face.push(h('path', { d: `M ${pt(nose - 22, by - ht * 0.9)} Q ${pt(nose, by - ht - 30)} ${pt(nose + 18, by - ht - 10)}`, stroke: line, 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round' }));
    face.push(K.glow(pal.glow, nose + 18, by - ht - 8, 16, 0.95), K.solid(C(nose + 18, by - ht - 8, 5), light(pal.glow, 0.4), line, 1.2));
  }
  const hg = headGroup(ex + 4, ey + 8, form.head, face);
  parts.push(hg.node);
  return { parts, anchors: { floating: true, head: hg.map(nose - 20, by - ht - 6), eye: hg.map(ex, ey), mouth: hg.map(nose - 10, my), neck: [nose - len * 0.45, by + 4], body: [bx, by], top: by - ht - finH } };
}

function ray(ctx) {
  const { K, pal, form } = ctx;
  const line = pal.line;
  const bx = 100, by = 112;
  const parts = [];
  parts.push(h('path', { class: 'c-tail', d: `M ${pt(bx - 20, by + 10)} Q ${pt(bx - 60, by + 20)} ${pt(bx - 86, by + 44)}`, stroke: line, 'stroke-width': 4.5, fill: 'none', 'stroke-linecap': 'round' }), h('path', { d: `M ${pt(bx - 20, by + 10)} Q ${pt(bx - 60, by + 20)} ${pt(bx - 86, by + 44)}`, stroke: pal.body, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }));
  const wing = `M ${pt(bx + 36, by)} Q ${pt(bx + 10, by - 44)} ${pt(bx - 50, by - 50)} Q ${pt(bx - 30, by - 10)} ${pt(bx - 30, by + 10)} Q ${pt(bx - 30, by + 30)} ${pt(bx - 52, by + 48)} Q ${pt(bx + 10, by + 44)} ${pt(bx + 36, by)} Z`;
  parts.push(h('g', { class: 'c-wing' }, K.blob(null, [P(wing)], K.vol(pal.body, bx - 10, by - 30, 80), line)));
  parts.push(h('path', { d: `M ${pt(bx + 30, by + 4)} Q ${pt(bx, by + 30)} ${pt(bx - 40, by + 36)} Q ${pt(bx - 10, by + 20)} ${pt(bx + 30, by + 4)} Z`, fill: pal.belly, opacity: 0.85 }));
  for (const dy of [-8, 8]) parts.push(K.solid(P(`M ${pt(bx + 32, by + dy)} q 14 ${r1(dy * 0.4)} 16 ${r1(dy * 1.6)} q -10 -2 -16 ${r1(-dy * 0.8)} z`), pal.body, line, 1.4));
  parts.push(K.sheen(bx - 10, by - 24, 26, 8, -20));
  const hg = headGroup(bx + 24, by, form.head, [
    K.eye(bx + 20, by - 14, 7, { iris: pal.eye, skin: pal.body, line }),
    K.mouth(`M ${pt(bx + 30, by + 12)} q 4 3 8 0`, { open: [bx + 34, by + 12, 6, 4], line }),
    K.blush(bx + 26, by, 4),
  ]);
  parts.push(hg.node);
  return { parts, anchors: { floating: true, head: hg.map(bx + 20, by - 30), eye: hg.map(bx + 20, by - 14), mouth: hg.map(bx + 34, by + 12), neck: [bx + 20, by + 10], body: [bx, by], top: by - 52 } };
}

/* -------------------------------------------------------------------------- */
/* Meeresreptilien & Wale                                                       */
/* -------------------------------------------------------------------------- */

export function swimmer(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const parts = [];
  const plesio = f.has('plesio');
  const whale = f.has('whale');
  const dolphin = f.has('dolphin');
  const bx = whale ? 96 : 92, by = plesio ? 126 : 116;
  const brx = whale ? (f.has('long') ? 60 : 54) : plesio ? 36 : dolphin ? 46 : 50;
  const bry = whale ? (f.has('shasta') ? 30 : 24) : plesio ? 25 : dolphin ? 21 : 20;
  const bodyFill = K.vol(pal.body, bx, by - bry, brx * 1.8);
  const farFill = K.vol(dark(pal.body, 0.18), bx, by, brx * 1.6);
  const flipper = (x, y, rot, fill, cls) => K.blob(cls, [E(x, y, 16, 7, rot)], fill, line);
  parts.push(flipper(bx + brx * 0.35, by + bry * 0.75, 35, farFill, 'c-leg l2'));
  if (plesio || f.has('pliosaur') || f.has('mosa')) parts.push(flipper(bx - brx * 0.45, by + bry * 0.75, 35, farFill, 'c-leg l3'));
  // Schwanz
  const tx = bx - brx - (whale || dolphin ? 8 : 18);
  const flukes = whale || dolphin || f.has('mosa') || f.has('shasta');
  parts.push(h('g', { class: 'c-tail', style: `transform-origin:${r1(bx - brx * 0.8)}px ${r1(by)}px` },
    K.blob(null, [P(`M ${pt(bx - brx * 0.7, by - bry * 0.6)} Q ${pt(tx + 8, by - 6)} ${pt(tx, by - 2)} L ${pt(tx, by + 4)} Q ${pt(tx + 10, by + 8)} ${pt(bx - brx * 0.6, by + bry * 0.7)} Z`)], bodyFill, line),
    flukes ? K.solid(P(`M ${pt(tx + 4, by)} Q ${pt(tx - 10, by - 24)} ${pt(tx - 20, by - 26)} Q ${pt(tx - 10, by)} ${pt(tx - 20, by + 26)} Q ${pt(tx - 10, by + 24)} ${pt(tx + 4, by)} Z`), K.vol(pal.accent === pal.body ? dark(pal.body, 0.1) : dark(pal.body, 0.08), tx - 10, by - 10, 30), line, 1.8) : null));
  if (dolphin || f.has('shasta')) {
    parts.push(K.solid(P(`M ${pt(bx - 10, by - bry * 0.9)} Q ${pt(bx - 4, by - bry - 22 * F - 4)} ${pt(bx + 10, by - bry - 20 * F - 4)} Q ${pt(bx + 8, by - bry * 0.9)} ${pt(bx + 16, by - bry * 0.8)} Z`), K.vol(dark(pal.body, 0.05), bx, by - bry - 16, 24), line, 1.6));
  }
  const neckLen = plesio ? 60 * (0.5 + F * 0.5) : 0;
  const jx = bx + brx * 0.78, jy = by - bry * 0.3;
  const hx = plesio ? jx + 30 * (0.5 + F * 0.5) : jx + 16, hy = plesio ? jy - neckLen : jy - 2;
  parts.push(K.blob('c-torso', [E(bx, by, brx, bry, -4), plesio ? T(`M ${pt(jx - 8, jy + 4)} Q ${pt(jx + 18, jy - neckLen * 0.4)} ${pt(hx - 4, hy + 8)}`, 14) : null], bodyFill, line));
  parts.push(h('ellipse', { cx: r1(bx + 6), cy: r1(by + bry * 0.4), rx: r1(brx * 0.72), ry: r1(bry * 0.45), fill: pal.belly, opacity: 0.95 }));
  parts.push(K.sheen(bx - 6, by - bry * 0.55, brx * 0.45, bry * 0.2, -6));
  if (f.has('spacey')) {
    for (const [dx, dy] of [[-0.5, -0.3], [-0.2, -0.55], [0.15, -0.4], [0.4, -0.2], [-0.35, 0]]) parts.push(h('circle', { class: 'c-glowdot', cx: r1(bx + brx * dx), cy: r1(by + bry * dy), r: 2.6, fill: pal.glow || pal.accent }));
    parts.push(h('path', { class: 'c-glowline', d: `M ${pt(bx - brx * 0.6, by - bry * 0.1)} Q ${pt(bx, by - bry * 0.7)} ${pt(bx + brx * 0.6, by - bry * 0.2)}`, stroke: pal.accent, 'stroke-width': 2, fill: 'none', opacity: 0.8 }));
  }
  if (f.has('sparkle')) for (const [dx, dy] of [[-0.6, -1.3], [0.2, -1.6], [0.7, -1.1]]) parts.push(h('path', { class: 'c-sparkle', d: `M ${pt(bx + brx * dx, by + bry * dy - 5)} l 1.5 3.5 l 3.5 1.5 l -3.5 1.5 l -1.5 3.5 l -1.5 -3.5 l -3.5 -1.5 l 3.5 -1.5 z`, fill: pal.glow || '#ffe07a' }));
  parts.push(flipper(bx + brx * 0.4, by + bry * 0.85, 40, bodyFill, 'c-leg l1'));
  if (plesio || f.has('pliosaur') || f.has('mosa')) parts.push(flipper(bx - brx * 0.4, by + bry * 0.85, 40, bodyFill, 'c-leg l4'));
  // Kopf
  const H = form.head;
  const r = f.has('pliosaur') ? 25 : plesio ? 17 : whale ? 22 : 21;
  const snout = f.has('mosa') || f.has('pliosaur') ? 1.1 : dolphin ? 0.9 : plesio ? 0.5 : whale ? 0.35 : 0.5;
  const hd = sideHead(ctx, { cx: hx, cy: hy, r, snout, teeth: f.has('teeth') || f.has('mosa') || f.has('pliosaur'), eyeR: r * 0.36, eyeX: 0.1 });
  const headParts = [...hd.parts];
  if (f.has('narwhal')) headParts.push(K.solid(P(`M ${pt(hd.tip - 4, hy - 2)} L ${pt(hd.tip + 44 * (0.4 + F * 0.6), hy - 16 * (0.4 + F * 0.6))} L ${pt(hd.tip - 2, hy + 4)} Z`), '#f7efdc', line, 1.3), h('path', { d: `M ${pt(hd.tip + 4, hy - 1)} l 4 -4 m 6 1 l 4 -4 m 6 1 l 4 -4`, stroke: dark('#f7efdc', 0.3), 'stroke-width': 1 }));
  if (f.has('spacey')) headParts.push(h('path', { d: `M ${pt(hx - r * 0.6, hy - r * 0.6)} q 10 -8 20 0`, stroke: pal.accent, 'stroke-width': 2.4, fill: 'none', class: 'c-glowline' }));
  const hg = headGroup(plesio ? hx - 4 : jx, plesio ? hy + 8 : jy, H, headParts);
  parts.push(hg.node);
  return { parts, anchors: { floating: true, head: hg.map(hx, hd.top), eye: hg.map(...hd.eye), mouth: hg.map(...hd.mouth), neck: [jx, jy + 8], body: [bx, by], top: hg.map(hx, hd.top)[1] } };
}

/* -------------------------------------------------------------------------- */
/* Schlangen, Würmer, Aale                                                      */
/* -------------------------------------------------------------------------- */

export function serpent(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const parts = [];
  if (f.has('heads5')) return hydra(ctx);
  const worm = f.has('worm');
  const water = f.has('eel') || f.has('lamprey') || f.has('leech');
  const w = worm ? 30 : f.has('leech') ? 22 : f.has('eel') || f.has('lamprey') ? 16 : 20;
  const d = worm
    ? 'M 70 186 C 64 150, 120 150, 112 110 C 108 90, 112 76, 122 66'
    : water ? 'M 16 122 C 40 96, 60 146, 88 120 C 110 100, 118 110, 132 104'
      : 'M 26 172 C 60 190, 136 190, 146 166 C 156 142, 120 136, 100 150 C 80 164, 70 132, 100 118 C 118 110, 126 100, 134 92';
  const bodyFill = K.vol(pal.body, 90, 120, 110);
  parts.push(K.blob('c-torso', [T(d, w)], bodyFill, line));
  if (worm) for (let i = 0; i < 6; i++) parts.push(h('path', { d: `M ${pt(92 + i * 1.5, 176 - i * 18)} q 14 4 26 -2`, stroke: dark(pal.body, 0.3), 'stroke-width': 2, fill: 'none', opacity: 0.6 }));
  else parts.push(h('path', { d, fill: 'none', stroke: pal.belly, 'stroke-width': r1(w * 0.35), opacity: 0.75, transform: 'translate(0 4)', 'stroke-linecap': 'round' }));
  if (f.has('pattern')) parts.push(h('path', { d, fill: 'none', stroke: pal.accent, 'stroke-width': r1(w * 0.45), 'stroke-dasharray': '5 9', opacity: 0.8, 'stroke-linecap': 'round' }));
  if (f.has('eel')) parts.push(h('path', { class: 'c-glowline', d, fill: 'none', stroke: pal.accent, 'stroke-width': 2, 'stroke-dasharray': '10 6', transform: 'translate(0 -4)' }));
  if (f.has('glowspots')) for (const [x, y] of [[50, 180], [90, 184], [130, 176], [96, 152]]) parts.push(h('circle', { class: 'c-glowdot', cx: x, cy: y, r: 3, fill: pal.glow }));
  parts.push(K.sheen(80, 176, 26, 4, 0, 0.25));
  const H = form.head;
  const end = worm ? [122, 66] : water ? [132, 104] : [134, 92];
  const jx = end[0], jy = end[1];
  const r = worm ? 22 : 19;
  const hx = jx + (worm ? 4 : 12), hy = jy - (worm ? 8 : 6);
  const headParts = [];
  if (f.has('hood')) headParts.push(K.solid(E(hx - 10, hy + 6, 18, 26, -10), K.vol(pal.accent, hx - 14, hy, 30), line, 1.8), h('path', { d: `M ${pt(hx - 18, hy - 6)} q 4 10 0 22 M ${pt(hx - 6, hy - 10)} q 3 12 0 26`, stroke: pal.glow || pal.accent, 'stroke-width': 2, fill: 'none', class: 'c-glowline' }));
  if (worm) {
    const fill = K.vol(pal.body, hx - 6, hy - 8, r * 2);
    headParts.push(K.blob('c-skull', [C(hx, hy, r)], fill, line));
    for (let i = 0; i < 5; i++) {
      const a = (-90 + i * 45 - 90) * Math.PI / 180;
      headParts.push(K.solid(P(`M ${pt(hx + Math.cos(a) * r * 0.9, hy + Math.sin(a) * r * 0.9)} l ${r1(Math.cos(a) * 10 - 4)} ${r1(Math.sin(a) * 10)} l ${r1(8)} 0 z`), pal.accent, line, 1.2));
    }
    headParts.push(h('circle', { cx: r1(hx + 4), cy: r1(hy + 4), r: r1(r * 0.42), fill: '#5a1a2a', stroke: line, 'stroke-width': 1.5 }));
    headParts.push(K.eye(hx - r * 0.35, hy - r * 0.35, r * 0.26, { iris: pal.eye, skin: pal.body, line }), K.eye(hx + r * 0.45, hy - r * 0.35, r * 0.26, { iris: pal.eye, skin: pal.body, line }));
    const hg = headGroup(jx, jy, H, headParts);
    parts.push(hg.node);
    return { parts, anchors: { head: hg.map(hx, hy - r), eye: hg.map(hx + r * 0.45, hy - r * 0.35), mouth: hg.map(hx + 4, hy + 4), neck: [112, 100], body: [100, 150], top: hg.map(hx, hy - r - 10)[1] } };
  }
  const hd = sideHead(ctx, { cx: hx, cy: hy, r, snout: f.has('lamprey') || f.has('leech') ? 0.15 : 0.55, eyeR: r * 0.38, eyeX: 0.15, teeth: false });
  headParts.push(...hd.parts);
  if (f.has('lamprey') || f.has('leech')) headParts.push(K.solid(C(hd.tip - 4, hy + 4, r * 0.34), '#5a1a2a', line, 1.4), h('circle', { cx: r1(hd.tip - 4), cy: r1(hy + 4), r: r1(r * 0.22), fill: 'none', stroke: '#fbf4e2', 'stroke-width': 1.6, 'stroke-dasharray': '2 1.6' }));
  else headParts.push(h('path', { class: 'c-tongue', d: `M ${pt(hd.tip - 2, hy + r * 0.3)} l 10 2 l 4 -3 m -4 3 l 4 3`, stroke: '#e8405a', 'stroke-width': 1.8, fill: 'none', 'stroke-linecap': 'round' }));
  if (f.has('eel')) headParts.push(K.glow(pal.glow, hx, hy, 26, 0.35));
  const hg = headGroup(jx, jy, H, headParts);
  parts.push(hg.node);
  return { parts, anchors: { floating: water, head: hg.map(hx, hd.top), eye: hg.map(...hd.eye), mouth: hg.map(...hd.mouth), neck: [jx - 8, jy + 10], body: [90, water ? 118 : 160], top: hg.map(hx, hd.top)[1] } };
}

function hydra(ctx) {
  const { K, pal, form } = ctx;
  const line = pal.line;
  const parts = [];
  const bodyFill = K.vol(pal.body, 90, 140, 90);
  const necks = [[-40, 70], [-18, 52], [6, 44], [30, 54], [50, 74]];
  parts.push(K.blob('c-torso', [E(96, 160, 60, 24)], bodyFill, line));
  let mainHead = null;
  necks.forEach(([dx, top], i) => {
    const x0 = 96 + dx * 0.6, y0 = 150;
    const x1 = 100 + dx, y1 = top;
    parts.push(K.blob(null, [T(`M ${pt(x0, y0)} Q ${pt(x0 + dx * 0.2, (y0 + y1) / 2)} ${pt(x1, y1 + 10)}`, 12)], bodyFill, line));
    const hd = sideHead(ctx, { cx: x1 + 4, cy: y1, r: 11 * (i === 2 ? 1.25 : 1), snout: 0.5, eyeR: 4.2 * (i === 2 ? 1.2 : 1), eyeX: 0.15 });
    parts.push(K.solid(P(`M ${pt(x1 - 6, y1 - 6)} q -8 -8 -4 -16 q 4 6 10 8 z`), pal.accent, line, 1.1));
    const g = headGroup(x1, y1 + 10, form.head * (i === 2 ? 1 : 0.9), hd.parts);
    parts.push(i === 2 ? g.node : h('g', { class: 'c-subhead' }, g.node.children));
    if (i === 2) mainHead = { g, hd, x: x1 + 4, y: y1 };
  });
  parts.push(h('ellipse', { cx: 96, cy: 170, rx: 44, ry: 8, fill: pal.belly, opacity: 0.8 }));
  const { g, hd } = mainHead;
  return { parts, anchors: { floating: true, head: g.map(mainHead.x, hd.top), eye: g.map(...hd.eye), mouth: g.map(...hd.mouth), neck: [100, 90], body: [96, 150], top: 24 } };
}

/* -------------------------------------------------------------------------- */
/* Schildkröten                                                                  */
/* -------------------------------------------------------------------------- */

export function turtle(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const F = form.feat;
  const parts = [];
  const sea = f.has('sea');
  const tall = f.has('tortoise');
  const bx = 92, by = sea ? 128 : 150;
  const sw = 50, sh = tall ? 50 : sea ? 30 : 38;
  const skin = K.vol(pal.body, bx, by, 70);
  const shellFill = K.vol(pal.accent, bx - 10, by - sh, sw * 1.8);
  if (sea) {
    parts.push(K.blob('c-leg l2', [E(bx + 30, by + 14, 20, 8, 30)], K.vol(dark(pal.body, 0.15), bx, by, 50), line));
    parts.push(K.blob('c-leg l3', [E(bx - 36, by + 12, 14, 6, -20)], K.vol(dark(pal.body, 0.15), bx, by, 50), line));
  } else {
    for (const [x, cls] of [[bx + 26, 'c-leg l2'], [bx - 30, 'c-leg l3']]) parts.push(K.blob(cls, [T(`M ${pt(x, by)} L ${pt(x, 176)}`, tall ? 18 : 14), E(x + 2, 179, tall ? 12 : 10, 5)], K.vol(dark(pal.body, 0.15), bx, by, 50), line));
  }
  parts.push(K.blob('c-tail', [P(`M ${pt(bx - sw + 6, by + 4)} l -14 6 l 12 4 z`)], skin, line));
  // Panzer
  const shell = P(`M ${pt(bx - sw - 4, by + 8)} C ${pt(bx - sw, by - sh * 1.35)} ${pt(bx + sw, by - sh * 1.35)} ${pt(bx + sw + 4, by + 8)} Q ${pt(bx, by + 18)} ${pt(bx - sw - 4, by + 8)} Z`);
  parts.push(K.blob('c-torso', [shell], shellFill, line));
  parts.push(h('path', { d: `M ${pt(bx - sw, by + 6)} Q ${pt(bx, by + 16)} ${pt(bx + sw, by + 6)}`, stroke: light(pal.accent, 0.35), 'stroke-width': 4, fill: 'none', opacity: 0.8 }));
  const hexes = [[0, -0.62], [-0.45, -0.42], [0.45, -0.42], [-0.22, -0.12], [0.22, -0.12]];
  for (const [dx, dy] of hexes) {
    const x = bx + dx * sw, y = by + dy * sh;
    const s = 9;
    parts.push(h('path', { d: `M ${pt(x - s, y)} L ${pt(x - s / 2, y - s * 0.8)} L ${pt(x + s / 2, y - s * 0.8)} L ${pt(x + s, y)} L ${pt(x + s / 2, y + s * 0.8)} L ${pt(x - s / 2, y + s * 0.8)} Z`, fill: light(pal.accent, 0.12), stroke: dark(pal.accent, 0.35), 'stroke-width': 1.4 }));
  }
  parts.push(K.sheen(bx - sw * 0.35, by - sh * 0.75, sw * 0.35, sh * 0.15));
  if (f.has('shellspikes')) for (let i = 0; i < 6; i++) { const x = bx - sw * 0.85 + i * sw * 0.34; parts.push(K.solid(P(`M ${pt(x - 4, by + 4)} l 4 9 l 4 -9 z`), light(pal.accent, 0.3), line, 1)); }
  if (f.has('moss') || f.has('island')) {
    parts.push(K.solid(P(`M ${pt(bx - sw * 0.7, by - sh * 0.7)} Q ${pt(bx, by - sh * 1.25)} ${pt(bx + sw * 0.7, by - sh * 0.7)} Q ${pt(bx, by - sh * 0.9)} ${pt(bx - sw * 0.7, by - sh * 0.7)} Z`), '#6fb04a', dark('#6fb04a', 0.5), 1.4));
    if (f.has('island')) {
      parts.push(h('path', { d: `M ${pt(bx + 8, by - sh * 0.98)} q -4 -30 6 -44`, stroke: '#7a5530', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }));
      for (const a of [-150, -110, -60, -20]) { const rad = a * Math.PI / 180; parts.push(K.solid(P(`M ${pt(bx + 14, by - sh - 42)} q ${r1(Math.cos(rad) * 12)} ${r1(Math.sin(rad) * 12 - 6)} ${r1(Math.cos(rad) * 22)} ${r1(Math.sin(rad) * 22 + 4)} q ${r1(-Math.cos(rad) * 8)} -2 ${r1(-Math.cos(rad) * 22)} ${r1(-Math.sin(rad) * 22 - 4)} z`), '#58a848', dark('#58a848', 0.5), 1)); }
    }
  }
  if (sea) {
    parts.push(K.blob('c-leg l1', [E(bx + 40, by + 18, 24, 9, 35)], skin, line));
    parts.push(K.blob('c-leg l4', [E(bx - 30, by + 16, 16, 7, -25)], skin, line));
  } else {
    for (const [x, cls] of [[bx + 36, 'c-leg l1'], [bx - 20, 'c-leg l4']]) parts.push(K.blob(cls, [T(`M ${pt(x, by + 6)} L ${pt(x, 177)}`, tall ? 19 : 15), E(x + 2, 179.5, tall ? 13 : 11, 5)], skin, line));
    parts.push(K.claws([[bx + 40, 182, 1], [bx + 44, 181.5, 1], [bx - 16, 182, 1], [bx - 12, 181.5, 1]], line, '#efe6d2', 2.6));
  }
  const H = form.head;
  const jx = bx + sw + 2, jy = by - 2;
  const r = 19;
  const hx = jx + 16, hy = jy - 10;
  const hd = sideHead(ctx, { cx: hx, cy: hy, r, snout: 0.35, eyeR: r * 0.4, eyeX: 0.2, skin: pal.body });
  const hg = headGroup(jx, jy, H, [K.blob(null, [T(`M ${pt(jx - 8, jy + 4)} L ${pt(hx - 6, hy + 6)}`, 13)], skin, line), ...hd.parts]);
  parts.push(hg.node);
  return { parts, anchors: { floating: sea, head: hg.map(hx, hd.top), eye: hg.map(...hd.eye), mouth: hg.map(...hd.mouth), neck: [jx + 4, jy], body: [bx, by], top: by - sh * 1.1 - (f.has('island') ? 50 : 0) } };
}

/* -------------------------------------------------------------------------- */
/* Amphibien                                                                     */
/* -------------------------------------------------------------------------- */

export function frog(ctx) {
  const { K, pal, form, f } = ctx;
  const line = pal.line;
  const parts = [];
  const H = form.head;
  if (f.has('boomerang') || f.has('axolotl')) {
    const axo = f.has('axolotl');
    const bx = 88, by = 152;
    const bodyFill = K.vol(pal.body, bx, by - 12, 60);
    parts.push(K.blob('c-tail', [P(`M ${pt(bx - 30, by - 8)} Q ${pt(bx - 70, by - 20)} ${pt(bx - 78, by)} Q ${pt(bx - 60, by + 16)} ${pt(bx - 28, by + 10)} Z`)], axo ? K.vol(light(pal.body, 0.15), bx - 50, by, 40) : bodyFill, line, { style: `transform-origin:${r1(bx - 30)}px ${r1(by)}px` }));
    parts.push(K.blob('c-torso', [E(bx, by, 38, 16)], bodyFill, line));
    parts.push(h('ellipse', { cx: r1(bx + 4), cy: r1(by + 7), rx: 28, ry: 6, fill: pal.belly, opacity: 0.9 }));
    for (const [x, cls] of [[bx + 22, 'c-leg l1'], [bx - 22, 'c-leg l4']]) parts.push(K.blob(cls, [T(`M ${pt(x, by + 6)} L ${pt(x + 4, 178)}`, 8), E(x + 7, 180, 7, 3.5)], bodyFill, line));
    const jx = bx + 32, jy = by - 6;
    const hx = jx + 16, hy = jy - 10;
    const headParts = [];
    const skin = K.vol(pal.body, hx - 6, hy - 8, 60);
    if (axo) {
      for (let i = 0; i < 3; i++) {
        const a = (-150 + i * 22) * Math.PI / 180;
        const ox = hx - 16 + i * 2, oy = hy - 8 + i * 8;
        headParts.push(K.blob('c-gill', [T(`M ${pt(ox, oy)} Q ${pt(ox + Math.cos(a) * 16, oy + Math.sin(a) * 10 - 6)} ${pt(ox + Math.cos(a) * 24, oy + Math.sin(a) * 18)}`, 5)], K.vol(pal.accent, ox, oy, 20), dark(pal.accent, 0.5)));
      }
      headParts.push(K.blob('c-skull', [E(hx, hy, 28, 22)], skin, line));
    } else {
      headParts.push(K.blob('c-skull', [P(`M ${pt(hx - 30, hy + 10)} Q ${pt(hx - 50, hy - 14)} ${pt(hx - 40, hy - 22)} Q ${pt(hx - 10, hy - 22)} ${pt(hx + 26, hy - 6)} Q ${pt(hx + 30, hy + 12)} ${pt(hx + 6, hy + 16)} Z`)], skin, line));
    }
    headParts.push(K.sheen(hx - 8, hy - 12, 12, 5));
    headParts.push(K.eye(hx + 4, hy - 6, 7, { iris: pal.eye, skin: pal.body, line }));
    headParts.push(K.blush(hx + 10, hy + 6, 4.5));
    headParts.push(K.mouth(`M ${pt(hx - 6, hy + 8)} Q ${pt(hx + 8, hy + 16)} ${pt(hx + 22, hy + 6)}`, { open: [hx + 8, hy + 11, 7, 5], line }));
    const hg = headGroup(jx, jy, H, headParts);
    parts.push(hg.node);
    return { parts, anchors: { floating: axo, head: hg.map(hx, hy - 22), eye: hg.map(hx + 4, hy - 6), mouth: hg.map(hx + 8, hy + 11), neck: [jx, jy + 6], body: [bx, by], top: hg.map(hx, hy - 30)[1] } };
  }
  // Kröte / Gloon – sitzend, Dreiviertel-Frontansicht
  const gloon = f.has('gloon');
  const bx = 100, by = 146;
  const bodyFill = K.vol(pal.body, bx - 10, by - 20, 70);
  for (const dir of [-1, 1]) parts.push(K.blob('c-leg ' + (dir < 0 ? 'l3' : 'l2'), [E(bx + dir * 38, by + 16, 18, 14, dir * 20), E(bx + dir * 46, 178, 14, 5)], K.vol(dark(pal.body, 0.1), bx + dir * 38, by + 10, 30), line));
  parts.push(K.blob('c-torso', [E(bx, by, 44, 32)], bodyFill, line));
  parts.push(h('ellipse', { cx: bx, cy: r1(by + 10), rx: 30, ry: 18, fill: pal.belly, opacity: gloon ? 0.7 : 0.92 }));
  if (gloon) for (const [x, y] of [[bx - 20, by - 6], [bx + 16, by - 12], [bx + 2, by + 12]]) parts.push(h('circle', { class: 'c-glowdot', cx: x, cy: y, r: 3.4, fill: pal.accent, opacity: 0.85 }));
  for (const dir of [-1, 1]) parts.push(K.blob('c-leg ' + (dir < 0 ? 'l4' : 'l1'), [T(`M ${pt(bx + dir * 18, by + 14)} L ${pt(bx + dir * 20, 177)}`, 9), E(bx + dir * 22, 179.5, 9, 4)], bodyFill, line));
  const jx = bx, jy = by - 22;
  const hx = bx, hy = jy - 10;
  const skin = K.vol(pal.body, hx - 10, hy - 12, 70);
  const eyeR = gloon ? 12 : 9;
  const headParts = [
    K.blob('c-skull', [E(hx, hy, 42, 24), C(hx - 22, hy - 18, eyeR + 5), C(hx + 22, hy - 18, eyeR + 5)], skin, line),
    K.sheen(hx - 16, hy - 8, 12, 5),
    K.eye(hx - 22, hy - 18, eyeR, { iris: pal.eye, skin: pal.body, line, front: true, glow: gloon ? pal.glow : null }),
    K.eye(hx + 22, hy - 18, eyeR, { iris: pal.eye, skin: pal.body, line, front: true, glow: gloon ? pal.glow : null }),
    K.blush(hx - 26, hy + 6, 6), K.blush(hx + 26, hy + 6, 6),
    K.mouth(`M ${pt(hx - 26, hy + 6)} Q ${pt(hx, hy + 18)} ${pt(hx + 26, hy + 6)}`, { open: [hx, hy + 12, 14, 7], line }),
  ];
  if (f.has('toad')) for (const [dx, dy] of [[-30, -2], [30, -2], [-6, -18]]) headParts.push(h('circle', { cx: r1(hx + dx), cy: r1(hy + dy), r: 2.4, fill: dark(pal.body, 0.2) }));
  const hg = headGroup(jx, jy, H, headParts);
  parts.push(hg.node);
  return { parts, anchors: { head: hg.map(hx, hy - 34), eye: hg.map(hx + 22, hy - 18), mouth: hg.map(hx, hy + 12), neck: [bx, by - 26], body: [bx, by], top: hg.map(hx, hy - 36)[1] } };
}
