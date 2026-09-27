/**
 * Einstieg für die Kreaturengrafik. Wählt den Körperbauplan der Art, wendet
 * Lebensphase, Variante (Alpha, Tek, Verwildert) und Zuchtmutationen an und
 * liefert ein eigenständiges SVG (viewBox 0–200), das die Oberfläche animiert.
 */
import { h } from './vdom.js';
import { makeKit, light, dark, gray, mix, lineOf, r1 } from './art-kit.js';
import { theropod, sauropod, quad, croc, mammal, ape, bird } from './art-land.js';
import { flyer, ptero, dragon, bat, fish, swimmer, serpent, turtle, frog } from './art-other.js';
import { bug, spider, mollusk, robot, special } from './art-misc.js';

export const FORMS = {
  egg: { head: 1.38, feat: 0.42, size: 0.6 },
  baby: { head: 1.38, feat: 0.42, size: 0.6 },
  juvenile: { head: 1.24, feat: 0.62, size: 0.72 },
  adolescent: { head: 1.11, feat: 0.84, size: 0.86 },
  adult: { head: 1, feat: 1, size: 1 },
  elder: { head: 1, feat: 1, size: 0.97 },
};

const ARCH = {
  theropod, sauropod, quad, croc, mammal, ape, bird, flyer, ptero, dragon, bat, fish, swimmer, serpent, turtle, frog,
  bug, spider, mollusk, robot, special,
};

let seq = 0;

// Irisfarben: fest pro Art (aus dem Namen gehasht), damit jede Art ihren Blick behält.
const IRIS = ['#c98a2e', '#9a7a34', '#58a060', '#3f86c8', '#b8602e', '#8a64c4', '#2fa3a0', '#c9a23a'];
function eyeTint(sp) {
  let h = 0;
  for (const ch of sp.key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return IRIS[h % IRIS.length];
}

export function palette(sp, { colors, variant, stage } = {}) {
  let [body, belly, accent, extra] = sp.colors;
  extra = extra || accent;
  if (colors) {
    if (colors[0]) body = colors[0];
    if (colors[1]) belly = colors[1];
    if (colors[2]) { accent = colors[2]; extra = colors[2]; }
  }
  if (variant === 'feral') {
    body = gray(dark(body, 0.1), 0.4);
    belly = gray(belly, 0.35);
    accent = gray(accent, 0.3);
  } else if (variant === 'tek') {
    body = mix(body, '#aebfd2', 0.4);
    accent = mix(accent, '#35d7ff', 0.55);
  }
  if (stage === 'baby' || stage === 'egg') {
    body = light(body, 0.1);
    belly = light(belly, 0.1);
  }
  if (stage === 'elder') body = gray(body, 0.25);
  return {
    body, belly, accent, extra,
    line: lineOf(body),
    eye: sp.eye || '#2a1d2e',
    eyeGlow: variant === 'tek' ? '#35d7ff' : variant === 'alpha' ? null : sp.eyeGlow || null,
    glow: sp.glow || null,
  };
}

/**
 * Erzeugt die Kreatur als SVG-Baum.
 * @param {object} sp Art aus species.js
 * @param {object} o  { stage, variant, teen, colors, className, flat, facing }
 */
export function creatureArt(sp, o = {}) {
  const stage = o.stage && o.stage !== 'egg' ? o.stage : 'adult';
  const form = FORMS[stage];
  const pal = palette(sp, { colors: o.colors, variant: o.variant, stage });
  const K = makeKit('k' + (seq++).toString(36));
  K.eyeTint = eyeTint(sp);
  const ctx = { K, sp, pal, form, f: new Set(sp.features), stage, variant: o.variant, teen: o.teen };
  const draw = ARCH[sp.arch] || theropod;
  const { parts, anchors } = draw(ctx);
  const floating = Boolean(anchors.floating);

  const under = [];
  if (o.variant === 'alpha') under.push(h('g', { class: 'c-aura' }, K.glow('#ff3b3b', anchors.body[0], anchors.body[1] - 10, 95, 0.55)));
  if (o.variant === 'tek') under.push(h('g', { class: 'c-aura' }, K.glow('#35d7ff', anchors.body[0], anchors.body[1] - 10, 90, 0.4)));
  const flat = o.flat === true;
  const shadowFilter = flat ? null : K.softShadow();
  under.push(h('ellipse', {
    class: 'c-shadow', cx: r1(anchors.body[0]), cy: 184, rx: floating ? 34 : 58, ry: floating ? 4 : 7, fill: '#000',
    opacity: floating ? 0.18 : 0.34, filter: shadowFilter ? `url(#${shadowFilter})` : null,
  }));

  const over = [];
  if (o.variant === 'feral') {
    const [x, y] = anchors.eye;
    over.push(h('path', { class: 'c-scar', d: `M ${r1(x - 8)} ${r1(y + 6)} l 7 9 M ${r1(x - 3)} ${r1(y + 5)} l 6 8`, stroke: '#7a2a2a', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.8 }));
  }
  if (o.variant === 'loyal' || o.variant === 'alpha') {
    const [x, y] = anchors.neck;
    over.push(h('g', { class: 'c-collar' },
      h('ellipse', { cx: r1(x), cy: r1(y), rx: 7, ry: 4, fill: '#c89a52', stroke: '#5b3b17', 'stroke-width': 1.4 }),
      h('circle', { cx: r1(x + 1), cy: r1(y + 5), r: 3.2, fill: o.variant === 'alpha' ? '#ff4d4d' : '#ffd36a', stroke: '#5b3b17', 'stroke-width': 1 })));
  }
  if (o.variant === 'tek') {
    const [x, y] = anchors.body;
    over.push(h('path', { class: 'c-tek', d: `M ${r1(x - 18)} ${r1(y - 4)} h 10 l 5 -6 h 12 M ${r1(x - 10)} ${r1(y + 8)} h 14 l 4 4 h 8`, stroke: '#5ff2ff', 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round', opacity: 0.9 }));
  }

  // Blick nach links (facing: -1) als feste Spiegelung – für Bilder und Canvas, wo kein CSS greift
  const turn = o.facing === -1 ? 'matrix(-1 0 0 1 200 0)' : null;

  // 3D-Licht (abschaltbar, z. B. für Silhouetten oder sehr kleine Vorschauen)
  const lit = flat ? null : K.shade3d({ rim: o.variant === 'tek' ? '#8ff3ff' : o.variant === 'alpha' ? '#ffd0c8' : '#e4f6ff' });

  const classes = ['creature', 'arch-' + sp.arch, 'st-' + stage];
  if (o.variant) classes.push('var-' + o.variant);
  if (o.teen === 'cheeky') classes.push('teen-cheeky');
  if (floating) classes.push('is-floating');
  if (o.className) classes.push(o.className);
  return h('svg', {
    viewBox: '-8 -8 216 216', class: classes.join(' '), role: 'img', 'aria-label': o.title || sp.name,
    'data-mouth': anchors.mouth.map(r1).join(','), 'data-head': anchors.head.map(r1).join(','),
  },
  h('defs', {}, K.defs),
  // Gespiegelt (Blickrichtung) wird innerhalb der beleuchteten Gruppe: Eine
  // negative Skalierung außen herum bricht in Chromium den Lichtfilter, und so
  // kommt das Licht auch beim Umdrehen weiter von links oben.
  h('g', { class: 'c-turn', transform: turn }, under),
  h('g', { class: 'c-figure', filter: lit ? `url(#${lit})` : null },
    h('g', { class: 'c-turn', transform: turn },
      h('g', { class: 'c-body', style: 'transform-origin:100px 182px' }, parts),
      over)));
}
