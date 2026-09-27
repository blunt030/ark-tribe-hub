/**
 * Das Gerät: Ei-förmiges Tek-Gehäuse mit Bildschirm, acht Stationen rund um das
 * Display und drei Softkeys. Deren Beschriftung richtet sich nach der Lage:
 * links „Scan“, in der Mitte die gerade sinnvollste Aktion, rechts „Menü“. In
 * Menüs werden sie zu Zurück · OK · Weiter, in Spielen zu Links · Aktion · Rechts.
 * Steuert Animationen und leitet Aktionen über progress.js an die Engine weiter.
 */
import { el } from '../ui.js';
import { t } from '../i18n.js';
import * as E from './engine.js';
import * as P from './progress.js';
import { ITEMS, KIBBLE, TRICKS, TRICK_SESSIONS, ZONES, DECOR, SLOTS } from './catalog.js';
import { creatureArt, FORMS } from './art.js';
import { sceneArt, dayPhase, poopArt, foodArt, cryoArt, graveArt, icon, DIET_FOOD } from './scene.js';
import { eggArt, itemArt, decorArt, eventArt } from './props.js';
import { h } from './vdom.js';
import { petState, petNow, onPetChange, petAct, tickPet } from './store.js';
import { sfx, buzz } from './sound.js';
import { GAMES, whistleGame } from './games.js';
import { BY_KEY, svg, dur, hhmm, requestText, itemImg, rewardChips, noteText, decorEffects, faceFor } from './common.js';
import { createHub } from './hub.js';
import { openDropSheet, openLootSheet } from './daily.js';

export { BY_KEY, svg, dur, clock, faceFor, requestText, creatureThumb } from './common.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clampPct = (v, lo = 2, hi = 88) => Math.min(hi, Math.max(lo, v));

/** Die acht Stationen rund um den Bildschirm (oben vier, unten vier). */
export const STATIONS = [
  { key: 'feed', icon: 'feed' },
  { key: 'sleep', icon: 'moon' },
  { key: 'play', icon: 'play' },
  { key: 'vet', icon: 'medicine' },
  { key: 'care', icon: 'bath' },
  { key: 'train', icon: 'whistle' },
  { key: 'trip', icon: 'compass' },
  { key: 'home', icon: 'home' },
];

/** Wo die Einrichtung im Gehege steht (Prozent des Bildschirms, am Boden verankert). */
const DECOR_POS = {
  light: 'left:1%;bottom:9%;width:11%',
  bed: 'left:9%;bottom:4%;width:24%',
  trophy: 'right:16%;bottom:9%;width:9%',
  toy: 'left:61%;bottom:4%;width:10%',
  plant: 'right:1%;bottom:6%;width:15%',
};
const SLOT_ICON = { bed: 'bed', toy: 'play', plant: 'leaf', light: 'lights', trophy: 'trophy' };
const WARM_LAMPS = ['light_torch', 'ev_pumpkin'];

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

/* -------------------------------------------------------------------------- */
/* Pflege-Ansicht                                                               */
/* -------------------------------------------------------------------------- */

