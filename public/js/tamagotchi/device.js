/**
 * Das Gerät: Ei-förmiges Tek-Gehäuse mit Bildschirm, den acht klassischen
 * Symbolen, den Tasten A/B/C, der ARK-Pflegeleiste und den Info-Kacheln.
 * Steuert Animationen und leitet Aktionen an die Engine weiter.
 */
import { el } from '../ui.js';
import { t, timeAgo } from '../i18n.js';
import * as E from './engine.js';
import { SPECIES } from './species.js';
import { creatureArt, FORMS } from './art.js';
import { sceneArt, dayPhase, poopArt, foodArt, eggArt, cryoArt, graveArt, icon, DIET_FOOD } from './scene.js';
import { h, toDom, toSvgString, fitViewBox } from './vdom.js';
import { petState, petNow, onPetChange, petAct, tickPet } from './store.js';
import { sfx, buzz } from './sound.js';
import { GAMES } from './games.js';

export const BY_KEY = new Map(SPECIES.map((s) => [s.key, s]));
export const svg = (node) => toDom(node);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ICONS = ['feed', 'lights', 'play', 'medicine', 'clean', 'status', 'discipline', 'attention'];
const SELECTABLE = 7;

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

export function faceFor(mood) {
  return { happy: 'happy', sleep: 'sleep', sad: 'sad', sick: 'sick', dazed: 'sick', cheeky: 'cheeky', tired: 'tired', gone: 'dead' }[mood] || 'open';
}

export function requestText(req, sp) {
  if (!req) return '';
  if (req.type === 'meal') return t('tama.request.meal', { food: t('tama.food.' + (DIET_FOOD[sp?.diet] || 'meat')) });
  return t('tama.request.' + req.type);
}

/**
 * SVG-Filter für den Retro-Modus: rastert den Bildschirm in 5-px-Blöcke und
 * reduziert ihn auf vier grünliche Graustufen wie das LCD von 1996.
 */