export function createCare({ openNest, toast, go }) {
  const scene = el('div.tama-scene');
  const events = el('div.tama-events');
  const decor = el('div.tama-decor');
  const props = el('div.tama-props');
  const away = el('div.tama-away');
  const flip = el('div.tama-pet-flip');
  const marks = el('div.tama-marks');
  const petBox = el('div.tama-pet.pet-live', { style: 'left:26%' }, flip, marks);
  const fx = el('div.tama-fx');
  const darkness = el('div.tama-dark', {}, el('span.tama-moon'));
  const hud = el('div.tama-hud', { 'aria-hidden': 'true' });
  const lcd = el('div.tama-lcd', {}, scene, events, decor, props, away, petBox, fx, darkness, hud);
  const overlay = el('div.tama-overlay');
  const say = el('div.tama-say', { role: 'status', 'aria-live': 'polite' });
  const screen = el('div.tama-screen', { role: 'group', 'aria-label': t('tama.screen_label') }, lcd, overlay, say);

  const stationBtns = STATIONS.map((st) => el('button.tama-ico', {
    type: 'button', dataset: { act: st.key }, title: t('tama.st.' + st.key), 'aria-label': t('tama.st.' + st.key),
    onclick: () => openStation(st.key),
  }, svg(icon(st.icon)), el('span.tama-ico-label', { text: t('tama.st.' + st.key) })));

  const keyEls = {};
  const keys = ['l', 'm', 'r'].map((k) => {
    const cap = el('span.tama-key-cap');
    const label = el('span.tama-key-label');
    const b = el('button.tama-key.is-' + k, { type: 'button', dataset: { key: k } }, cap, label);
    // Zeiger: gedrückt halten zählt (Minispiele). Klicks ohne Zeiger – Screenreader,
    // Sprachsteuerung – lösen einmal Drücken und Loslassen aus.
    let pointerAt = 0;
    b.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); pointerAt = Date.now(); b.classList.add('is-down'); press(k, true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (b.classList.contains('is-down')) { b.classList.remove('is-down'); press(k, false); } });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(k, true); press(k, false); } });
    b.addEventListener('click', () => { if (Date.now() - pointerAt < 3000) { pointerAt = 0; return; } press(k, true); press(k, false); });
    keyEls[k] = { b, cap, label, sig: '' };
    return b;
  });

  const led = el('span.tama-led');
  const shell = el('div.tama-shell', {},
    el('div.tama-shell-gloss', { 'aria-hidden': 'true' }),
    el('div.tama-brand', {}, el('b', { text: 'TEK', 'aria-hidden': 'true' }), el('span', { text: 'GOTCHI', 'aria-hidden': 'true' }), led),
    el('div.tama-bezel', {},
      el('div.tama-icons.is-top', {}, stationBtns.slice(0, 4)),
      screen,
      el('div.tama-icons.is-bottom', {}, stationBtns.slice(4))),
    el('div.tama-keys', {}, keys));
  const device = el('div.tama-device', {}, lcdFilter(), el('div.tama-keyring', { 'aria-hidden': 'true' }), shell);
  // Glanzlicht und eine leichte Neigung folgen dem Zeiger wie bei einem echten Gerät in der Hand
  const tilt = globalThis.matchMedia?.('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  shell.addEventListener('pointermove', (e) => {
    const r = shell.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    shell.style.setProperty('--gx', `${Math.round(x * 100)}%`);
    shell.style.setProperty('--gy', `${Math.round(y * 100)}%`);
    if (tilt?.matches) {
      shell.style.setProperty('--ry', `${((x - 0.5) * 6).toFixed(2)}deg`);
      shell.style.setProperty('--rx', `${((0.5 - y) * 5).toFixed(2)}deg`);
    }
  });
  shell.addEventListener('pointerleave', () => { for (const v of ['--gx', '--gy', '--rx', '--ry']) shell.style.removeProperty(v); });

  const dock = el('div.tama-dock');
  const hub = createHub({ openDrop: () => openDrop(), go, toast });
  const root = el('div.tama-care', {}, el('div.tama-device-col', {}, device, dock), hub.root);

  let stack = [], mode = null, stationSel = 0, game = null, busy = false;
  let artKey = '', sceneKey = '', decoKey = '', eventKey = '', poopCount = -1, hudSig = '';
  let anchors = { head: [120, 60], mouth: [150, 90], floating: false };
  let facing = 1, walkEnd = 0, wanderTimer = 0, secondTimer = 0, lastCall = 0, destroyed = false;

  const pet = () => petState.doc?.pet || null;
  const species = () => BY_KEY.get(pet()?.species);
  const player = () => petState.doc?.player;

  function speak(text, ms = 2800) {
    if (!text) return;
    say.textContent = text;
    say.classList.add('is-on');
    clearTimeout(speak.timer);
    speak.timer = setTimeout(() => say.classList.remove('is-on'), ms);
  }

  function resText(res) {
    const p = pet();
    const extra = res.trick ? { trick: t('tama.trick.' + res.trick) } : res.zone ? { zone: t('tama.zone.' + res.zone) } : {};
    return t('tama.res.' + res.code, { name: p?.name || '', gen: p?.gen || 1, n: Math.round(res.imprint || 0), ...extra });
  }

  /* ------------------------------ Bildschirm ------------------------------ */

  function toPct([x, y]) { return [((x + 8) / 216) * 100, ((y + 8) / 216) * 100]; }

  function renderDecor() {
    const deco = player()?.deco || {};
    const key = JSON.stringify(deco);
    if (key === decoKey) return;
    decoKey = key;
    decor.replaceChildren(...SLOTS.filter((s) => DECOR[deco[s]]).map((s) => el('div.tama-deco.slot-' + s, { style: DECOR_POS[s], dataset: { id: deco[s] } }, svg(decorArt(deco[s])))));
  }

  function renderEvents(now) {
    const ids = P.eventsAt(now).map((e) => e.id);
    const key = ids.join(',');
    if (key === eventKey) return;
    eventKey = key;
    const art = eventArt(ids);
    events.replaceChildren(...(art ? [svg(art)] : []));
  }

  function renderHud(now) {
    const d = new Date(now);
    const minute = d.getHours() * 60 + d.getMinutes();
    const doc = petState.doc;
    const drop = P.dropReady(doc, now);
    const evs = P.eventsAt(now);
    const sig = [minute, drop, evs.map((e) => e.id)].join('|');
    if (sig === hudSig) return;
    hudSig = sig;
    const night = dayPhase(now) === 'night';
    hud.replaceChildren(
      el('span.tama-hud-time', {}, svg(icon(night ? 'moon' : 'sun')), el('b', { text: hhmm(minute) })),
      el('span.tama-hud-right', {},
        ...evs.map((e) => el('span.tama-hud-chip.ev-' + e.id, { text: t('tama.event.' + e.id + '_short') })),
        drop ? el('span.tama-hud-drop', {}, svg(icon('crate'))) : null));
  }

  function renderScreen() {
    const p = pet();
    const sp = species();
    if (!p || !sp) return;
    const now = petNow();
    const phase = dayPhase(now);
    const sk = sp.biome + phase;
    if (sk !== sceneKey) { scene.replaceChildren(svg(sceneArt(sp.biome, phase))); sceneKey = sk; }
    screen.classList.toggle('is-retro', Boolean(petState.doc.settings.retro));
    renderDecor();
    renderEvents(now);
    renderHud(now);

    const stage = p.stage;
    const cracks = stage === 'egg' ? Math.min(3, Math.floor(E.stageInfo(p, now).pct / 34)) : '';
    const key = [p.id, stage, p.variant, p.teen, JSON.stringify(p.colors), p.end ? 'end' : '', cracks].join('|');
    if (key !== artKey) {
      artKey = key;
      petBox.classList.remove('is-egg', 'is-grave', 'is-floating');
      // Ei und Grabstein nie gespiegelt zeigen (sonst stünde der Name verkehrt herum)
      if (stage === 'egg' || p.end) setFacing(1);
      if (stage === 'egg') {
        flip.replaceChildren(svg(eggArt(sp, { cracks })));
        petBox.classList.add('is-egg');
        petBox.style.width = '34%';
        petBox.style.left = '33%';
        petBox.style.bottom = '5%';
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
    const gone = E.isAway(p);
    petBox.classList.toggle('is-away', gone);
    petBox.classList.toggle('is-frozen', Boolean(p.cryo));
    petBox.classList.toggle('is-sick', Boolean(p.sick) && !p.end);
    const buffs = E.activeBuffs(p, now).map((b) => b.kind);
    petBox.classList.toggle('is-shiny', buffs.includes('shiny') && !p.end);
    petBox.classList.toggle('is-dirty', !p.end && stage !== 'egg' && !p.cryo && E.hygiene(p, now) < 30);

    // Licht aus: dunkel – ein Nachtlicht in der Einrichtung wirft warmen oder kühlen Schein
    const lamp = player()?.deco?.light;
    darkness.classList.toggle('is-on', Boolean(p.lightsOff) && !p.end && !p.cryo && !gone);
    darkness.classList.toggle('is-lamp', Boolean(DECOR[lamp]));
    darkness.classList.toggle('is-warm', WARM_LAMPS.includes(lamp));

    if (p.poop !== poopCount) {
      poopCount = p.poop;
      props.replaceChildren(...Array.from({ length: p.poop }, (_, i) => el('div.tama-poop', { style: `right:${4 + i * 11}%;bottom:${5 + (i % 2) * 4}%` }, svg(poopArt()))));
    }

    // Unterwegs: Wegweiser mit Ziel und Rückkehrzeit statt des Tiers
    if (gone) {
      away.replaceChildren(el('div.tama-away-card', {},
        svg(icon('compass')),
        el('strong', { text: t('tama.trip.away', { zone: t('tama.zone.' + p.exp.zone) }) }),
        el('small', {}, el('span', { text: t('tama.trip.back_in') + ' ' }), el('b', { dataset: { until: String(p.exp.until) } }))),
      el('div.tama-away-trail', {}, [0, 1, 2, 3].map((i) => el('span', { style: `animation-delay:${i * 0.35}s` }, svg(icon('walk'))))));
      away.hidden = false;
    } else if (!away.hidden) { away.hidden = true; away.replaceChildren(); }

    // Markierungen über dem Kopf (bewegen sich mit dem Tier)
    const [hx, hy] = toPct(anchors.head);
    const left = facing < 0 ? 100 - hx : hx;
    const list = [];
    // Abstände in cqw (Bildschirmbreite), damit Markierungen auch bei kleinen Babys nicht übereinanderliegen
    const at = (dx, dy) => `left:calc(${left.toFixed(1)}% + ${facing < 0 ? -dx : dx}cqw);top:calc(${hy.toFixed(1)}% + ${dy}cqw)`;
    if (p.cryo) list.push(el('div.tama-cryo', {}, svg(cryoArt())));
    if (!p.end && !p.cryo && stage !== 'egg' && !gone) {
      if (p.asleep) list.push(el('div.tama-mark.is-zzz', { style: at(4, -13) }, el('b', { text: 'z' }), el('b', { text: 'z' }), el('b', { text: 'Z' })));
      if (p.sick) list.push(el('div.tama-mark.is-sick', { style: at(-11, -12), title: t('tama.need.sick') }, svg(icon('skull'))));
      const calls = E.calling(p, now).filter((c) => c !== 'sick' && c !== 'imprint');
      if (calls.length && !p.asleep) list.push(el('div.tama-mark.is-call', { style: at(10, -11) }, el('b', { text: '!' })));
      if (p.request && !p.asleep) list.push(el('div.tama-mark.is-request', { style: at(-1, -19), title: requestText(p.request, sp) }, svg(requestArt(p.request, sp))));
      // Beutel auf der Seite, auf der im Bild noch Platz ist
      const nearRight = (parseFloat(petBox.style.left) || 26) + (parseFloat(petBox.style.width) || 50) > 80;
      if (p.exp?.done) list.push(el('button.tama-loot' + (nearRight ? '.is-left' : ''), { type: 'button', title: t('tama.act.loot'), 'aria-label': t('tama.act.loot'), onclick: (e) => { e.stopPropagation(); doLoot(); } }, svg(itemArt('shard')), svg(icon('gift'))));
    }
    marks.replaceChildren(...list);
  }

  function requestArt(req, sp) {
    if (req.type === 'meal') return foodArt(DIET_FOOD[sp.diet] || 'meat');
    if (req.type === 'kibble' || req.type === 'snack') return itemArt('kibble_regular');
    return icon(req.type === 'cuddle' ? 'cuddle' : 'walk');
  }

  function setFacing(dir) {
    facing = dir;
    flip.classList.toggle('is-left', dir < 0);
  }

  const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

  function wander() {
    const p = pet();
    if (!p || destroyed || busy || game || mode || p.stage === 'egg' || p.end || p.cryo || p.asleep || E.isAway(p)) return;
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

  function headPos() {
    const [hx, hy] = toPct(anchors.head);
    const width = parseFloat(petBox.style.width) || 50;
    const left = parseFloat(petBox.style.left) || 26;
    const x = left + (facing < 0 ? 100 - hx : hx) * width / 100;
    const bottomPct = parseFloat(petBox.style.bottom) || 4;
    const y = 100 - bottomPct - (100 - hy) * width / 100 * (4 / 3) * 0.75;
    return [x, Math.max(2, y)];
  }

  function burst(kind, count = 3) {
    const [x, y] = headPos();
    for (let i = 0; i < count; i++) {
      const node = el('div.tama-burst.is-' + kind, { style: `left:${(x + (i - (count - 1) / 2) * 7).toFixed(1)}%;top:${y.toFixed(1)}%;animation-delay:${i * 120}ms` }, kind === 'heart' ? svg(icon('heart')) : kind === 'star' ? svg(icon('star')) : el('b', { text: kind === 'note' ? '♪' : '✦' }));
      fx.append(node);
      setTimeout(() => node.remove(), 1600 + i * 120);
    }
  }

  /** Belohnungen steigen als Chips über dem Tier auf (+XP, +Bindung, +Splitter). */
  function floatGain(given) {
    const chips = rewardChips(given);
    if (!chips.length) return;
    const [x, y] = headPos();
    const node = el('div.tama-float', { style: `left:${clampPct(x, 14, 86).toFixed(1)}%;top:${clampPct(y + 6, 6, 70).toFixed(1)}%` }, chips);
    fx.append(node);
    setTimeout(() => node.remove(), 2400);
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
    if (['full', 'healthy', 'not_tired', 'cooldown', 'tired', 'sick', 'dazed', 'too_young', 'hungry', 'attention'].includes(res.code)) withExpr('refuse', 700);
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

  function flash() {
    const f = el('div.tama-flash');
    fx.append(f);
    setTimeout(() => f.remove(), 900);
    burst('sparkle', 5);
  }

  /* ------------------------------- Aktionen ------------------------------- */

  function imprintNote(res) {
    if (res.imprint > 0) setTimeout(() => { speak(t('tama.res.imprint', { n: Math.round(res.imprint) })); sfx('happy'); burst('star', 3); }, 900);
  }

  /** Führt eine Aktion aus; bei Erfolg schließt sich das Menü und die Belohnung steigt auf. */
  function run(fn) {
    const res = petAct(fn);
    if (!res.ok) { refuse(res); return null; }
    closeAll();
    return res;
  }

  async function doFeed(id) {
    const res = run((d, now) => P.feedItem(d, id, now));
    if (!res) return;
    busy = true;
    const art = id === 'meal' ? foodArt(DIET_FOOD[species().diet] || 'meat') : itemArt(id);
    const [x, y] = mouthPos();
    const item = propAt(art, 'is-food', clampPct(x + (facing < 0 ? -12 : 2), 4, 86), Math.max(4, y - 6));
    sfx(ITEMS[id]?.kind === 'boost' ? 'cure' : 'eat');
    await withExpr('eat', 1250, 'happy');
    item.remove();
    burst(ITEMS[id]?.kind === 'boost' ? 'sparkle' : 'heart', 3);
    floatGain(res.given);
    speak(res.tummy ? t('tama.res.tummy') : resText(res));
    imprintNote(res);
    busy = false;
  }

  async function doClean() {
    const res = run((d, now) => P.clean(d, now));
    if (!res) return;
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
    floatGain(res.given);
    speak(resText(res));
    busy = false;
  }

  async function doGroom() {
    const res = run((d, now) => P.groom(d, now));
    if (!res) return;
    busy = true;
    sfx('groom');
    const [x, y] = headPos();
    const foam = el('div.tama-foam', { style: `left:${clampPct(x - 10, 2, 80).toFixed(1)}%;top:${clampPct(y, 4, 70).toFixed(1)}%` }, [0, 1, 2, 3, 4, 5].map((i) => el('span', { style: `animation-delay:${i * 90}ms` })));
    fx.append(foam);
    await withExpr('cuddle', 1300, 'happy');
    foam.remove();
    burst('sparkle', 5);
    floatGain(res.given);
    speak(resText(res));
    busy = false;
  }

  async function doCure(strong) {
    const res = run((d, now) => P.cure(d, strong, now));
    if (!res) return;
    busy = true;
    const [x, y] = mouthPos();
    const flask = propAt(strong ? itemArt('brew') : foodArt('medicine'), 'is-flask', clampPct(x - 4, 4, 84), Math.max(2, y - 26));
    await withExpr('flinch', 900, 'sick');
    flask.remove();
    if (res.code === 'cured') { sfx('cure'); burst('sparkle', 5); } else sfx('select');
    floatGain(res.given);
    speak(resText(res));
    busy = false;
  }

  function doLights() {
    const res = run((d, now) => P.lights(d, now));
    if (!res) return;
    sfx(res.code === 'lights_on' ? 'select' : 'back');
    speak(resText(res));
  }

  async function doTuck() {
    const res = run((d, now) => P.tuck(d, now));
    if (!res) return;
    sfx('cuddle');
    const blanket = el('div.tama-blanket', { style: `left:${(parseFloat(petBox.style.left) || 26) + 4}%;width:${(parseFloat(petBox.style.width) || 50) * 0.8}%` });
    fx.append(blanket);
    setTimeout(() => blanket.remove(), 2200);
    burst('star', 2);
    floatGain(res.given);
    speak(resText(res));
  }

  async function doScold() {
    const res = run((d, now) => P.scold(d, now));
    if (!res) return;
    busy = true;
    sfx('scold');
    buzz([30, 40, 30]);
    await withExpr('scolded', 900, res.code === 'unfair' ? 'sad' : 'cheeky');
    if (res.code === 'unfair') await withExpr('sad', 1200, 'sad');
    else burst('sparkle', 2);
    floatGain(res.given);
    speak(resText(res));
    busy = false;
  }

  async function doCuddle() {
    const res = run((d, now) => P.cuddle(d, now));
    if (!res) return;
    busy = true;
    sfx('cuddle');
    const [x, y] = mouthPos();
    const hand = propAt(icon('cuddle', 'is-hand'), 'is-hand', clampPct(x - 10, 2, 84), Math.max(0, y - 30));
    await withExpr('cuddle', 1300, 'happy');
    hand.remove();
    burst('heart', 4);
    floatGain(res.given);
    speak(resText(res));
    imprintNote(res);
    busy = false;
  }

  /** Streicheln: kleine Geste ohne Werte – das Tier freut sich trotzdem. */
  function doPet() {
    const p = pet();
    if (!p || p.asleep || p.end || p.cryo || p.stage === 'egg' || E.isAway(p)) return;
    sfx('cuddle');
    burst('heart', 2);
    withExpr('poke', 600, 'happy');
    speak(t('tama.res.petted', { name: p.name }), 1600);
  }

  async function walkAcross(ms = 1600) {
    const start = parseFloat(petBox.style.left) || 26;
    const width = parseFloat(petBox.style.width) || 50;
    const far = start > 30 ? 0 : 96 - width;
    setFacing(far < start ? -1 : 1);
    petBox.style.transitionDuration = `${ms / 1000}s`;
    petBox.classList.add('is-walking', 'is-trot');
    petBox.style.left = far + '%';
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const paw = el('div.tama-paw', { style: `left:${(start + (far - start) * (i + 0.5) / 5 + width * 0.35).toFixed(1)}%;bottom:${3 + (i % 2) * 3}%` }, svg(icon('walk')));
        fx.append(paw);
        setTimeout(() => paw.remove(), 2400);
      }, i * (ms / 5));
    }
    await wait(ms + 100);
    return start;
  }

  async function doWalk() {
    const res = run((d, now) => P.walk(d, now));
    if (!res) return;
    busy = true;
    sfx('happy');
    const start = await walkAcross();
    setFacing(-facing);
    petBox.style.left = start + '%';
    await wait(1700);
    petBox.classList.remove('is-walking', 'is-trot');
    burst('heart', 3);
    floatGain(res.given);
    speak(resText(res));
    imprintNote(res);
    busy = false;
  }

  async function doToy() {
    const res = run((d, now) => P.toy(d, now));
    if (!res) return;
    busy = true;
    sfx('happy');
    const toy = decor.querySelector('.slot-toy');
    toy?.classList.add('is-played');
    await withExpr('cheer', 1200, 'happy');
    toy?.classList.remove('is-played');
    burst('note', 3);
    floatGain(res.given);
    speak(resText(res));
    busy = false;
  }

  function doTrain(trick) {
    const p = pet();
    const block = E.canPlay(p, petNow(), 8) || (p.stage === 'baby' ? 'too_young' : null) || (E.cooldownLeft(p, 'train', petNow()) > 0 ? 'cooldown' : null);
    if (block) return refuse({ ok: false, code: block });
    openGame((host, ctx) => whistleGame(host, { ...ctx, steps: TRICKS[trick].steps }), (result) => {
      const res = petAct((d, now) => P.train(d, trick, Boolean(result.won), now));
      if (!res.ok) return refuse(res);
      floatGain(res.given);
      speak(resText(res), 3200);
      if (res.code === 'trick_learned') { sfx('levelup'); flash(); withExpr('trick-' + trick, 1600, 'happy'); }
      else if (res.code === 'trained') { burst('star', 3); withExpr('cheer', 900, 'happy'); }
      else withExpr('sad', 900, 'sad');
    });
  }

  async function doPerform(trick) {
    const res = run((d, now) => P.perform(d, trick, now));
    if (!res) return;
    busy = true;
    sfx('trick');
    await withExpr('trick-' + trick, 1600, trick === 'roar' || trick === 'attack' ? 'cheeky' : 'happy');
    burst('star', 3);
    floatGain(res.given);
    speak(resText(res));
    busy = false;
  }

  async function doExplore(zone) {
    const res = run((d, now) => P.explore(d, zone, now));
    if (!res) return;
    busy = true;
    sfx('happy');
    await walkAcross(1400);
    petBox.classList.remove('is-walking', 'is-trot');
    busy = false;
    speak(resText(res), 3200);
    renderAll();
  }

  function doRecall() {
    const res = run((d, now) => P.recall(d, now));
    if (!res) return;
    sfx('back');
    speak(resText(res));
    renderAll();
  }

  function doLoot() {
    const res = run((d, now) => P.claimLoot(d, now));
    if (!res) return;
    sfx('open');
    flash();
    openLootSheet(res, pet());
  }

  function doCryo() {
    const p = pet();
    const res = run((d, now) => (p.cryo ? E.thaw(d.pet, now) : E.freeze(d.pet, now)));
    if (!res) return;
    sfx(res.code === 'thaw' ? 'thaw' : 'cryo');
    speak(resText(res));
    artKey = '';
    renderAll();
  }

  function doWarm() {
    const res = petAct((d, now) => P.warm(d, now));
    if (!res.ok) { if (res.code === 'warm_max') speak(resText(res)); return; }
    sfx('tick');
    buzz(10);
    petBox.classList.remove('is-warming');
    void petBox.offsetWidth;
    petBox.classList.add('is-warming');
    speak(resText(res), 1400);
  }

  function openDrop() {
    closeAll();
    openDropSheet({ onDone: () => renderAll() });
  }

  /* ------------------------------- Spiele --------------------------------- */

  function openGame(start, onResult) {
    closeAll();
    const p = pet();
    overlay.classList.add('is-open', 'is-game');
    const host = el('div.tama-game');
    const quit = el('button.tama-menu-close', { type: 'button', 'aria-label': t('tama.game.quit'), onclick: () => endGame(null) }, '×');
    overlay.replaceChildren(host, quit);
    mode = 'game';
    game = start(host, { pet: p, sp: species(), food: DIET_FOOD[species().diet] || 'meat', onEnd: (result) => endGame(result) });
    game.onResult = onResult;
    renderKeys();
  }

  function startGame(def) {
    const block = E.canPlay(pet(), petNow());
    if (block) return refuse({ ok: false, code: block });
    openGame(def.start, (result) => {
      const res = petAct((d, now) => P.play(d, result, now));
      if (!res.ok) return refuse(res);
      speak(resText(res));
      floatGain(res.given);
      if (result.won) { burst('star', 4); withExpr('cheer', 1200, 'happy'); } else withExpr('sad', 1000, 'sad');
    });
  }

  function endGame(result) {
    const done = game;
    game?.destroy();
    game = null;
    mode = null;
    overlay.classList.remove('is-open', 'is-game');
    overlay.replaceChildren();
    renderKeys();
    if (result && done?.onResult) done.onResult(result);
  }

  /* ------------------------------- Menüs ---------------------------------- */

  const infoMeter = (label, value) => {
    const v = Math.round(value);
    return el('div.tama-mi' + (v <= 15 ? '.is-low' : v <= 40 ? '.is-mid' : ''), {}, el('span', { text: label }), el('span.tama-bar', {}, el('span', { style: `width:${v}%` })), el('b', { text: v + ' %' }));
  };
  const textRow = (text, cls = '') => el('p.tama-mi-text' + (cls ? '.' + cls : ''), { text });
  const untilRow = (label, until) => el('p.tama-mi-text', {}, el('span', { text: label + ' ' }), el('b', { dataset: { until: String(until) } }));
  const cooldownHint = (ms, fallback) => (ms > 0 ? t('tama.cooldown', { time: dur(ms) }) : fallback);

  const STATION = {
    feed() {
      const p = pet(), inv = player().inv, sp = species();
      const food = DIET_FOOD[sp.diet] || 'meat';
      const wants = p.request?.type;
      const items = [{ label: t('tama.act.meal'), hint: t('tama.meal_hint', { food: t('tama.food.' + food) }), art: foodArt(food), count: '∞', lit: wants === 'meal', run: () => doFeed('meal') }];
      const kibble = KIBBLE.filter((id) => inv[id] > 0);
      for (const id of kibble) items.push({ label: t('tama.item.' + id), hint: t('tama.hint.kibble', { hunger: ITEMS[id].hunger, happy: ITEMS[id].happy }), art: itemImg(id), count: '×' + inv[id], lit: wants === 'kibble', run: () => doFeed(id) });
      for (const id of ['treat', 'honey', 'stimberry']) if (inv[id] > 0) items.push({ label: t('tama.item.' + id), hint: t('tama.hint.' + id), art: itemImg(id), count: '×' + inv[id], run: () => doFeed(id) });
      if (!kibble.length) items.push({ label: t('tama.st.no_kibble'), hint: t('tama.st.no_kibble_hint'), art: itemImg('kibble_basic'), disabled: true });
      return { title: t('tama.st.feed'), icon: 'feed', info: [infoMeter(t('tama.meter.hunger'), p.m.hunger), textRow(`${t('tama.meter.weight')}: ${Math.round(p.m.weight)} · ${t('tama.weight.' + E.weightStatus(p))}`)], items };
    },
    sleep() {
      const p = pet(), now = petNow();
      const w = E.sleepWindow(p);
      const info = [infoMeter(t('tama.meter.energy'), p.m.energy), textRow(w ? t('tama.sleep.window', { from: hhmm(w[0]), to: hhmm(w[1]) }) : t('tama.sleep.baby'))];
      if (p.night?.total) info.push(textRow(t('tama.sleep.tonight', { pct: Math.round(p.night.dark / p.night.total * 100) }) + (p.night.tucked ? ' · ' + t('tama.sleep.tucked') : '')));
      const buff = E.activeBuffs(p, now).find((b) => ['dreamy', 'rested', 'restless'].includes(b.kind));
      if (buff) info.push(textRow(`${t('tama.buff.' + buff.kind)} · ${t('tama.buff_left', { time: dur(buff.left) })}`, buff.kind === 'restless' ? 'is-warn' : 'is-ok'));
      if (DECOR[player().deco.light]?.night) info.push(textRow(t('tama.sleep.nightlight')));
      const items = [];
      if (p.asleep) {
        items.push({ label: p.lightsOff ? t('tama.act.lights_on') : t('tama.act.lights_off'), hint: p.lightsOff ? t('tama.hint.lights_on') : t('tama.hint.lights_off'), icon: 'lights', lit: !p.lightsOff && !p.nap, run: doLights });
        if (!p.nap) items.push({ label: t('tama.act.tuck'), hint: p.night?.tucked ? t('tama.hint.tucked') : t('tama.hint.tuck'), icon: 'moon', disabled: Boolean(p.night?.tucked), lit: !p.night?.tucked, run: doTuck });
      } else {
        items.push({ label: t('tama.act.nap'), hint: p.m.energy < 60 ? t('tama.hint.nap') : t('tama.res.not_tired', { name: p.name }), icon: 'moon', disabled: p.m.energy >= 60, run: doLights });
      }
      return { title: t('tama.st.sleep'), icon: 'moon', info, items };
    },
    play() {
      const p = pet(), now = petNow();
      const toy = player().deco.toy;
      const items = GAMES.map((g) => ({ label: t(g.title), hint: t(g.desc), icon: 'play', run: () => startGame(g) }));
      if (toy) {
        const cd = E.cooldownLeft(p, 'toy', now);
        items.push({ label: t('tama.act.toy', { toy: t('tama.decor.' + toy) }), hint: cooldownHint(cd, t('tama.hint.toy')), art: decorArt(toy), disabled: cd > 0, run: doToy });
      } else items.push({ label: t('tama.act.no_toy'), hint: t('tama.hint.no_toy'), icon: 'home', run: () => openStation('home', true) });
      return { title: t('tama.st.play'), icon: 'play', info: [infoMeter(t('tama.meter.happy'), p.m.happy), infoMeter(t('tama.meter.energy'), p.m.energy)], items };
    },
    vet() {
      const p = pet(), now = petNow();
      const brew = player().inv.brew || 0;
      const buffs = E.activeBuffs(p, now);
      return {
        title: t('tama.st.vet'), icon: 'medicine',
        info: [textRow(p.sick ? t('tama.vet.sick', { n: p.sick }) : t('tama.vet.healthy'), p.sick ? 'is-warn' : 'is-ok'), infoMeter(t('tama.meter.health'), p.m.health),
          buffs.length ? textRow(buffs.map((b) => t('tama.buff.' + b.kind)).join(' · ')) : null],
        items: [
          { label: t('tama.act.medicine'), hint: t('tama.hint.medicine'), art: foodArt('medicine'), count: '∞', lit: Boolean(p.sick), run: () => doCure(false) },
          { label: t('tama.item.brew'), hint: t('tama.hint.brew'), art: itemImg('brew'), count: '×' + brew, disabled: brew <= 0, run: () => doCure(true) },
        ],
      };
    },
    care() {
      const p = pet(), now = petNow();
      const hyg = E.hygiene(p, now);
      const cd = E.cooldownLeft(p, 'groom', now);
      return {
        title: t('tama.st.care'), icon: 'bath',
        info: [infoMeter(t('tama.meter.hygiene'), hyg), textRow(p.poop ? t('tama.care.poop', { n: p.poop }) : t('tama.care.clean'))],
        items: [
          { label: t('tama.act.clean'), hint: p.poop ? t('tama.hint.clean') : t('tama.res.spotless'), art: poopArt(), lit: p.poop > 0, disabled: !p.poop, run: doClean },
          { label: t('tama.act.groom'), hint: cooldownHint(cd, t('tama.hint.groom')), icon: 'bath', lit: hyg < 60 && !cd, disabled: cd > 0, run: doGroom },
        ],
      };
    },
    train() {
      const p = pet(), now = petNow();
      const bp = E.bondProgress(p);
      const cd = E.cooldownLeft(p, 'train', now);
      const items = [{ label: t('tama.act.discipline'), hint: p.misbehave ? t('tama.hint.scold_now') : t('tama.hint.scold'), icon: 'discipline', lit: Boolean(p.misbehave), run: doScold }];
      for (const [id, def] of Object.entries(TRICKS)) {
        const state = E.trickState(p, id);
        if (state === 'learned') items.push({ label: t('tama.trick.' + id), hint: t('tama.hint.perform'), icon: 'star', note: t('tama.trick_learned'), run: () => doPerform(id) });
        else if (state === 'training') items.push({ label: t('tama.trick.' + id), hint: p.stage === 'baby' ? t('tama.res.too_young', { name: p.name }) : cooldownHint(cd, t('tama.hint.train', { n: p.tricks[id] || 0, total: TRICK_SESSIONS })), icon: 'whistle', progress: (p.tricks[id] || 0) / TRICK_SESSIONS, disabled: cd > 0 || p.stage === 'baby', run: () => doTrain(id) });
        else items.push({ label: t('tama.trick.' + id), hint: t('tama.hint.trick_locked', { n: def.bond }), icon: 'lock', disabled: true });
      }
      return { title: t('tama.st.train'), icon: 'whistle', info: [infoMeter(t('tama.meter.discipline'), p.m.discipline), infoMeter(t('tama.bond_level', { n: bp.level }), bp.pct)], items };
    },
    trip() {
      const p = pet(), now = petNow();
      if (E.isAway(p)) {
        return { title: t('tama.st.trip'), icon: 'compass', info: [textRow(t('tama.trip.away', { zone: t('tama.zone.' + p.exp.zone) })), untilRow(t('tama.trip.back_in'), p.exp.until)],
          items: [{ label: t('tama.act.recall'), hint: t('tama.hint.recall'), icon: 'back', run: doRecall }] };
      }
      if (p.exp?.done) {
        return { title: t('tama.st.trip'), icon: 'compass', info: [textRow(t('tama.trip.back', { name: p.name }), 'is-ok')],
          items: [{ label: t('tama.act.loot'), hint: t('tama.hint.loot'), icon: 'gift', lit: true, run: doLoot }] };
      }
      const rank = P.rankOf(player().xp).level;
      const cdWalk = E.cooldownLeft(p, 'walk', now);
      const why = E.canExplore(p, now);
      const items = [{ label: t('tama.act.walk'), hint: cooldownHint(cdWalk, t('tama.hint.walk')), icon: 'walk', lit: p.request?.type === 'walk', disabled: cdWalk > 0, run: doWalk }];
      for (const [id, z] of Object.entries(ZONES)) {
        const locked = rank < z.rank;
        items.push({
          label: t('tama.zone.' + id),
          hint: locked ? t('tama.lock.rank', { n: z.rank }) : t('tama.hint.zone', { time: dur(z.mins * E.MINUTE), min: z.shards[0], max: z.shards[1] }),
          icon: locked ? 'lock' : 'map', disabled: locked || Boolean(why), run: () => doExplore(id),
        });
      }
      const info = [textRow(t('tama.trip.info'))];
      if (why) info.push(textRow(t('tama.res.' + why, { name: p.name }), 'is-warn'));
      return { title: t('tama.st.trip'), icon: 'compass', info, items };
    },
    home() {
      const deco = player().deco;
      const items = SLOTS.map((slot) => {
        const id = deco[slot];
        return { label: t('tama.slot.' + slot), hint: id ? `${t('tama.decor.' + id)} · ${decorEffects(DECOR[id]).join(' · ')}` : t('tama.home.empty'), art: id ? decorArt(id) : null, icon: id ? null : SLOT_ICON[slot], run: () => openSlot(slot) };
      });
      if (go) items.push({ label: t('tama.home.shop'), hint: t('tama.home.shop_hint'), icon: 'bag', run: () => { closeAll(); go('/tamagotchi/shop'); } });
      return { title: t('tama.st.home'), icon: 'home', info: [textRow(t('tama.home.info'))], items };
    },
  };

  function openSlot(slot) {
    pushFrame(() => {
      const doc = petState.doc;
      const current = doc.player.deco[slot];
      const owned = Object.keys(DECOR).filter((id) => DECOR[id].slot === slot && P.owns(doc, id));
      const items = owned.map((id) => ({
        label: t('tama.decor.' + id), hint: decorEffects(DECOR[id]).join(' · '), art: decorArt(id), note: id === current ? t('tama.home.placed') : '', lit: id === current,
        run: () => { const r = petAct((d) => P.placeDecor(d, slot, id)); if (r.ok) { sfx('select'); speak(t('tama.res.placed')); } popFrame(); },
      }));
      items.push({ label: t('tama.home.none'), hint: t('tama.home.none_hint'), icon: SLOT_ICON[slot], disabled: !current, run: () => { petAct((d) => P.placeDecor(d, slot, null)); sfx('back'); popFrame(); } });
      if (!owned.length) items.unshift({ label: t('tama.home.nothing'), hint: t('tama.home.shop_hint'), icon: 'bag', disabled: !go, run: () => { closeAll(); go?.('/tamagotchi/shop'); } });
      return { title: t('tama.slot.' + slot), icon: SLOT_ICON[slot], info: [], items };
    });
  }

  /* Scan: was braucht das Tier gerade? Jede Zeile führt direkt zur Lösung. */
  function scanFrame() {
    const p = pet(), sp = species(), now = petNow();
    const needs = E.needs(p, now);
    const fix = {
      hungry: { icon: 'feed', run: () => openStation('feed', true) },
      unhappy: { icon: 'play', run: () => openStation('play', true) },
      sick: { icon: 'medicine', run: () => openStation('vet', true) },
      lights: { icon: 'lights', run: doLights },
      attention: { icon: 'discipline', run: doScold },
      poop: { icon: 'clean', run: doClean },
      dirty: { icon: 'bath', run: doGroom },
      loot: { icon: 'gift', run: doLoot },
    };
    const items = [];
    for (const n of needs) {
      if (n === 'imprint' && p.request) {
        const r = p.request.type;
        items.push({ label: `${t('tama.need.imprint')}: ${requestText(p.request, sp)}`, hint: t('tama.fix.imprint'), icon: r === 'cuddle' ? 'cuddle' : r === 'walk' ? 'walk' : 'feed', lit: true,
          run: r === 'cuddle' ? doCuddle : r === 'walk' ? doWalk : r === 'meal' ? () => doFeed('meal') : () => openStation('feed', true) });
      } else if (fix[n]) items.push({ label: t('tama.need.' + n), hint: t('tama.fix.' + n), icon: fix[n].icon, lit: true, run: fix[n].run });
    }
    // Sanfte Hinweise, bevor es ernst wird
    if (!needs.includes('hungry') && p.m.hunger < 35) items.push({ label: t('tama.need.peckish'), hint: t('tama.fix.hungry'), icon: 'feed', run: () => openStation('feed', true) });
    if (!needs.includes('unhappy') && p.m.happy < 35) items.push({ label: t('tama.need.bored'), hint: t('tama.fix.unhappy'), icon: 'play', run: () => openStation('play', true) });
    if (!p.asleep && p.m.energy < 25) items.push({ label: t('tama.need.sleepy'), hint: t('tama.fix.sleepy'), icon: 'moon', run: () => openStation('sleep', true) });
    if (!items.length) items.push({ label: t('tama.scan.fine'), hint: t('tama.scan.fine_hint'), icon: 'check', disabled: true });
    const bp = E.bondProgress(p);
    const buffs = E.activeBuffs(p, now);
    const info = [
      el('div.tama-scan-grid', {},
        infoMeter(t('tama.meter.hunger'), p.m.hunger), infoMeter(t('tama.meter.happy'), p.m.happy),
        infoMeter(t('tama.meter.energy'), p.m.energy), infoMeter(t('tama.meter.health'), p.m.health),
        infoMeter(t('tama.meter.hygiene'), E.hygiene(p, now)), infoMeter(t('tama.meter.discipline'), p.m.discipline)),
      el('div.tama-scan-chips', {},
        el('span', { text: t('tama.pers.' + p.personality) }),
        el('span', { text: t('tama.bond_level', { n: bp.level }) }),
        el('span', { text: `${Math.round(p.m.weight)} · ${t('tama.weight.' + E.weightStatus(p))}` }),
        el('span', { text: dur(E.ageMs(p, now)) }),
        p.m.imprint > 0 ? el('span', { text: `${t('tama.card.imprint')} ${Math.round(p.m.imprint)} %` }) : null,
        ...buffs.map((b) => el('span.is-buff.buff-' + b.kind, { text: t('tama.buff.' + b.kind) }))),
    ];
    return { title: t('tama.scan.title', { name: p.name }), icon: 'radar', info, items, kind: 'scan' };
  }

  function pushFrame(build) {
    stack.push({ build, index: 0 });
    mode = 'menu';
    renderOverlay();
  }

  function popFrame() {
    stack.pop();
    if (!stack.length) return closeAll();
    renderOverlay();
  }

  function openStation(key, nested = false) {
    const p = pet();
    if (!p) return;
    const blocked = p.end ? 'gone' : p.cryo ? 'frozen' : p.stage === 'egg' ? 'egg' : E.isAway(p) && !['trip', 'home'].includes(key) ? 'away' : null;
    if (blocked) {
      if (p.stage === 'egg' && !p.end && !p.cryo) return doWarm();
      if (p.end) return openNest?.();
      return refuse({ ok: false, code: blocked });
    }
    sfx('select');
    if (!nested) stack = [];
    stationSel = Math.max(0, STATIONS.findIndex((s) => s.key === key));
    pushFrame(() => STATION[key]());
  }

  function openScan() {
    const p = pet();
    if (!p || p.end || p.cryo || p.stage === 'egg' || E.isAway(p)) return refuse({ ok: false, code: p?.end ? 'gone' : p?.cryo ? 'frozen' : p?.stage === 'egg' ? 'egg' : 'away' });
    sfx('select');
    stack = [];
    lcd.classList.remove('is-scanning');
    void lcd.offsetWidth;
    lcd.classList.add('is-scanning');
    setTimeout(() => lcd.classList.remove('is-scanning'), 900);
    pushFrame(scanFrame);
  }

  function openStations() {
    sfx('select');
    stack = [];
    mode = 'stations';
    renderOverlay();
  }

  function closeAll() {
    stack = [];
    if (mode !== 'game') mode = null;
    renderOverlay();
  }

  function move(step) {
    const f = stack.at(-1);
    if (!f?.items?.length) return;
    f.index = (f.index + step + f.items.length) % f.items.length;
    renderOverlay();
  }

  function pick(i) {
    const f = stack.at(-1);
    const item = f?.items?.[i];
    if (!item) return;
    if (item.disabled) { sfx('refuse'); speak(item.hint); return; }
    sfx('select');
    item.run();
  }

  function itemArtNode(it) {
    if (it.art instanceof Node) return el('span.tama-menu-art', {}, it.art.cloneNode(true));
    if (it.art) return el('span.tama-menu-art', {}, svg(it.art));
    if (it.icon) return el('span.tama-menu-art.is-icon', {}, svg(icon(it.icon)));
    return el('span.tama-menu-art.is-icon');
  }

  function renderOverlay() {
    if (game) return;
    if (mode === 'stations') {
      const p = pet();
      overlay.classList.add('is-open');
      overlay.replaceChildren(el('div.tama-menu.is-stations', { role: 'menu', 'aria-label': t('tama.key.menu') },
        el('div.tama-menu-title', {}, svg(icon('menu')), el('span', { text: t('tama.key.menu') })),
        el('div.tama-station-grid', {}, STATIONS.map((st, i) => el('button.tama-station' + (i === stationSel ? '.is-sel' : '') + (stationLit(st.key, p) ? '.is-lit' : ''), {
          type: 'button', role: 'menuitem', onclick: () => { stationSel = i; openStation(st.key); },
        }, svg(icon(st.icon)), el('span', { text: t('tama.st.' + st.key) })))),
        el('button.tama-menu-close', { type: 'button', 'aria-label': t('tama.close'), onclick: closeAll }, '×')));
      renderKeys();
      return;
    }
    const f = stack.at(-1);
    if (!f) { overlay.classList.remove('is-open'); overlay.replaceChildren(); renderKeys(); return; }
    const p = pet();
    if (!p || p.end || p.cryo) { stack = []; mode = null; overlay.classList.remove('is-open'); overlay.replaceChildren(); renderKeys(); return; }
    const data = f.build();
    f.items = data.items;
    f.index = Math.min(f.index, Math.max(0, data.items.length - 1));
    overlay.classList.add('is-open');
    const list = el('div.tama-menu-items', {}, data.items.map((it, i) => el('button.tama-menu-item' + (i === f.index ? '.is-sel' : '') + (it.lit ? '.is-lit' : '') + (it.disabled ? '.is-off' : ''), {
      type: 'button', role: 'menuitem', 'aria-disabled': it.disabled ? 'true' : null, onclick: () => { f.index = i; pick(i); },
    },
    itemArtNode(it),
    el('span.tama-menu-copy', {}, el('strong', { text: it.label }), it.hint ? el('small', { text: it.hint }) : null,
      it.progress != null ? el('span.tama-bar.is-thin', {}, el('span', { style: `width:${Math.round(it.progress * 100)}%` })) : null),
    it.count ? el('span.tama-menu-count', { text: it.count }) : null,
    it.note ? el('span.tama-menu-note', { text: it.note }) : null)));
    overlay.replaceChildren(el('div.tama-menu' + (data.kind === 'scan' ? '.is-scan' : ''), { role: 'menu', 'aria-label': data.title },
      el('div.tama-menu-title', {}, stack.length > 1 ? el('button.tama-menu-back', { type: 'button', 'aria-label': t('tama.key.back'), onclick: popFrame }, svg(icon('back'))) : null,
        svg(icon(data.icon || 'info')), el('span', { text: data.title })),
      data.info?.filter(Boolean).length ? el('div.tama-menu-info', {}, data.info.filter(Boolean)) : null,
      list,
      el('button.tama-menu-close', { type: 'button', 'aria-label': t('tama.close'), onclick: closeAll }, '×')));
    // Beim ersten Eintrag bleibt der Kopf (Titel, Werte) sichtbar
    if (f.index > 0) list.querySelector('.is-sel')?.scrollIntoView?.({ block: 'nearest' });
    renderKeys();
  }

  function stationLit(key, p = pet()) {
    if (!p || p.end || p.cryo || p.stage === 'egg') return false;
    const now = petNow();
    switch (key) {
      case 'feed': return p.m.hunger < 25 || ['meal', 'kibble', 'snack'].includes(p.request?.type);
      case 'sleep': return Boolean(p.asleep && !p.nap && (!p.lightsOff || !p.night?.tucked));
      case 'play': return p.m.happy < 25 && !p.asleep;
      case 'vet': return Boolean(p.sick);
      case 'care': return p.poop > 0 || E.hygiene(p, now) < 30;
      case 'train': return Boolean(p.misbehave);
      case 'trip': return Boolean(p.exp?.done) || p.request?.type === 'walk';
      default: return false;
    }
  }

  /* ------------------------------- Softkeys ------------------------------- */

  /** Die gerade sinnvollste Aktion für die mittlere Taste. */
  function context() {
    const p = pet();
    const doc = petState.doc;
    const now = petNow();
    if (!p || p.end) return { key: 'new_egg', icon: 'egg', run: () => openNest?.() };
    if (p.cryo) return { key: 'thaw', icon: 'cryo', run: doCryo };
    if (p.stage === 'egg') return { key: 'warm', icon: 'egg', run: doWarm };
    if (E.isAway(p)) return P.dropReady(doc, now) ? { key: 'drop', icon: 'crate', run: openDrop } : { key: 'radio', icon: 'compass', run: () => openStation('trip') };
    if (p.asleep) {
      if (!p.lightsOff) return { key: 'lights_off', icon: 'lights', run: doLights };
      if (!p.nap && !p.night?.tucked) return { key: 'tuck', icon: 'moon', run: doTuck };
      return P.dropReady(doc, now) ? { key: 'drop', icon: 'crate', run: openDrop } : { key: 'hush', icon: 'moon', run: () => speak(t('tama.res.hush', { name: p.name }), 1800) };
    }
    if (p.sick) return { key: 'medicine', icon: 'medicine', run: () => doCure(false) };
    if (p.misbehave) return { key: 'scold', icon: 'discipline', run: doScold };
    if (p.request) {
      const r = p.request.type;
      if (r === 'cuddle') return { key: 'cuddle', icon: 'cuddle', run: doCuddle };
      if (r === 'walk') return { key: 'walk', icon: 'walk', run: doWalk };
      if (r === 'meal') return { key: 'feed', icon: 'feed', run: () => doFeed('meal') };
      const best = [...KIBBLE].reverse().find((id) => doc.player.inv[id] > 0);
      return best ? { key: 'kibble', icon: 'feed', run: () => doFeed(best) } : { key: 'feed', icon: 'feed', run: () => openStation('feed') };
    }
    if (P.dropReady(doc, now)) return { key: 'drop', icon: 'crate', run: openDrop };
    if (p.exp?.done) return { key: 'loot', icon: 'gift', run: doLoot };
    if (p.poop) return { key: 'clean', icon: 'clean', run: doClean };
    if (p.m.hunger < 25) return { key: 'feed', icon: 'feed', run: () => openStation('feed') };
    if (E.hygiene(p, now) < 30 && !E.cooldownLeft(p, 'groom', now)) return { key: 'groom', icon: 'bath', run: doGroom };
    if (!E.cooldownLeft(p, 'cuddle', now)) return { key: 'cuddle', icon: 'cuddle', run: doCuddle };
    return { key: 'pet', icon: 'heart', run: doPet };
  }

  function setKey(k, name, iconName, cls = '') {
    const ke = keyEls[k];
    const sig = name + '|' + iconName + '|' + cls;
    if (ke.sig === sig) return;
    ke.sig = sig;
    const label = t('tama.key.' + name);
    ke.cap.replaceChildren(svg(icon(iconName)));
    ke.label.textContent = label;
    ke.b.setAttribute('aria-label', label);
    ke.b.title = label;
    ke.b.className = `tama-key is-${k}${cls ? ' ' + cls : ''}`;
  }

  function renderKeys() {
    if (mode === 'game') {
      setKey('l', 'left', 'back');
      setKey('m', 'action', 'star', 'is-primary');
      setKey('r', 'right', 'next');
      return;
    }
    if (mode === 'menu' || mode === 'stations') {
      setKey('l', 'back', 'back');
      setKey('m', 'ok', 'check', 'is-primary');
      setKey('r', 'next', 'next');
      return;
    }
    const p = pet();
    const ctx = context();
    const urgent = p && !p.end && (ctx.key === 'drop' || ctx.key === 'loot' || E.calling(p, petNow()).length > 0 || ['warm', 'thaw', 'new_egg'].includes(ctx.key));
    setKey('l', 'scan', 'radar', p && E.needs(p, petNow()).length ? 'has-dot' : '');
    setKey('m', ctx.key, ctx.icon, 'is-primary' + (urgent ? ' is-urgent' : ''));
    setKey('r', 'menu', 'menu');
  }

  function press(k, down = true) {
    if (game) { game.button({ l: 'a', m: 'b', r: 'c' }[k], down); return; }
    if (!down) return;
    sfx('tick');
    buzz(6);
    if (mode === 'menu') {
      if (k === 'l') return popFrame();
      if (k === 'r') return move(1);
      return pick(stack.at(-1)?.index ?? 0);
    }
    if (mode === 'stations') {
      if (k === 'l') return closeAll();
      if (k === 'r') { stationSel = (stationSel + 1) % STATIONS.length; return renderOverlay(); }
      return openStation(STATIONS[stationSel].key);
    }
    if (k === 'l') return openScan();
    if (k === 'r') return openStations();
    const ctx = context();
    ctx.run();
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
    if (game) mapped = k === 'ArrowLeft' || k === '1' ? 'l' : k === 'ArrowRight' || k === '3' ? 'r' : k === 'Enter' || k === ' ' || k === 'ArrowUp' || k === '2' ? 'm' : k === 'Escape' ? 'quit' : null;
    else if (!down) return;
    else if (k === 'ArrowLeft' || k === '1') mapped = 'l';
    else if (k === 'Enter' || k === ' ' || k === '2') mapped = 'm';
    else if (k === 'ArrowRight' || k === '3') mapped = 'r';
    else if (k === 'Escape' && mode) mapped = 'esc';
    else if ((k === 'ArrowDown' || k === 'ArrowUp') && mode) mapped = k === 'ArrowDown' ? 'next' : 'prev';
    if (!mapped) return;
    e.preventDefault();
    if (mapped === 'quit') { if (down) endGame(null); return; }
    if (mapped === 'esc') { if (mode === 'menu') popFrame(); else closeAll(); return; }
    if (mapped === 'next' || mapped === 'prev') {
      const step = mapped === 'next' ? 1 : -1;
      if (mode === 'menu') move(step);
      else if (mode === 'stations') { stationSel = (stationSel + step + STATIONS.length) % STATIONS.length; renderOverlay(); }
      return;
    }
    if (game && e.repeat) return;
    press(mapped, down);
  }

  /* ------------------------------ Symbole --------------------------------- */

  function renderIcons() {
    const p = pet();
    const calls = p ? E.calling(p, petNow()) : [];
    const frozen = !p || p.end || p.cryo || p.stage === 'egg';
    const gone = E.isAway(p);
    stationBtns.forEach((b, i) => {
      const key = STATIONS[i].key;
      b.classList.toggle('is-sel', mode === 'menu' && stack.length > 0 && i === stationSel);
      b.classList.toggle('is-lit', stationLit(key, p));
      b.classList.toggle('is-dim', Boolean(frozen || (gone && !['trip', 'home'].includes(key))));
    });
    led.classList.toggle('is-on', calls.length > 0 || Boolean(p && !p.end && E.needs(p, petNow()).includes('hatch')));
    led.title = calls.length ? calls.map((c) => t('tama.need.' + c)).join(' · ') : '';
  }

  /* ---------------------------- Pflegeleiste ------------------------------ */

  function renderDock() {
    const p = pet();
    if (!p) { dock.replaceChildren(); return; }
    const now = petNow();
    const doc = petState.doc;
    const btn = (name, label, onclick, { disabled = false, note = '', lit = false, cls = '' } = {}) => el('button.tama-dock-btn' + (lit ? '.is-lit' : '') + (cls ? '.' + cls : ''), { type: 'button', onclick, disabled: disabled ? true : null },
      svg(icon(name)), el('span', {}, el('strong', { text: label }), note ? el('small', { text: note }) : null));
    const items = [];
    if (P.dropReady(doc, now)) {
      const si = P.streakInfo(doc, now);
      items.push(btn('crate', t('tama.drop.open'), openDrop, { lit: true, cls: 'is-drop', note: t('tama.drop.day', { n: si.next }) }));
    }
    if (p.stage === 'egg' && !p.end) {
      items.push(btn('egg', t('tama.act.warm'), doWarm, { note: t('tama.warm_hint') }));
    } else if (!p.end && E.isAway(p)) {
      items.push(el('div.tama-dock-btn.is-info', {}, svg(icon('compass')), el('span', {}, el('strong', { text: t('tama.zone.' + p.exp.zone) }), el('small', {}, el('span', { text: t('tama.trip.back_in') + ' ' }), el('b', { dataset: { until: String(p.exp.until) } })))));
    } else if (!p.end) {
      const cd = (kind) => E.cooldownLeft(p, kind, now);
      if (p.exp?.done) items.push(btn('gift', t('tama.act.loot'), doLoot, { lit: true }));
      items.push(btn('cuddle', t('tama.act.cuddle'), doCuddle, { disabled: Boolean(p.cryo), note: cd('cuddle') ? t('tama.cooldown', { time: dur(cd('cuddle')) }) : '', lit: p.request?.type === 'cuddle' }));
      items.push(btn('walk', t('tama.act.walk'), doWalk, { disabled: Boolean(p.cryo), note: cd('walk') ? t('tama.cooldown', { time: dur(cd('walk')) }) : '', lit: p.request?.type === 'walk' }));
    }
    if (!p.end && !E.isAway(p)) items.push(btn('cryo', p.cryo ? t('tama.act.thaw') : t('tama.act.cryo'), doCryo, { lit: Boolean(p.cryo), note: p.cryo ? t('tama.frozen_since', { time: dur(now - p.cryo.at) }) : '' }));
    else if (p.end) items.push(btn('egg', t('tama.new_egg'), () => openNest?.(), { lit: true }));
    dock.replaceChildren(...items);
  }

  function updateClocks() {
    const now = petNow();
    for (const node of [...device.querySelectorAll('[data-until]'), ...dock.querySelectorAll('[data-until]')]) {
      const left = Number(node.dataset.until) - now;
      node.textContent = ' ' + (left > 0 ? dur(left) : t('tama.time.now'));
    }
  }

  /* ------------------------------ Ereignisse ------------------------------ */

  function handleEvents(evs = []) {
    const p = pet();
    if (!p || !evs.length) return;
    const visible = document.visibilityState === 'visible';
    for (const ev of evs) {
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
      if (ev === 'back') { sfx('happy'); speak(t('tama.ev.back', { name: p.name }), 3600); toast?.(t('tama.ev.back', { name: p.name })); }
      if (ev === 'call' && visible && Date.now() - lastCall > 60_000) { lastCall = Date.now(); sfx('call'); buzz([60, 80, 60]); speak(t('tama.ev.call', { name: p.name })); }
    }
  }

  /** Fortschritts-Hinweise: Aufgabe erledigt, Rangaufstieg, Bindung, Erfolg. */
  function handleNotes(notes = []) {
    const shown = notes.filter((n) => n.type !== 'day');
    if (!shown.length) return;
    let delay = 600;
    for (const n of shown.slice(0, 4)) {
      const text = noteText(n);
      if (!text) continue;
      setTimeout(() => {
        if (destroyed) return;
        toast?.(text);
        if (n.type === 'rank') { sfx('levelup'); flash(); } else if (n.type === 'bond') { sfx('happy'); burst('heart', 3); } else sfx('coin');
      }, delay);
      delay += 700;
    }
  }

  /* ------------------------------ Lebenszyklus ---------------------------- */

  function renderAll() {
    if (destroyed) return;
    renderScreen();
    renderIcons();
    renderDock();
    if (mode === 'menu' || mode === 'stations') renderOverlay();
    else renderKeys();
    updateClocks();
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
    handleNotes(ev?.notes);
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
    if (!p || game || mode) return;
    if (!e.target.closest('.tama-pet')) return;
    if (p.stage === 'egg') doWarm();
    else if (!p.end && !p.cryo && !p.asleep) doPet();
  });

  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);
  wanderTimer = setInterval(wander, 3400);
  let forced = 0;
  secondTimer = setInterval(() => {
    if (!root.isConnected) { destroy(); return; }
    updateClocks();
    const p = pet();
    const now = petNow();
    renderHud(now);
    // Schlüpfen und Rückkehr sofort zeigen – höchstens alle paar Sekunden neu rechnen
    const due = (p?.stage === 'egg' && now >= p.hatchAt) || (E.isAway(p) && now >= p.exp.until);
    if (due && now - forced > 4000) { forced = now; tickPet(); }
  }, 1000);
  tickPet();
  renderAll();

  return { root, destroy, device };
}