function lcdFilter() {
  return svg(h('svg', { class: 'tama-defs', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' },
    h('filter', { id: 'tama-lcd-filter', x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' },
      h('feFlood', { x: 2, y: 2, width: 1, height: 1 }),
      h('feComposite', { width: 5, height: 5 }),
      h('feTile', { result: 'grid' }),
      h('feComposite', { in: 'SourceGraphic', in2: 'grid', operator: 'in' }),
      h('feMorphology', { operator: 'dilate', radius: 2 }),
      h('feColorMatrix', { type: 'saturate', values: 0 }),
      // Aufhellen, damit auch Nachtszenen nicht nur aus der dunkelsten Stufe bestehen
      h('feComponentTransfer', {},
        h('feFuncR', { type: 'gamma', exponent: 0.55 }),
        h('feFuncG', { type: 'gamma', exponent: 0.55 }),
        h('feFuncB', { type: 'gamma', exponent: 0.55 })),
      h('feComponentTransfer', {},
        h('feFuncR', { type: 'discrete', tableValues: '0.11 0.3 0.52 0.71' }),
        h('feFuncG', { type: 'discrete', tableValues: '0.15 0.36 0.6 0.77' }),
        h('feFuncB', { type: 'discrete', tableValues: '0.08 0.2 0.38 0.56' })))));
}

/** Beschriftete Kreatur für Karten (Dossier, Gehege …) als leichtgewichtiges Bild. */
const thumbCache = new Map();
export function creatureThumb(sp, o = {}, cls = '') {
  const key = [sp.key, o.stage || 'adult', o.variant || '', JSON.stringify(o.colors || null)].join('|');
  let src = thumbCache.get(key);
  if (!src) {
    const node = fitViewBox(creatureArt(sp, o));
    src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvgString(node));
    thumbCache.set(key, src);
  }
  return el('img.tama-thumb' + (cls ? '.' + cls : ''), { src, alt: o.alt || '', loading: 'lazy', decoding: 'async' });
}

/* -------------------------------------------------------------------------- */
/* Pflege-Ansicht                                                               */
/* -------------------------------------------------------------------------- */

export function createCare({ openNest, openSettings, toast }) {
  const scene = el('div.tama-scene');
  const props = el('div.tama-props');
  const flip = el('div.tama-pet-flip');
  const marks = el('div.tama-marks');
  const petBox = el('div.tama-pet.pet-live', { style: 'left:26%' }, flip, marks);
  const fx = el('div.tama-fx');
  const darkness = el('div.tama-dark', {}, el('span.tama-moon'));
  const lcd = el('div.tama-lcd', {}, scene, props, petBox, fx, darkness);
  const overlay = el('div.tama-overlay');
  const say = el('div.tama-say', { role: 'status', 'aria-live': 'polite' });
  const screen = el('div.tama-screen', { role: 'group', 'aria-label': t('tama.screen_label') }, lcd, overlay, say);

  const iconBtns = ICONS.map((name, i) => el('button.tama-ico', {
    type: 'button', dataset: { act: name }, title: t('tama.act.' + name), 'aria-label': t('tama.act.' + name),
    disabled: name === 'attention' ? true : null,
    onclick: () => { sel = i; renderIcons(); activate(name); },
  }, svg(icon(name)), el('span.tama-ico-label', { text: t('tama.act.' + name) })));
  const keys = ['a', 'b', 'c'].map((k) => {
    const b = el('button.tama-key', { type: 'button', dataset: { key: k }, 'aria-label': t('tama.btn.' + k) }, el('span', { text: k.toUpperCase() }));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('is-down'); press(k, true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (b.classList.contains('is-down')) { b.classList.remove('is-down'); press(k, false); } });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(k, true); press(k, false); } });
    return b;
  });

  const shell = el('div.tama-shell', {},
      el('div.tama-shell-gloss', { 'aria-hidden': 'true' }),
      el('div.tama-brand', { 'aria-hidden': 'true' }, el('b', { text: 'TEK' }), el('span', { text: 'GOTCHI' })),
      el('div.tama-bezel', {},
        el('div.tama-icons.is-top', {}, iconBtns.slice(0, 4)),
        screen,
        el('div.tama-icons.is-bottom', {}, iconBtns.slice(4))),
      el('div.tama-keys', {}, keys),
      el('div.tama-keys-hint', { text: t('tama.keys_hint') }));
  const device = el('div.tama-device', {}, lcdFilter(), el('div.tama-keyring', { 'aria-hidden': 'true' }), shell);
  // Glanzlicht folgt dem Zeiger wie auf einer echten Kunststoffschale
  shell.addEventListener('pointermove', (e) => {
    const r = shell.getBoundingClientRect();
    shell.style.setProperty('--gx', `${Math.round((e.clientX - r.left) / r.width * 100)}%`);
    shell.style.setProperty('--gy', `${Math.round((e.clientY - r.top) / r.height * 100)}%`);
  });
  shell.addEventListener('pointerleave', () => { shell.style.removeProperty('--gx'); shell.style.removeProperty('--gy'); });

  const dock = el('div.tama-dock');
  const bento = el('div.tama-bento');
  const root = el('div.tama-care', {}, el('div.tama-device-col', {}, device, dock), bento);

  let sel = -1, menu = null, game = null, statusPage = null, busy = false;
  let artKey = '', sceneKey = '', poopCount = -1, anchors = { head: [120, 60], mouth: [150, 90], floating: false };
  let facing = 1, walkEnd = 0, wanderTimer = 0, secondTimer = 0, lastCall = 0, destroyed = false;

  const pet = () => petState.doc?.pet || null;
  const species = () => BY_KEY.get(pet()?.species);

  function speak(text, ms = 2800) {
    if (!text) return;
    say.textContent = text;
    say.classList.add('is-on');
    clearTimeout(speak.timer);
    speak.timer = setTimeout(() => say.classList.remove('is-on'), ms);
  }

  function resText(res) {
    const p = pet();
    return t('tama.res.' + res.code, { name: p?.name || '', gen: p?.gen || 1, n: Math.round(res.imprint || 0) });
  }

  /* ------------------------------ Bildschirm ------------------------------ */

  function toPct([x, y]) { return [((x + 8) / 216) * 100, ((y + 8) / 216) * 100]; }

  function renderScreen() {
    const p = pet();
    const sp = species();
    if (!p || !sp) return;
    const now = petNow();
    const phase = dayPhase(now);
    const sk = sp.biome + phase;
    if (sk !== sceneKey) { scene.replaceChildren(svg(sceneArt(sp.biome, phase))); sceneKey = sk; }
    screen.classList.toggle('is-retro', Boolean(petState.doc.settings.retro));

    const stage = p.stage;
    const key = [p.id, stage, p.variant, p.teen, JSON.stringify(p.colors), p.end ? 'end' : '', stage === 'egg' ? Math.min(3, Math.floor(E.stageInfo(p, now).pct / 34)) : ''].join('|');
    if (key !== artKey) {
      artKey = key;
      petBox.classList.remove('is-egg', 'is-grave', 'is-floating');
      // Ei und Grabstein nie gespiegelt zeigen (sonst stünde der Name verkehrt herum)
      if (stage === 'egg' || p.end) setFacing(1);
      if (stage === 'egg') {
        flip.replaceChildren(svg(eggArt(sp, { cracks: Math.min(3, Math.floor(E.stageInfo(p, now).pct / 34)) })));
        petBox.classList.add('is-egg');
        petBox.style.width = '30%';
        petBox.style.left = '35%';
        petBox.style.bottom = '12%';
        anchors = { head: [100, 10], mouth: [100, 60], floating: false };
      } else if (p.end) {
        flip.replaceChildren(svg(graveArt(p.name)));
        petBox.classList.add('is-grave');
        petBox.style.width = '40%';
        petBox.style.left = '30%';
        petBox.style.bottom = '8%';
      } else {
        const art = creatureArt(sp, { stage, variant: p.variant, teen: p.teen, colors: p.colors, title: p.name });
        flip.replaceChildren(svg(art));
        const head = (art.attrs['data-head'] || '120,60').split(',').map(Number);
        const mouth = (art.attrs['data-mouth'] || '150,90').split(',').map(Number);
        const floating = String(art.attrs.class).includes('is-floating');
        anchors = { head, mouth, floating };
        petBox.classList.toggle('is-floating', floating);
        const size = (FORMS[stage]?.size || 1) * 50;
        petBox.style.width = size + '%';
        petBox.style.bottom = floating ? '22%' : '4%';
      }
    }
    const mood = E.mood(p, now);
    petBox.dataset.mood = mood;
    if (!petBox.dataset.expr) petBox.dataset.face = faceFor(mood);
    petBox.classList.toggle('is-frozen', Boolean(p.cryo));
    petBox.classList.toggle('is-sick', Boolean(p.sick) && !p.end);
    darkness.classList.toggle('is-on', Boolean(p.lightsOff) && !p.end && !p.cryo);

    if (p.poop !== poopCount) {
      poopCount = p.poop;
      props.replaceChildren(...Array.from({ length: p.poop }, (_, i) => el('div.tama-poop', { style: `right:${4 + i * 11}%;bottom:${5 + (i % 2) * 4}%` }, svg(poopArt()))));
    }

    // Markierungen über dem Kopf (bewegen sich mit dem Tier)
    const [hx, hy] = toPct(anchors.head);
    const left = facing < 0 ? 100 - hx : hx;
    const list = [];
    // Abstände in cqw (Bildschirmbreite), damit Markierungen auch bei kleinen Babys nicht übereinanderliegen
    const at = (dx, dy) => `left:calc(${left.toFixed(1)}% + ${facing < 0 ? -dx : dx}cqw);top:calc(${hy.toFixed(1)}% + ${dy}cqw)`;
    if (p.cryo) list.push(el('div.tama-cryo', {}, svg(cryoArt())));
    if (!p.end && !p.cryo && p.stage !== 'egg') {
      if (p.asleep) list.push(el('div.tama-mark.is-zzz', { style: at(4, -13) }, el('b', { text: 'z' }), el('b', { text: 'z' }), el('b', { text: 'Z' })));
      if (p.sick) list.push(el('div.tama-mark.is-sick', { style: at(-11, -12), title: t('tama.need.sick') }, svg(icon('skull'))));
      const calls = E.calling(p, now).filter((c) => c !== 'sick' && c !== 'imprint');
      if (calls.length && !p.asleep) list.push(el('div.tama-mark.is-call', { style: at(10, -11) }, el('b', { text: '!' })));
      if (p.request && !p.asleep) list.push(el('div.tama-mark.is-request', { style: at(-1, -19), title: requestText(p.request, species()) }, svg(p.request.type === 'meal' ? foodArt(DIET_FOOD[species().diet] || 'meat') : p.request.type === 'snack' ? foodArt('kibble') : icon(p.request.type === 'cuddle' ? 'cuddle' : 'walk'))));
    }
    marks.replaceChildren(...list);
  }

  function setFacing(dir) {
    facing = dir;
    flip.style.transform = dir < 0 ? 'scaleX(-1)' : '';
  }

  const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

  function wander() {
    const p = pet();
    if (!p || destroyed || busy || game || menu || statusPage !== null || p.stage === 'egg' || p.end || p.cryo || p.asleep) return;
    if (calm?.matches) return; // ohne Übergänge würde das Tier nur springen
    const cur = parseFloat(petBox.style.left) || 26;
    const width = parseFloat(petBox.style.width) || 50;
    const max = Math.max(4, 96 - width);
    const target = 2 + Math.random() * (max - 2);
    const dist = Math.abs(target - cur);
    if (dist < 4) return;
    setFacing(target < cur ? -1 : 1);
    petBox.style.transitionDuration = `${(dist * (p.sick ? 0.16 : 0.08)).toFixed(2)}s`;
    petBox.classList.add('is-walking');
    petBox.style.left = target + '%';
    if (anchors.floating) petBox.style.bottom = (16 + Math.random() * 24).toFixed(1) + '%';
    clearTimeout(walkEnd);
    walkEnd = setTimeout(() => { petBox.classList.remove('is-walking'); renderScreen(); }, dist * 80 + 60);
  }

  /* ------------------------------ Effekte -------------------------------- */

  function burst(kind, count = 3) {
    const [hx, hy] = toPct(anchors.head);
    const width = parseFloat(petBox.style.width) || 50;
    const left = parseFloat(petBox.style.left) || 26;
    const x = left + (facing < 0 ? 100 - hx : hx) * width / 100;
    const bottomPct = parseFloat(petBox.style.bottom) || 4;
    const y = 100 - bottomPct - (100 - hy) * width / 100 * (4 / 3) * 0.75;
    for (let i = 0; i < count; i++) {
      const node = el('div.tama-burst.is-' + kind, { style: `left:${(x + (i - (count - 1) / 2) * 7).toFixed(1)}%;top:${Math.max(2, y).toFixed(1)}%;animation-delay:${i * 120}ms` }, kind === 'heart' ? svg(icon('heart')) : kind === 'star' ? svg(icon('star')) : el('b', { text: kind === 'note' ? '♪' : '✦' }));
      fx.append(node);
      setTimeout(() => node.remove(), 1600 + i * 120);
    }
  }

  async function withExpr(expr, ms, face = null) {
    petBox.dataset.expr = expr;
    if (face) petBox.dataset.face = face;
    petBox.classList.add('expr-' + expr);
    await wait(ms);
    petBox.classList.remove('expr-' + expr);
    delete petBox.dataset.expr;
    renderScreen();
  }

  function refuse(res) {
    sfx('refuse');
    buzz([15, 40, 15]);
    speak(resText(res));
    if (['full', 'healthy', 'not_tired', 'cooldown', 'tired', 'sick', 'dazed'].includes(res.code)) withExpr('refuse', 700);
  }

  function propAt(node, cls, pctX, pctY) {
    const box = el('div.tama-prop.' + cls, { style: `left:${pctX}%;top:${pctY}%` }, svg(node));
    fx.append(box);
    return box;
  }

  function mouthPos() {
    const [mx, my] = toPct(anchors.mouth);
    const width = parseFloat(petBox.style.width) || 50;
    const left = parseFloat(petBox.style.left) || 26;
    const bottomPct = parseFloat(petBox.style.bottom) || 4;
    const x = left + (facing < 0 ? 100 - mx : mx) * width / 100;
    const y = 100 - bottomPct - (100 - my) * width / 100 * (4 / 3);
    return [x, y];
  }

  /* ------------------------------- Aktionen ------------------------------- */

  function imprintNote(res) {
    if (res.imprint > 0) setTimeout(() => { speak(t('tama.res.imprint', { n: Math.round(res.imprint) })); sfx('happy'); burst('star', 3); }, 900);
  }

  async function doFeed(kind) {
    closeMenu();
    const res = petAct((d, now) => E.feed(d.pet, kind, now));
    if (!res.ok) return refuse(res);
    busy = true;
    const food = kind === 'meal' ? DIET_FOOD[species().diet] || 'meat' : 'kibble';
    const [x, y] = mouthPos();
    const item = propAt(foodArt(food), 'is-food', Math.min(86, Math.max(4, x + (facing < 0 ? -12 : 2))), Math.max(4, y - 6));
    sfx('eat');
    await withExpr('eat', 1250, 'happy');
    item.remove();
    burst('heart', 3);
    speak(res.tummy ? t('tama.res.tummy') : resText(res));
    imprintNote(res);
    busy = false;
  }

  async function doClean() {
    const res = petAct((d, now) => E.clean(d.pet, now));
    if (!res.ok) return refuse(res);
    busy = true;
    sfx('clean');
    const wave = el('div.tama-sweep', {}, svg(creatureArt(BY_KEY.get('dung_beetle'), { stage: 'baby' })));
    fx.append(wave);
    await wait(900);
    poopCount = -1;
    renderScreen();
    await wait(500);
    wave.remove();
    burst('sparkle', 4);
    speak(resText(res));
    busy = false;
  }

  async function doMedicine() {
    const res = petAct((d, now) => E.medicine(d.pet, now));
    if (!res.ok) return refuse(res);
    busy = true;
    const [x, y] = mouthPos();
    const flask = propAt(foodArt('medicine'), 'is-flask', Math.min(84, Math.max(4, x - 4)), Math.max(2, y - 26));
    await withExpr('flinch', 900, 'sick');
    flask.remove();
    if (res.code === 'cured') { sfx('cure'); burst('sparkle', 5); } else sfx('select');
    speak(resText(res));
    busy = false;
  }

  function doLights() {
    const res = petAct((d, now) => E.lights(d.pet, now));
    if (!res.ok) return refuse(res);
    sfx(res.code === 'lights_on' ? 'select' : 'back');
    speak(resText(res));
  }

  async function doScold() {
    const res = petAct((d, now) => E.scold(d.pet, now));
    if (!res.ok) return refuse(res);
    busy = true;
    sfx('scold');
    buzz([30, 40, 30]);
    await withExpr('scolded', 900, res.code === 'unfair' ? 'sad' : 'cheeky');
    if (res.code === 'unfair') await withExpr('sad', 1200, 'sad');
    else { burst('sparkle', 2); }
    speak(resText(res));
    busy = false;
  }

  async function doCuddle() {
    const res = petAct((d, now) => E.cuddle(d.pet, now));
    if (!res.ok) return refuse(res);
    busy = true;
    sfx('cuddle');
    const [x, y] = mouthPos();
    const hand = propAt(icon('cuddle', 'is-hand'), 'is-hand', Math.min(84, Math.max(2, x - 10)), Math.max(0, y - 30));
    await withExpr('cuddle', 1300, 'happy');
    hand.remove();
    burst('heart', 4);
    speak(resText(res));
    imprintNote(res);
    busy = false;
  }

  async function doWalk() {
    const res = petAct((d, now) => E.walk(d.pet, now));
    if (!res.ok) return refuse(res);
    busy = true;
    sfx('happy');
    const start = parseFloat(petBox.style.left) || 26;
    const width = parseFloat(petBox.style.width) || 50;
    const far = start > 30 ? 0 : 96 - width;
    setFacing(far < start ? -1 : 1);
    petBox.style.transitionDuration = '1.6s';
    petBox.classList.add('is-walking', 'is-trot');
    petBox.style.left = far + '%';
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const paw = el('div.tama-paw', { style: `left:${(start + (far - start) * (i + 0.5) / 5 + width * 0.35).toFixed(1)}%;bottom:${3 + (i % 2) * 3}%` }, svg(icon('walk')));
        fx.append(paw);
        setTimeout(() => paw.remove(), 2400);
      }, i * 300);
    }
    await wait(1700);
    setFacing(-facing);
    petBox.style.left = start + '%';
    await wait(1700);
    petBox.classList.remove('is-walking', 'is-trot');
    burst('heart', 3);
    speak(resText(res));
    imprintNote(res);
    busy = false;
  }

  function doCryo() {
    const p = pet();
    const res = petAct((d, now) => (p.cryo ? E.thaw(d.pet, now) : E.freeze(d.pet, now)));
    if (!res.ok) return refuse(res);
    sfx(res.code === 'thaw' ? 'thaw' : 'cryo');
    speak(resText(res));
    artKey = '';
    renderAll();
  }

  function doWarm() {
    const res = petAct((d, now) => E.warm(d.pet, now));
    if (!res.ok) { if (res.code === 'warm_max') speak(resText(res)); return; }
    sfx('tick');
    buzz(10);
    petBox.classList.remove('is-warming');
    void petBox.offsetWidth;
    petBox.classList.add('is-warming');
    speak(resText(res), 1400);
  }

  function startGame(def) {
    closeMenu();
    const p = pet();
    const block = E.canPlay(p, petNow());
    if (block) return refuse({ ok: false, code: block });
    overlay.classList.add('is-open', 'is-game');
    const host = el('div.tama-game');
    const quit = el('button.tama-menu-close', { type: 'button', 'aria-label': t('tama.game.quit'), onclick: () => endGame(null) }, '×');
    overlay.replaceChildren(host, quit);
    game = def.start(host, {
      pet: p, sp: species(), food: DIET_FOOD[species().diet] || 'meat',
      onEnd: (result) => endGame(result),
    });
  }

  function endGame(result) {
    game?.destroy();
    game = null;
    overlay.classList.remove('is-open', 'is-game');
    overlay.replaceChildren();
    if (!result) return;
    const res = petAct((d, now) => E.play(d.pet, result, now));
    if (!res.ok) return refuse(res);
    speak(resText(res));
    if (result.won) { burst('star', 4); withExpr('cheer', 1200, 'happy'); }
    else withExpr('sad', 1000, 'sad');
  }

  /* ------------------------------- Menüs ---------------------------------- */

  function openMenu(title, items) {
    statusPage = null;
    menu = { title, items, index: 0 };
    renderMenu();
  }

  function closeMenu() {
    menu = null;
    statusPage = null;
    renderMenu();
  }

  function pick(i) {
    const item = menu?.items[i];
    if (!item || item.disabled) return;
    sfx('select');
    item.run();
  }

  function renderMenu() {
    if (game) return;
    if (statusPage !== null) return renderStatus();
    if (!menu) { overlay.classList.remove('is-open'); overlay.replaceChildren(); return; }
    overlay.classList.add('is-open');
    overlay.replaceChildren(el('div.tama-menu', { role: 'menu', 'aria-label': menu.title },
      el('div.tama-menu-title', { text: menu.title }),
      el('div.tama-menu-items', {}, menu.items.map((it, i) => el('button.tama-menu-item' + (i === menu.index ? '.is-sel' : ''), {
        type: 'button', role: 'menuitem', disabled: it.disabled ? true : null, onclick: () => { menu.index = i; pick(i); },
      },
      it.art ? el('span.tama-menu-art', {}, svg(it.art)) : null,
      el('span.tama-menu-copy', {}, el('strong', { text: it.label }), it.hint ? el('small', { text: it.hint }) : null)))),
      el('button.tama-menu-close', { type: 'button', 'aria-label': t('tama.close'), onclick: closeMenu }, '×')));
  }

  function hearts(value) {
    const full = Math.round(value / 25);
    return el('span.tama-hearts', { 'aria-label': `${Math.round(value)} %` }, [0, 1, 2, 3].map((i) => el('span.tama-heart' + (i < full ? '.is-full' : ''), {}, svg(icon('heart')))));
  }

  function renderStatus() {
    const p = pet();
    const pages = [
      [[t('tama.meter.hunger'), hearts(p.m.hunger)], [t('tama.meter.happy'), hearts(p.m.happy)]],
      [[t('tama.meter.discipline'), el('span.tama-segs', {}, [0, 1, 2, 3].map((i) => el('span' + (i < p.m.discipline / 25 ? '.is-on' : ''))))], [t('tama.card.imprint'), el('b', { text: Math.round(p.m.imprint) + ' %' })]],
      [[t('tama.meter.age'), el('b', { text: dur(E.ageMs(p, petNow())) })], [t('tama.meter.weight'), el('b', { text: `${Math.round(p.m.weight)} · ${t('tama.weight.' + E.weightStatus(p))}` })]],
      [[t('tama.pers.' + p.personality), el('small', { text: t('tama.pers_desc.' + p.personality) })], [t('tama.gen_short', { n: p.gen }), el('b', { text: t('tama.mode.' + p.mode) })]],
    ];
    const page = pages[statusPage % pages.length];
    overlay.classList.add('is-open');
    overlay.replaceChildren(el('div.tama-menu.is-status', { role: 'dialog', 'aria-label': t('tama.act.status') },
      el('div.tama-menu-title', { text: `${t('tama.act.status')} ${statusPage % pages.length + 1}/${pages.length}` }),
      ...page.map(([label, value]) => el('div.tama-status-row', {}, el('span', { text: label }), value)),
      el('button.tama-status-next', { type: 'button', onclick: () => { statusPage += 1; sfx('tick'); renderStatus(); } }, '▶'),
      el('button.tama-menu-close', { type: 'button', 'aria-label': t('tama.close'), onclick: closeMenu }, '×')));
  }

  function activate(name) {
    const p = pet();
    if (!p) return;
    if (p.stage === 'egg') { if (name !== 'status') return doWarm(); }
    if (p.end) { openNest?.(); return; }
    switch (name) {
      case 'feed': {
        const food = DIET_FOOD[species().diet] || 'meat';
        openMenu(t('tama.act.feed'), [
          { label: t('tama.act.meal'), hint: t('tama.meal_hint', { food: t('tama.food.' + food) }), art: foodArt(food), run: () => doFeed('meal') },
          { label: t('tama.act.snack'), hint: t('tama.snack_hint'), art: foodArt('kibble'), run: () => doFeed('snack') },
        ]);
        break;
      }
      case 'lights': doLights(); break;
      case 'play':
        openMenu(t('tama.game.title'), GAMES.map((g) => ({ label: t(g.title), hint: t(g.desc), run: () => startGame(g) })));
        break;
      case 'medicine': doMedicine(); break;
      case 'clean': doClean(); break;
      case 'status': menu = null; statusPage = 0; renderStatus(); break;
      case 'discipline': doScold(); break;
      default: break;
    }
  }

  function press(k, down = true) {
    if (game) { game.button(k, down); return; }
    if (!down) return;
    sfx('tick');
    buzz(6);
    const p = pet();
    if (statusPage !== null) {
      if (k === 'a' || k === 'b') { statusPage += 1; renderStatus(); } else closeMenu();
      return;
    }
    if (menu) {
      if (k === 'a') { menu.index = (menu.index + 1) % menu.items.length; renderMenu(); }
      if (k === 'b') pick(menu.index);
      if (k === 'c') closeMenu();
      return;
    }
    if (p?.stage === 'egg' && k === 'b' && sel < 0) return doWarm();
    if (k === 'a') { sel = (sel + 1) % SELECTABLE; renderIcons(); }
    if (k === 'b' && sel >= 0) activate(ICONS[sel]);
    if (k === 'c') { sel = -1; renderIcons(); }
  }

  function onKey(e) {
    if (!root.isConnected || document.getElementById('modal-root')?.childElementCount) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    // Tasten auf anderen Bedienelementen gehören diesen: Enter öffnet Links,
    // Pfeile scrollen, Eingabefelder bekommen Buchstaben. Knöpfe im Gerät lösen
    // Enter/Leertaste selbst aus.
    const control = e.target instanceof Element ? e.target.closest('a, button, input, textarea, select, [contenteditable]') : null;
    if (control && (!control.closest('.tama-device') || control.matches('input, textarea, select') || k === 'Enter' || k === ' ')) return;
    const down = e.type === 'keydown';
    let mapped = null;
    if (game) mapped = k === 'ArrowLeft' || k === 'a' || k === 'A' ? 'a' : k === 'ArrowRight' || k === 'c' || k === 'C' ? 'c' : k === 'Enter' || k === ' ' || k === 'b' || k === 'B' ? 'b' : k === 'Escape' ? 'quit' : null;
    else if (!down) return;
    else if (k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'ArrowDown') mapped = 'a';
    else if (k === 'ArrowLeft' || k === 'ArrowUp') mapped = 'prev';
    else if (k === 'b' || k === 'B' || k === 'Enter') mapped = 'b';
    else if (k === 'c' || k === 'C' || k === 'Escape') mapped = 'c';
    if (!mapped) return;
    e.preventDefault();
    if (mapped === 'quit') { if (down) endGame(null); return; }
    if (mapped === 'prev') {
      if (menu) { menu.index = (menu.index - 1 + menu.items.length) % menu.items.length; renderMenu(); }
      else if (statusPage === null) { sel = (sel - 1 + SELECTABLE) % SELECTABLE; renderIcons(); }
      return;
    }
    if (game && e.repeat) return;
    press(mapped, down);
  }

  /* ------------------------------ Symbole --------------------------------- */

  function renderIcons() {
    const p = pet();
    const calls = p ? E.calling(p, petNow()) : [];
    iconBtns.forEach((b, i) => {
      b.classList.toggle('is-sel', i === sel);
      if (ICONS[i] === 'attention') {
        b.classList.toggle('is-lit', calls.length > 0);
        b.title = calls.length ? calls.map((c) => t('tama.need.' + c)).join(' · ') : t('tama.act.attention');
      }
      if (ICONS[i] === 'lights') b.classList.toggle('is-lit', Boolean(p?.asleep && !p.lightsOff && !p.nap));
      if (ICONS[i] === 'medicine') b.classList.toggle('is-lit', Boolean(p?.sick));
      if (ICONS[i] === 'clean') b.classList.toggle('is-lit', Boolean(p?.poop));
      if (ICONS[i] === 'discipline') b.classList.toggle('is-lit', Boolean(p?.misbehave) && p.mode === 'classic');
    });
  }

  /* ---------------------------- Pflegeleiste ------------------------------ */

  function renderDock() {
    const p = pet();
    if (!p) { dock.replaceChildren(); return; }
    const now = petNow();
    const btn = (name, label, onclick, { disabled = false, note = '', lit = false } = {}) => el('button.tama-dock-btn' + (lit ? '.is-lit' : ''), { type: 'button', onclick, disabled: disabled ? true : null },
      svg(icon(name)), el('span', {}, el('strong', { text: label }), note ? el('small', { text: note }) : null));
    const items = [];
    if (p.stage === 'egg' && !p.end) {
      items.push(btn('egg', t('tama.act.warm'), doWarm, { note: t('tama.warm_hint') }));
    } else if (!p.end) {
      const cd = (kind) => E.cooldownLeft(p, kind, now);
      items.push(btn('cuddle', t('tama.act.cuddle'), doCuddle, { disabled: Boolean(p.cryo), note: cd('cuddle') ? t('tama.cooldown', { time: dur(cd('cuddle')) }) : '', lit: p.request?.type === 'cuddle' }));
      items.push(btn('walk', t('tama.act.walk'), doWalk, { disabled: Boolean(p.cryo), note: cd('walk') ? t('tama.cooldown', { time: dur(cd('walk')) }) : '', lit: p.request?.type === 'walk' }));
    }
    if (!p.end) items.push(btn('cryo', p.cryo ? t('tama.act.thaw') : t('tama.act.cryo'), doCryo, { lit: Boolean(p.cryo), note: p.cryo ? t('tama.frozen_since', { time: dur(now - p.cryo.at) }) : '' }));
    else items.push(btn('egg', t('tama.new_egg'), () => openNest?.(), { lit: true }));
    dock.replaceChildren(...items);
  }

  /* ------------------------------ Kacheln --------------------------------- */

  function meterRow(name, value, extra = null, kind = 'bar') {
    const v = Math.round(value);
    const tone = v <= 15 ? 'is-low' : v <= 40 ? 'is-mid' : 'is-ok';
    return el('div.tama-meter.' + tone, {},
      el('span.tama-meter-label', { text: t('tama.meter.' + name) }),
      kind === 'hearts' ? hearts(value)
        : kind === 'segs' ? el('span.tama-segs', {}, [0, 1, 2, 3].map((i) => el('span' + (i < value / 25 ? '.is-on' : ''))))
          : el('span.tama-bar', {}, el('span', { style: `width:${v}%` })),
      el('span.tama-meter-value', { text: extra ?? v + ' %' }));
  }

  function ring(pct, label, sub, cls = '') {
    const r = 42, c = 2 * Math.PI * r;
    return el('div.tama-ring' + (cls ? '.' + cls : ''), {},
      svg(h('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' },
        h('circle', { cx: 50, cy: 50, r, class: 'ring-bg' }),
        h('circle', { cx: 50, cy: 50, r, class: 'ring-fg', 'stroke-dasharray': `${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}`, transform: 'rotate(-90 50 50)' }))),
      el('span.tama-ring-copy', {}, el('strong', { text: label }), sub ? el('small', { text: sub }) : null));
  }

  function card(cls, title, iconName, ...children) {
    return el('section.tama-card.' + cls, {}, el('h3.tama-card-title', {}, svg(icon(iconName)), el('span', { text: title })), ...children);
  }

  function renderBento() {
    const p = pet();
    const sp = species();
    if (!p || !sp) { bento.replaceChildren(); return; }
    const now = petNow();
    const info = E.stageInfo(p, now);
    const cards = [];

    if (p.end) {
      cards.push(card('is-memorial', p.end.cause === 'retired' || p.end.cause === 'bred' ? t('tama.retired_title', { name: p.name }) : t('tama.gone_title', { name: p.name }), 'star',
        creatureThumb(sp, { stage: p.stage === 'egg' ? 'baby' : p.stage, variant: p.variant, colors: p.colors }, 'is-memorial-art'),
        el('p', { text: t('tama.gone_sub', { cause: t('tama.cause.' + p.end.cause), age: dur(E.ageMs(p, now)), gen: p.gen }) }),
        el('button.btn.primary.tama-cta', { type: 'button', onclick: () => openNest?.() }, svg(icon('egg')), el('span', { text: t('tama.new_egg') }))));
    }

    if (p.stage !== 'egg' && !p.end) {
      cards.push(card('is-vitals', t('tama.card.vitals'), 'status',
        meterRow('hunger', p.m.hunger, null, 'hearts'),
        meterRow('happy', p.m.happy, null, 'hearts'),
        meterRow('energy', p.m.energy),
        meterRow('health', p.m.health),
        meterRow('hygiene', E.hygiene(p)),
        meterRow('discipline', p.m.discipline, `${Math.round(p.m.discipline)} %`, 'segs'),
        el('div.tama-chips', {},
          el('span.tama-chip', { text: `${t('tama.meter.weight')} ${Math.round(p.m.weight)} · ${t('tama.weight.' + E.weightStatus(p))}` }),
          el('span.tama-chip', { text: `${t('tama.meter.age')} ${dur(E.ageMs(p, now))}` }))));
    }

    if (!p.end) {
      const stages = E.STAGES;
      const idx = stages.indexOf(p.stage);
      cards.push(card('is-growth', t('tama.card.growth'), 'leaf',
        el('div.tama-growth', {},
          ring(info.pct, t('tama.stage.' + p.stage), Math.round(info.pct) + ' %', 'is-growth-ring'),
          el('div.tama-growth-copy', {},
            p.stage === 'egg'
              ? el('p', {}, el('span', { text: t('tama.hatch_in', { time: '' }) }), el('b', { dataset: { until: String(p.hatchAt) } }))
              : info.next
                ? el('p', {}, el('span', { text: t('tama.next_stage', { stage: t('tama.stage.' + info.next) }) + ' ' }), el('b', { text: p.cryo ? '—' : t('tama.in', { time: dur(info.left) }) }))
                : el('p', { text: t('tama.final_stage') }),
            el('ol.tama-track', {}, stages.map((s, i) => el('li' + (i < idx ? '.is-done' : i === idx ? '.is-now' : ''), { title: t('tama.stage.' + s) }, el('span', { text: t('tama.stage.' + s) }))))))));
    }

    if (p.stage !== 'egg' && !p.end) {
      const every = E.REQUEST_EVERY[p.stage];
      const reqChildren = [];
      if (p.request) {
        reqChildren.push(el('div.tama-request', {},
          el('span.tama-request-art', {}, svg(p.request.type === 'meal' ? foodArt(DIET_FOOD[sp.diet] || 'meat') : p.request.type === 'snack' ? foodArt('kibble') : icon(p.request.type === 'cuddle' ? 'cuddle' : 'walk'))),
          el('span', {}, el('small', { text: t('tama.imprint_wants') }), el('strong', { text: requestText(p.request, sp) }),
            el('small', {}, el('span', { text: t('tama.imprint_expires', { time: '' }) }), el('b', { dataset: { until: String(p.request.until) } })))));
      } else if (every) {
        const next = E.nextRequestIn(p, now);
        reqChildren.push(el('div.tama-request.is-waiting', {}, el('small', { text: t('tama.imprint_next') }), el('b.tama-clock', { dataset: { clock: String(now + (next ?? 0)) } })));
      } else reqChildren.push(el('p.tama-muted', { text: t('tama.imprint_done') }));
      cards.push(card('is-imprint', t('tama.card.imprint'), 'cuddle',
        el('div.tama-growth', {}, ring(p.m.imprint, Math.round(p.m.imprint) + ' %', t('tama.card.imprint'), 'is-imprint-ring'), el('div.tama-growth-copy', {}, ...reqChildren)),
        el('p.tama-hint', { text: t('tama.imprint_hint') })));

      const fc = E.forecast(p);
      const adultish = p.stage === 'adult' || p.stage === 'elder';
      const shown = ['alpha', 'loyal', 'feral'].concat(p.variant === 'tek' ? ['tek'] : []);
      cards.push(card('is-forecast', t('tama.card.forecast'), 'star',
        el('div.tama-variants', {}, shown.map((v) => el('figure.tama-variant' + (v === fc ? '.is-on' : ''), {},
          creatureThumb(sp, { stage: 'adult', variant: v, colors: p.colors }),
          el('figcaption', { text: t('tama.variant.' + v) })))),
        el('p', {}, el('span', { text: (adultish ? t('tama.became') : t('tama.forecast')) + ': ' }), el('b', { text: t('tama.variant.' + fc) }), el('span', { text: ' – ' + t('tama.variant_desc.' + fc) })),
        el('div.tama-chips', {},
          el('span.tama-chip' + (p.cm > 2 ? '.is-warn' : ''), { text: `${t('tama.care_mistakes')}: ${p.cm}` }),
          el('span.tama-chip' + (p.dm > 1 ? '.is-warn' : ''), { text: `${t('tama.discipline_mistakes')}: ${p.dm}` })),
        el('p.tama-hint', { text: adultish ? (p.variant === 'alpha' ? t('tama.secret_hint') : t('tama.variant_desc.' + p.variant)) : t('tama.forecast_hint.' + fc) })));
    }

    const logItems = [...(p.log || [])].reverse().slice(0, 12);
    cards.push(card('is-log', t('tama.card.log'), 'info',
      logItems.length ? el('ul.tama-log', {}, logItems.map((l) => el('li', {}, el('span', { text: logText(l, sp) }), el('time', { text: timeAgo(new Date(l.t).toISOString()), datetime: new Date(l.t).toISOString() }))))
        : el('p.tama-muted', { text: t('tama.log_empty') })));

    bento.replaceChildren(...cards);
    updateClocks();
  }

  function logText(l, sp) {
    if (l.k === 'mistake') return t('tama.log.mistake', { what: t('tama.mistake.' + l.v) });
    if (l.k === 'evolve') return t('tama.log.evolve', { stage: t('tama.stage.' + l.v) });
    if (l.k === 'end') return t('tama.log.end', { cause: t('tama.cause.' + l.v) });
    if (l.k === 'request') return t('tama.log.request', { what: requestText({ type: l.v }, sp) });
    if (l.k === 'imprint') return t('tama.log.imprint', { v: l.v });
    if (l.k === 'sick' && l.v === 'tummy') return t('tama.log.sick_tummy');
    return t('tama.log.' + l.k);
  }

  function updateClocks() {
    const now = petNow();
    for (const node of root.querySelectorAll('[data-until]')) node.textContent = ' ' + dur(Number(node.dataset.until) - now);
    for (const node of root.querySelectorAll('[data-clock]')) node.textContent = clock(Number(node.dataset.clock) - now);
  }

  /* ------------------------------ Ereignisse ------------------------------ */

  function handleEvents(events = []) {
    const p = pet();
    if (!p || !events.length) return;
    const visible = document.visibilityState === 'visible';
    for (const ev of events) {
      if (ev === 'hatch') { sfx('hatch'); buzz([20, 40, 20, 40, 60]); flash(); speak(t('tama.ev.hatch', { name: p.name }), 3600); }
      if (ev === 'evolve') {
        sfx(p.stage === 'adult' ? 'evolve' : 'happy');
        flash();
        const msg = p.stage === 'adult' && p.variant
          ? t('tama.ev.adult', { name: p.name, variant: t('tama.variant.' + p.variant) })
          : t('tama.ev.evolve', { name: p.name, stage: t('tama.stage.' + p.stage) });
        speak(msg, 4000);
        toast?.(msg);
      }
      if (ev === 'secret') { sfx('secret'); flash(); toast?.(t('tama.ev.secret', { name: p.name })); }
      if (ev === 'end') { sfx('end'); speak(p.end?.cause === 'retired' ? t('tama.ev.retired', { name: p.name }) : t('tama.ev.end', { name: p.name }), 5000); }
      if (ev === 'frozen' && p.cryo?.reason === 'rescue') toast?.(t('tama.ev.frozen', { name: p.name }));
      if (ev === 'sick') { sfx('sad'); speak(t('tama.ev.sick', { name: p.name })); }
      if (ev === 'poop') sfx('poop');
      if (ev === 'call' && visible && Date.now() - lastCall > 60_000) { lastCall = Date.now(); sfx('call'); buzz([60, 80, 60]); speak(t('tama.ev.call', { name: p.name })); }
    }
  }

  function flash() {
    const f = el('div.tama-flash');
    fx.append(f);
    setTimeout(() => f.remove(), 900);
    burst('sparkle', 5);
  }

  /* ------------------------------ Lebenszyklus ---------------------------- */

  function renderAll() {
    if (destroyed) return;
    renderScreen();
    renderIcons();
    renderDock();
    renderBento();
    if (menu || statusPage !== null) renderMenu();
  }

  // Noch nicht eingehängt (erster Tick beim Aufbau) oder schon verlassen: nichts
  // zeichnen. Aufgeräumt wird über den Sekundentakt bzw. destroy() der Seite.
  const off = onPetChange((state, ev) => {
    if (destroyed || !root.isConnected) return;
    if (ev?.type === 'conflict') toast?.(t('tama.ev.conflict'));
    if (ev?.type === 'save-error') toast?.(t('tama.ev.save_error'), 'err');
    // Speichern ändert nichts Sichtbares – nicht neu zeichnen (Fokus und Hover bleiben)
    if (['reset', 'saved', 'save-error'].includes(ev?.type)) return;
    handleEvents(ev?.events);
    renderAll();
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    off();
    game?.destroy();
    clearInterval(wanderTimer);
    clearInterval(secondTimer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKey);
  }

  screen.addEventListener('click', (e) => {
    const p = pet();
    if (!p || game || menu || statusPage !== null) return;
    if (p.stage === 'egg' && e.target.closest('.tama-pet')) doWarm();
    else if (!p.end && !p.cryo && !p.asleep && e.target.closest('.tama-pet')) { sfx('cuddle'); burst('heart', 1); withExpr('poke', 500, 'happy'); }
  });

  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);
  wanderTimer = setInterval(wander, 3400);
  secondTimer = setInterval(() => {
    if (!root.isConnected) { destroy(); return; }
    updateClocks();
    const p = pet();
    if (p?.stage === 'egg' && petNow() >= p.hatchAt) tickPet();
  }, 1000);
  tickPet();
  renderAll();

  return { root, destroy, device };
}
