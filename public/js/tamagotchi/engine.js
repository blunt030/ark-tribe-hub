/**
 * Tek-Gotchi – Simulationskern des Dino-Tamagotchis.
 *
 * Reine Spiellogik ohne DOM: dieselbe Datei läuft im Browser und in den
 * Node-Tests. Das Tier lebt in Echtzeit weiter, auch wenn niemand zuschaut –
 * advance() rechnet die verstrichene Zeit in Minutenschritten nach, genau wie
 * das Original von 1996, das in der Hosentasche weiterlebte.
 *
 * Determinismus: Jeder Zufall hängt nur von (seed, Minute, Zweck) ab. Ein
 * Nachrechnen in einem Rutsch ergibt deshalb exakt denselben Zustand wie viele
 * kleine Schritte. Zwei Geräte mit demselben Spielstand sehen dasselbe Tier.
 *
 * Mechaniken nach Vorbild des Originals (Hunger/Laune in Herzen, Pflegefehler
 * nach 15 Minuten, Disziplin über „Fake-Rufe“, Kot, Krankheit mit teils zwei
 * Medizin-Dosen, Licht aus zur Schlafenszeit, pflegeabhängige Entwicklung) und
 * aus ARK (Prägung über Pflegeanfragen, Reifestufen, Alpha-/Tek-Varianten,
 * Kryopod als Pause, Zucht mit Farbmutationen).
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const STAGES = ['egg', 'baby', 'juvenile', 'adolescent', 'adult', 'elder'];
export const VARIANTS = ['alpha', 'loyal', 'feral', 'tek'];
export const PERSONALITIES = ['glutton', 'playful', 'sleepy', 'robust', 'cheeky', 'clingy', 'nightowl'];
export const MODES = ['relaxed', 'classic'];
export const REQUEST_TYPES = ['cuddle', 'walk', 'meal', 'snack'];
export const DOC_VERSION = 1;
export const NAME_MAX = 24;

export const EGG_TIME = 2 * MINUTE;
export const STAGE_LEN = { baby: HOUR, juvenile: DAY, adolescent: 2 * DAY };
const ELDER_SPAN = 3 * DAY;
export const BREED_AFTER = 2 * DAY;

// Minuten, bis ein voller Wert im Wachzustand auf 0 gefallen ist.
const DECAY = {
  hunger: { baby: 90, juvenile: 240, adolescent: 300, adult: 360, elder: 300 },
  happy: { baby: 100, juvenile: 270, adolescent: 330, adult: 420, elder: 360 },
  energy: { baby: 150, juvenile: 720, adolescent: 840, adult: 900, elder: 720 },
};
const SLEEP_DECAY = 0.25;
// Entspannter Modus: Hunger und Laune sinken langsamer – für Tribe-Mitglieder, die ein paarmal am Tag vorbeischauen.
const RELAXED_DECAY = 0.6;
const ENERGY_REGEN = { dark: 360, light: 540 };
const HEALTH = { sick: 960, starving: 1200, sad: 2160, underweight: 2880, regen: 600 };
export const BASE_WEIGHT = { egg: 0, baby: 5, juvenile: 10, adolescent: 20, adult: 30, elder: 28 };
// [Schlafenszeit, Aufwachzeit] in Stunden Ortszeit. Babys halten nur Nickerchen.
const SCHEDULE = { juvenile: [21, 8], adolescent: [22, 8], adult: [23, 8], elder: [22, 8] };
const POOP_EVERY = { baby: [25, 40], juvenile: [120, 180], adolescent: [150, 210], adult: [180, 270], elder: [180, 240] };
// ARK-Prägung: Abstand bis zur nächsten Pflegeanfrage („Möchte Pflege in …“).
export const REQUEST_EVERY = { baby: 15, juvenile: 180, adolescent: 240 };
const REQUEST_WINDOW = 3 * HOUR;
const IMPRINT_GAIN = 8;
const MISBEHAVE_EVERY = [180, 420];
export const CARE_WINDOW = 15 * MINUTE;
const CARE_REPEAT = 3 * HOUR;
const MAX_CATCH_UP = 60 * DAY;
const LOG_MAX = 60;
const HALL_MAX = 30;
const WARM_MAX = 12;
export const COOLDOWN = { cuddle: 10 * MINUTE, walk: 30 * MINUTE };

// Wirkung der Persönlichkeit (moderne Tamagotchis kennen das seit der Uni).
const TRAITS = {
  glutton: { hunger: 1.25, mealJoy: 6 },
  playful: { happy: 1.2, gameJoy: 1.5 },
  sleepy: { energy: 1.25, sleepLonger: 1 },
  robust: { sick: 0.6 },
  cheeky: { misbehave: 0.6 },
  clingy: { happy: 1.15, cuddleJoy: 2 },
  nightowl: { shift: 2 },
};

// Farbpalette für Zuchtmutationen – kräftige Töne wie die ARK-Farbregionen.
export const MUTATION_COLORS = [
  '#d63c3c', '#e8743b', '#e6c229', '#8fd14f', '#2fa66a', '#2ec4b6', '#3a86ff', '#5146d8',
  '#9b5de5', '#f15bb5', '#f7f7f2', '#2b2d42', '#8d5b3e', '#c9a227', '#5b8e7d', '#b8336a',
];

const SALT = { personality: 1, sick: 2, doses: 3, poop: 4, request: 5, misbehave: 6, snack: 7, mutation: 8, colorSlot: 9, colorPick: 10, inherit: 11 };

/* -------------------------------------------------------------------------- */
/* Hilfsfunktionen                                                             */
/* -------------------------------------------------------------------------- */

const clamp = (v, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v);

function mix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministische Zufallszahl in [0, 1) aus Seed, laufender Nummer und Zweck. */
export function rand(seed, n, salt) {
  const a = mix32((seed >>> 0) ^ Math.imul((n >>> 0) + 0x9e3779b9, 0x27d4eb2d));
  return mix32(a ^ Math.imul(salt + 1, 0x632be5ab)) / 4294967296;
}

const between = (seed, n, salt, [lo, hi]) => lo + Math.floor(rand(seed, n, salt) * (hi - lo + 1));
const minuteIndex = (ms) => Math.floor(ms / MINUTE);

export function newSeed() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

function localMinuteOfDay(ms) {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

const ENV = { minuteOfDay: localMinuteOfDay };

// Steuer- und unsichtbare Formatzeichen (u. a. Zeilentrenner, Bidi-Steuerung) aus Namen entfernen.
const INVISIBLE = new RegExp('[' + [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]]
  .map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join('') + ']', 'gu');

/** Säubert einen Tiernamen: keine Steuerzeichen, einfache Leerzeichen, max. 24 Zeichen. */
export function cleanName(raw) {
  const s = String(raw ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, NAME_MAX).join('');
}

function log(p, t, k, v) {
  p.log.push(v === undefined ? { t, k } : { t, k, v });
  if (p.log.length > LOG_MAX) p.log.splice(0, p.log.length - LOG_MAX);
}

/* -------------------------------------------------------------------------- */
/* Spielstand                                                                   */
/* -------------------------------------------------------------------------- */

/** Leerer Spielstand eines Kontos: aktuelles Tier, Dossier, Ahnengalerie, Einstellungen. */
export function newDoc() {
  return { v: DOC_VERSION, pet: null, dex: {}, hall: [], settings: { shell: 'tek', retro: false } };
}

export function createPet({ species, name, now, seed = newSeed(), mode = 'relaxed', gen = 1, colors = null, mutations = 0, personality }) {
  seed >>>= 0;
  return {
    id: 'p' + seed.toString(36) + now.toString(36),
    seed,
    species,
    name: cleanName(name) || species,
    gen,
    mutations,
    colors,
    mode: MODES.includes(mode) ? mode : 'relaxed',
    personality: PERSONALITIES.includes(personality)
      ? personality
      : PERSONALITIES[Math.floor(rand(seed, 0, SALT.personality) * PERSONALITIES.length)],
    stage: 'egg',
    teen: null,
    variant: null,
    span: null,
    bornAt: now,
    hatchAt: now + EGG_TIME,
    stageAt: now,
    t: now,
    warmth: 0,
    m: { hunger: 100, happy: 100, energy: 100, health: 100, discipline: 0, imprint: 0, weight: 0 },
    poop: 0,
    poopSince: [],
    nextPoopAt: null,
    sick: 0,
    sickSince: null,
    asleep: false,
    nap: false,
    napUntil: null,
    lightsOff: false,
    lightsOnAt: null,
    sleptAt: null,
    lightsMistake: false,
    misbehave: null,
    nextMisbehaveAt: null,
    request: null,
    nextRequestAt: null,
    empty: { hunger: null, happy: null },
    emptyCount: { hunger: 0, happy: 0 },
    cm: 0,
    dm: 0,
    cmStage: 0,
    dmStage: 0,
    snacks: [],
    cool: {},
    cryo: null,
    dazedUntil: null,
    stats: { meals: 0, snacks: 0, games: 0, wins: 0, cleans: 0, meds: 0, cuddles: 0, walks: 0, scolds: 0 },
    dex: {},
    log: [],
    end: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Zeit vergeht                                                                 */
/* -------------------------------------------------------------------------- */

function stageLength(p) {
  if (p.stage === 'adult') return p.span || 7 * DAY;
  if (p.stage === 'elder') return ELDER_SPAN;
  return STAGE_LEN[p.stage];
}

function hatch(p, at) {
  p.stage = 'baby';
  p.stageAt = at;
  p.hatchAt = at;
  Object.assign(p.m, { hunger: 50, happy: 50, energy: 100, health: 100, weight: BASE_WEIGHT.baby });
  p.nextPoopAt = at + between(p.seed, minuteIndex(at), SALT.poop, POOP_EVERY.baby) * MINUTE;
  p.nextRequestAt = at + REQUEST_EVERY.baby * MINUTE;
  log(p, at, 'hatch');
}

/** Welche erwachsene Form das Tier nach der bisherigen Pflege annehmen würde. */
export function adultVariant(p) {
  if (p.cm <= 2 && p.dm <= 1 && p.m.imprint >= 70) return 'alpha';
  if (p.cm <= 6 && p.dm <= 4) return 'loyal';
  return 'feral';
}

function adultSpan(p) {
  const bonus = { alpha: 3, tek: 3, loyal: 1, feral: -1 }[p.variant] || 0;
  return Math.round(clamp(7 * DAY + bonus * DAY - p.cm * 6 * HOUR, 3 * DAY, 12 * DAY));
}

function finish(p, at, cause) {
  p.end = { at, cause };
  p.asleep = false;
  p.nap = false;
  p.request = null;
  p.misbehave = null;
  log(p, at, 'end', cause);
}

function evolve(p, at) {
  const from = p.stage;
  if (from === 'elder') { finish(p, at, p.mode === 'classic' ? 'age' : 'retired'); return; }
  const to = { baby: 'juvenile', juvenile: 'adolescent', adolescent: 'adult', adult: 'elder' }[from];
  p.stage = to;
  p.stageAt = at;
  p.m.weight = Math.max(1, p.m.weight + BASE_WEIGHT[to] - BASE_WEIGHT[from]);
  if (to === 'juvenile') p.nextMisbehaveAt = at + between(p.seed, minuteIndex(at), SALT.misbehave, [60, 180]) * MINUTE;
  if (to === 'adolescent') p.teen = p.cm <= 2 && p.dm <= 1 ? 'good' : 'cheeky';
  if (to === 'adult') {
    p.variant = adultVariant(p);
    p.span = adultSpan(p);
    p.request = null;
    p.nextRequestAt = null;
  }
  p.cmStage = 0;
  p.dmStage = 0;
  log(p, at, 'evolve', to);
}

function scheduledSleep(p, T, env, tr) {
  const s = SCHEDULE[p.stage];
  if (!s) return false;
  const shift = (tr.shift || 0) * 60;
  const start = (s[0] * 60 + shift) % 1440;
  const end = (s[1] * 60 + shift + (tr.sleepLonger || 0) * 60) % 1440;
  const m = env.minuteOfDay(T);
  return start < end ? m >= start && m < end : m >= start || m < end;
}

function fallAsleep(p, T, nap) {
  p.asleep = true;
  p.nap = nap;
  p.sleptAt = T;
  p.lightsOnAt = null;
  p.lightsMistake = false;
  // Wer einschläft, hört auf zu quengeln – das zählt nicht als Erziehungsfehler.
  p.misbehave = null;
  // Im entspannten Modus kümmert sich der Tribe ums Licht.
  if (p.mode !== 'classic') p.lightsOff = true;
  log(p, T, nap ? 'nap' : 'sleep');
}

function sleepCheck(p, T, env, tr) {
  if (p.napUntil != null && T >= p.napUntil) p.napUntil = null;
  const sched = scheduledSleep(p, T, env, tr);
  const shouldSleep = sched || p.napUntil != null;
  if (shouldSleep && !p.asleep) fallAsleep(p, T, !sched);
  else if (shouldSleep && p.nap && sched) fallAsleep(p, T, false); // Nickerchen geht in den Nachtschlaf über
  else if (!shouldSleep && p.asleep) {
    p.asleep = false;
    p.nap = false;
    p.sleptAt = null;
    p.lightsOff = false;
    p.lightsOnAt = null;
    log(p, T, 'wake');
  }
}

function sickChance(p, T, tr) {
  let c = 0.00003;
  for (const since of p.poopSince) if (T - since > 30 * MINUTE) c += 0.00025;
  if (p.m.weight > BASE_WEIGHT[p.stage] * 1.6) c += 0.0002;
  if (p.m.hunger <= 0) c += 0.0002;
  if (p.m.health < 40) c += 0.0003;
  if (p.stage === 'baby') c *= 0.5;
  if (p.asleep) c *= 0.5;
  return c * (tr.sick || 1);
}

function addMistake(p, T, kind) {
  p.cm += 1;
  p.cmStage += 1;
  log(p, T, 'mistake', kind);
}

function careCheck(p, key, T) {
  if (p.asleep || p.m[key] > 0) {
    p.empty[key] = null;
    p.emptyCount[key] = 0;
    return;
  }
  if (p.empty[key] == null) { p.empty[key] = T; return; }
  if (T >= p.empty[key] + CARE_WINDOW + p.emptyCount[key] * CARE_REPEAT) {
    p.emptyCount[key] += 1;
    addMistake(p, T, key);
  }
}

function lightsCheck(p, T) {
  if (!p.asleep || p.nap || p.lightsOff || p.sleptAt == null) return;
  const since = Math.max(p.sleptAt, p.lightsOnAt ?? 0);
  if (T - since < CARE_WINDOW) return;
  if (p.mode !== 'classic') { p.lightsOff = true; return; }
  if (!p.lightsMistake) { p.lightsMistake = true; addMistake(p, T, 'lights'); }
}

function misbehaveCheck(p, T, n, tr) {
  if (p.misbehave) {
    if (T - p.misbehave.at >= CARE_WINDOW) {
      p.misbehave = null;
      // Im entspannten Modus verpufft ein überhörter Fake-Ruf, statt als Fehler zu zählen.
      if (p.mode === 'classic') {
        p.dm += 1;
        p.dmStage += 1;
        log(p, T, 'mistake', 'discipline');
      } else log(p, T, 'misbehave_over');
    }
    return;
  }
  if (p.nextMisbehaveAt == null || T < p.nextMisbehaveAt) return;
  if (p.m.discipline >= 100) { p.nextMisbehaveAt = null; return; }
  const able = ['juvenile', 'adolescent', 'adult'].includes(p.stage) && !p.asleep && !p.sick && p.m.hunger > 0 && p.m.happy > 0;
  if (!able) { p.nextMisbehaveAt = T + 30 * MINUTE; return; }
  p.misbehave = { at: T };
  p.nextMisbehaveAt = T + Math.round(between(p.seed, n, SALT.misbehave, MISBEHAVE_EVERY) * (tr.misbehave || 1)) * MINUTE;
  log(p, T, 'misbehave');
}

function requestCheck(p, T, n) {
  const every = REQUEST_EVERY[p.stage];
  if (!every) { p.request = null; p.nextRequestAt = null; return; }
  if (p.request) {
    // Während des Schlafs läuft das Zeitfenster der Anfrage nicht ab.
    if (p.asleep) { p.request.until += MINUTE; return; }
    if (T >= p.request.until) {
      log(p, T, 'imprint_missed', p.request.type);
      p.request = null;
      p.nextRequestAt = T + every * MINUTE;
    }
    return;
  }
  if (p.nextRequestAt == null) p.nextRequestAt = T + every * MINUTE;
  if (T < p.nextRequestAt) return;
  if (p.asleep) { p.nextRequestAt = T + 15 * MINUTE; return; }
  const r = rand(p.seed, n, SALT.request);
  const type = r < 0.35 ? 'cuddle' : r < 0.6 ? 'walk' : r < 0.8 ? 'meal' : 'snack';
  p.request = { type, at: T, until: T + REQUEST_WINDOW };
  p.nextRequestAt = null;
  log(p, T, 'request', type);
}

function collapse(p, T) {
  if (p.mode === 'classic') {
    finish(p, T, p.sick ? 'sickness' : p.m.hunger <= 0 ? 'starvation' : 'neglect');
    return;
  }
  // Tribe-Schutz: statt zu sterben landet das Tier rechtzeitig im Kryopod.
  p.m.health = 25;
  p.m.hunger = Math.max(p.m.hunger, 30);
  p.m.happy = Math.max(p.m.happy, 15);
  p.asleep = false;
  p.nap = false;
  p.napUntil = null;
  p.misbehave = null;
  p.cryo = { at: T, reason: 'rescue' };
  log(p, T, 'rescue');
}

function tick(p, T, env) {
  const n = minuteIndex(T);
  if (p.stage === 'egg') {
    if (p.hatchAt > T) return;
    hatch(p, p.hatchAt);
  }
  while (!p.end && T >= p.stageAt + stageLength(p)) evolve(p, p.stageAt + stageLength(p));
  if (p.end) return;

  const tr = TRAITS[p.personality] || {};
  const st = p.stage;
  const m = p.m;
  sleepCheck(p, T, env, tr);

  const slow = (p.asleep ? SLEEP_DECAY : 1) * (p.mode === 'classic' ? 1 : RELAXED_DECAY);
  m.hunger = clamp(m.hunger - (100 / DECAY.hunger[st]) * slow * (tr.hunger || 1));
  m.happy = clamp(m.happy - (100 / DECAY.happy[st]) * slow * (tr.happy || 1) * (m.health < 40 ? 1.3 : 1));
  if (p.asleep) m.energy = clamp(m.energy + 100 / (p.lightsOff ? ENERGY_REGEN.dark : ENERGY_REGEN.light));
  else {
    m.energy = clamp(m.energy - (100 / DECAY.energy[st]) * (tr.energy || 1));
    if (m.energy <= 0) {
      p.napUntil = T + (st === 'baby' ? 15 : 45) * MINUTE;
      fallAsleep(p, T, true);
    }
  }

  if (p.nextPoopAt != null && T >= p.nextPoopAt) {
    if (p.asleep) p.nextPoopAt = T + 30 * MINUTE;
    else {
      if (p.poop < 4) {
        p.poop += 1;
        p.poopSince.push(T);
        log(p, T, 'poop');
      }
      p.nextPoopAt = T + between(p.seed, n, SALT.poop, POOP_EVERY[st]) * MINUTE;
    }
  }

  if (!p.sick && rand(p.seed, n, SALT.sick) < sickChance(p, T, tr)) {
    p.sick = rand(p.seed, n, SALT.doses) < 0.3 ? 2 : 1;
    p.sickSince = T;
    log(p, T, 'sick');
  }

  let dh = 0;
  if (p.sick) dh -= 100 / HEALTH.sick;
  if (m.hunger <= 0) dh -= 100 / HEALTH.starving;
  if (m.happy <= 0) dh -= 100 / HEALTH.sad;
  if (m.weight < BASE_WEIGHT[st] * 0.5) dh -= 100 / HEALTH.underweight;
  if (dh === 0 && m.hunger > 20) dh = 100 / HEALTH.regen;
  m.health = clamp(m.health + dh);

  careCheck(p, 'hunger', T);
  careCheck(p, 'happy', T);
  lightsCheck(p, T);
  misbehaveCheck(p, T, n, tr);
  requestCheck(p, T, n);

  // Geheime Entwicklung – wie Bill beim P1 erscheint sie erst später im Erwachsenenalter.
  if (st === 'adult' && p.variant === 'alpha' && m.imprint >= 95 && m.discipline >= 100 && p.cmStage === 0 && T - p.stageAt >= DAY) {
    p.variant = 'tek';
    log(p, T, 'secret');
  }

  if (m.health <= 0) collapse(p, T);
}

/**
 * Lässt die Zeit bis `now` vergehen. Verarbeitet werden ganze Minuten an festen
 * Minutengrenzen; dadurch ist das Ergebnis unabhängig davon, in wie vielen
 * Schritten nachgerechnet wird.
 */
export function advance(p, now, env = ENV) {
  if (!p || !(now > p.t)) return p;
  if (p.end || p.cryo) { p.t = now; return p; }
  if (now - p.t > MAX_CATCH_UP) p.t = now - MAX_CATCH_UP;
  const last = minuteIndex(now);
  for (let n = minuteIndex(p.t) + 1; n <= last; n++) {
    tick(p, n * MINUTE, env);
    if (p.end || p.cryo) break;
  }
  if (!p.end && !p.cryo && p.stage === 'egg' && p.hatchAt <= now) hatch(p, p.hatchAt);
  p.t = now;
  return p;
}

/** Trägt Schlüpfen, Aufzucht und neue Varianten ins Dossier ein (idempotent). */
export function syncDex(doc) {
  const p = doc.pet;
  if (!p || p.stage === 'egg') return;
  const e = (doc.dex[p.species] ||= { h: 0, a: 0, v: [] });
  p.dex ||= {};
  if (!p.dex.h) { e.h += 1; p.dex.h = 1; }
  if ((p.stage === 'adult' || p.stage === 'elder') && !p.dex.a) { e.a += 1; p.dex.a = 1; }
  if (p.variant && !e.v.includes(p.variant)) e.v.push(p.variant);
}

export function advanceDoc(doc, now, env = ENV) {
  if (doc?.pet) {
    advance(doc.pet, now, env);
    syncDex(doc);
  }
  return doc;
}

/* -------------------------------------------------------------------------- */
/* Aktionen                                                                     */
/* -------------------------------------------------------------------------- */

const fail = (code) => ({ ok: false, code });
const done = (code, extra) => ({ ok: true, code, ...extra });

function blocked(p, { awake = true, hatched = true } = {}) {
  if (!p) return 'no_pet';
  if (p.end) return 'gone';
  if (p.cryo) return 'frozen';
  if (hatched && p.stage === 'egg') return 'egg';
  if (awake && p.asleep) return 'asleep';
  return null;
}

const minWeight = (p) => Math.max(1, Math.round(BASE_WEIGHT[p.stage] * 0.5));
const isDazed = (p, now) => p.dazedUntil != null && now < p.dazedUntil;

function fulfill(p, type, now) {
  if (p.request?.type !== type) return 0;
  const before = p.m.imprint;
  p.m.imprint = Math.min(100, p.m.imprint + IMPRINT_GAIN);
  p.request = null;
  p.nextRequestAt = REQUEST_EVERY[p.stage] ? now + REQUEST_EVERY[p.stage] * MINUTE : null;
  log(p, now, 'imprint', Math.round(p.m.imprint));
  return p.m.imprint - before;
}

export function feed(p, kind, now) {
  const b = blocked(p);
  if (b) return fail(b);
  const tr = TRAITS[p.personality] || {};
  if (kind === 'meal') {
    if (p.m.hunger >= 100) return fail('full');
    p.m.hunger = clamp(p.m.hunger + 25);
    p.m.happy = clamp(p.m.happy + (tr.mealJoy || 0));
    p.m.weight += 1;
    p.stats.meals += 1;
    const imprint = fulfill(p, 'meal', now);
    log(p, now, 'meal');
    return done('meal', { imprint });
  }
  p.m.happy = clamp(p.m.happy + 20);
  p.m.hunger = clamp(p.m.hunger + 5);
  p.m.weight += 2;
  p.stats.snacks += 1;
  p.snacks = p.snacks.filter((t) => now - t < 2 * HOUR);
  p.snacks.push(now);
  let tummy = false;
  // Zu viele Leckerli hintereinander verderben den Magen (wie bei späteren Tamagotchis).
  if (!p.sick && p.snacks.length >= 4 && rand(p.seed, p.stats.snacks, SALT.snack) < 0.35) {
    p.sick = 1;
    p.sickSince = now;
    tummy = true;
    log(p, now, 'sick', 'tummy');
  }
  const imprint = fulfill(p, 'snack', now);
  log(p, now, 'snack');
  return done('snack', { imprint, tummy });
}

/** Prüft, ob das Tier gerade spielen oder spazieren gehen kann. */
export function canPlay(p, now, minEnergy = 5) {
  const b = blocked(p);
  if (b) return b;
  if (p.sick) return 'sick';
  if (isDazed(p, now)) return 'dazed';
  if (p.m.energy < minEnergy) return 'tired';
  return null;
}

export function play(p, result, now) {
  const b = canPlay(p, now);
  if (b) return fail(b);
  const tr = TRAITS[p.personality] || {};
  const won = Boolean(result?.won);
  p.m.happy = clamp(p.m.happy + (won ? 25 : 8) * (tr.gameJoy || 1));
  p.m.weight = Math.max(minWeight(p), p.m.weight - 1);
  p.m.energy = clamp(p.m.energy - 5);
  p.stats.games += 1;
  if (won) p.stats.wins += 1;
  log(p, now, won ? 'game_won' : 'game_lost', result?.game);
  return done(won ? 'won' : 'lost');
}

export function clean(p, now) {
  const b = blocked(p, { awake: false });
  if (b) return fail(b);
  if (!p.poop) return fail('spotless');
  p.poop = 0;
  p.poopSince = [];
  p.stats.cleans += 1;
  if (!p.asleep) p.m.happy = clamp(p.m.happy + 3);
  log(p, now, 'clean');
  return done('clean');
}

export function medicine(p, now) {
  const b = blocked(p, { awake: false });
  if (b) return fail(b);
  if (!p.sick) {
    if (!p.asleep) p.m.happy = clamp(p.m.happy - 5);
    return fail('healthy');
  }
  p.sick -= 1;
  p.stats.meds += 1;
  if (!p.sick) {
    p.sickSince = null;
    p.m.health = clamp(p.m.health + 10);
    log(p, now, 'cured');
    return done('cured');
  }
  log(p, now, 'dose');
  return done('dose');
}

export function lights(p, now) {
  const b = blocked(p, { awake: false });
  if (b) return fail(b);
  if (p.lightsOff) {
    p.lightsOff = false;
    p.lightsOnAt = now;
    return done('lights_on');
  }
  if (p.asleep) {
    p.lightsOff = true;
    return done('lights_off');
  }
  if (p.m.energy < 60) {
    p.napUntil = now + 45 * MINUTE;
    fallAsleep(p, now, true);
    p.lightsOff = true;
    return done('nap');
  }
  return fail('not_tired');
}

export function scold(p, now) {
  const b = blocked(p);
  if (b) return fail(b);
  if (p.misbehave) {
    p.misbehave = null;
    p.m.discipline = Math.min(100, p.m.discipline + 25);
    p.stats.scolds += 1;
    log(p, now, 'scold');
    return done('disciplined');
  }
  p.m.happy = clamp(p.m.happy - 10);
  log(p, now, 'scold_unfair');
  return done('unfair');
}

export function cooldownLeft(p, kind, now) {
  if (p?.request?.type === kind) return 0;
  return Math.max(0, (p?.cool?.[kind] ?? 0) - now);
}

export function cuddle(p, now) {
  const b = blocked(p);
  if (b) return fail(b);
  if (cooldownLeft(p, 'cuddle', now) > 0) return fail('cooldown');
  const tr = TRAITS[p.personality] || {};
  p.m.happy = clamp(p.m.happy + 10 * (tr.cuddleJoy || 1));
  p.cool.cuddle = now + COOLDOWN.cuddle;
  p.stats.cuddles += 1;
  const imprint = fulfill(p, 'cuddle', now);
  log(p, now, 'cuddle');
  return done('cuddle', { imprint });
}

export function walk(p, now) {
  const b = canPlay(p, now, 10);
  if (b) return fail(b);
  if (cooldownLeft(p, 'walk', now) > 0) return fail('cooldown');
  p.m.happy = clamp(p.m.happy + 15);
  p.m.energy = clamp(p.m.energy - 8);
  p.m.weight = Math.max(minWeight(p), p.m.weight - 1);
  p.cool.walk = now + COOLDOWN.walk;
  p.stats.walks += 1;
  const imprint = fulfill(p, 'walk', now);
  log(p, now, 'walk');
  return done('walk', { imprint });
}

/** Wärmt das Ei – es schlüpft ein paar Sekunden früher (max. 12-mal). */
export function warm(p, now) {
  if (!p || p.end || p.cryo || p.stage !== 'egg') return fail('egg');
  if (p.warmth >= WARM_MAX) return fail('warm_max');
  p.hatchAt = Math.max(now + 3000, p.hatchAt - 8000);
  p.warmth += 1;
  return done('warm');
}

/** Kryopod: friert das Tier ein – nichts altert, nichts verhungert. */
export function freeze(p, now) {
  if (!p || p.end) return fail('gone');
  if (p.cryo) return fail('frozen');
  p.cryo = { at: now, reason: 'manual' };
  log(p, now, 'cryo');
  return done('cryo');
}

function shiftTimes(p, d) {
  for (const k of ['bornAt', 'hatchAt', 'stageAt', 'sleptAt', 'napUntil', 'lightsOnAt', 'nextPoopAt', 'sickSince', 'nextMisbehaveAt', 'nextRequestAt', 'dazedUntil']) {
    if (typeof p[k] === 'number') p[k] += d;
  }
  p.poopSince = p.poopSince.map((t) => t + d);
  p.snacks = p.snacks.map((t) => t + d);
  if (p.misbehave) p.misbehave.at += d;
  if (p.request) { p.request.at += d; p.request.until += d; }
  for (const k of ['hunger', 'happy']) if (typeof p.empty[k] === 'number') p.empty[k] += d;
  for (const k of Object.keys(p.cool)) p.cool[k] += d;
}

/** Holt das Tier aus dem Kryopod. Die eingefrorene Zeit zählt nicht als Lebenszeit. */
export function thaw(p, now) {
  if (!p?.cryo || p.end) return fail('not_frozen');
  shiftTimes(p, Math.max(0, now - p.cryo.at));
  p.cryo = null;
  p.t = now;
  p.dazedUntil = now + 2 * MINUTE;
  log(p, now, 'thaw');
  return done('thaw');
}

export function rename(p, name) {
  const n = cleanName(name);
  if (!p || !n) return fail('name');
  p.name = n;
  return done('renamed');
}

export function setMode(p, mode) {
  if (!p || !MODES.includes(mode)) return fail('mode');
  p.mode = mode;
  return done('mode');
}

export function canBreed(p, now) {
  if (!p || p.end || p.cryo || p.sick || p.asleep) return false;
  return (p.stage === 'adult' && now - p.stageAt >= BREED_AFTER) || p.stage === 'elder';
}

/** Legt das beendete Tier in der Ahnengalerie ab (höchstens einmal). */
export function archive(doc, p) {
  if (!p || p.archived) return;
  p.archived = true;
  doc.hall.unshift({
    name: p.name, species: p.species, gen: p.gen, variant: p.variant, stage: p.stage,
    cause: p.end?.cause || 'released', age: ageMs(p, p.end?.at ?? p.t), at: p.end?.at ?? p.t,
    colors: p.colors, mode: p.mode,
  });
  if (doc.hall.length > HALL_MAX) doc.hall.length = HALL_MAX;
}

/** Neues Ei. Ein noch lebendes Tier wird dabei in die Freiheit entlassen. */
export function startEgg(doc, { species, name, now, mode, seed, personality } = {}) {
  const old = doc.pet;
  if (old && !old.end) finish(old, now, 'released');
  if (old) archive(doc, old);
  doc.pet = createPet({ species, name, now, mode, seed, personality });
  return done('egg');
}

/** Tier in die Wildnis entlassen (ohne gleich ein neues Ei zu legen). */
export function release(doc, now) {
  const p = doc.pet;
  if (!p) return fail('no_pet');
  if (!p.end) finish(p, now, 'released');
  archive(doc, p);
  doc.pet = null;
  return done('released');
}

function nextGenName(name) {
  const m = /^(.*?)\s+([IVX]+)$/.exec(name);
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  if (!m) return cleanName(name + ' II');
  const idx = roman.indexOf(m[2]);
  return cleanName(m[1] + ' ' + (idx >= 0 && idx < roman.length - 1 ? roman[idx + 1] : m[2]));
}

/** Zucht (wie Heirat/Generationen bei Tamagotchi Connection): Nachwuchs, evtl. mit Farbmutation. */
export function breed(doc, now, seed = newSeed()) {
  const p = doc.pet;
  if (!canBreed(p, now)) return fail('cannot_breed');
  finish(p, now, 'bred');
  archive(doc, p);
  const mutated = rand(seed, 1, SALT.mutation) < 0.25;
  let colors = p.colors ? { ...p.colors } : null;
  if (mutated) {
    const slot = Math.floor(rand(seed, 1, SALT.colorSlot) * 3);
    colors = { ...(colors || {}), [slot]: MUTATION_COLORS[Math.floor(rand(seed, 1, SALT.colorPick) * MUTATION_COLORS.length)] };
  }
  doc.pet = createPet({
    species: p.species, name: nextGenName(p.name), now, seed, mode: p.mode, gen: p.gen + 1, colors,
    mutations: (p.mutations || 0) + (mutated ? 1 : 0),
    personality: rand(seed, 1, SALT.inherit) < 0.5 ? p.personality : undefined,
  });
  return done('bred', { mutated });
}

/* -------------------------------------------------------------------------- */
/* Abgeleitete Werte für die Oberfläche                                         */
/* -------------------------------------------------------------------------- */

export function ageMs(p, now) {
  if (!p || p.stage === 'egg') return 0;
  const until = p.end?.at ?? p.cryo?.at ?? now;
  return Math.max(0, until - p.hatchAt);
}

/** Alles, was gerade Aufmerksamkeit braucht. „poop“ ist ein stiller Hinweis ohne Ruf. */
export function needs(p, now) {
  if (!p || p.end || p.cryo) return [];
  if (p.stage === 'egg') return now >= p.hatchAt ? ['hatch'] : [];
  const r = [];
  if (p.m.hunger <= 0) r.push('hungry');
  if (p.m.happy <= 0) r.push('unhappy');
  if (p.sick) r.push('sick');
  if (p.asleep && !p.nap && !p.lightsOff) r.push('lights');
  if (p.misbehave) r.push('attention');
  if (p.request) r.push('imprint');
  if (p.poop) r.push('poop');
  return r;
}

/** Leuchtet das Aufmerksamkeitssymbol? (Wie beim Original ohne Kot.) */
export function calling(p, now) {
  return needs(p, now).filter((n) => n !== 'poop' && n !== 'hatch');
}

export function mood(p, now) {
  if (!p) return 'none';
  if (p.end) return 'gone';
  if (p.cryo) return 'frozen';
  if (p.stage === 'egg') return 'egg';
  if (p.asleep) return 'sleep';
  if (p.sick) return 'sick';
  if (isDazed(p, now)) return 'dazed';
  if (p.m.hunger <= 0 || p.m.happy <= 0) return 'sad';
  if (p.misbehave) return 'cheeky';
  if (p.m.hunger < 25) return 'hungry';
  if (p.m.energy < 15) return 'tired';
  if (p.m.happy >= 75 && p.m.hunger >= 50) return 'happy';
  return 'ok';
}

/** Fortschritt der aktuellen Lebensphase für Ring und Zeitleiste. */
export function stageInfo(p, now) {
  if (!p) return null;
  if (p.stage === 'egg') {
    const total = Math.max(1, p.hatchAt - p.bornAt);
    return { stage: 'egg', next: 'baby', pct: clamp(((now - p.bornAt) / total) * 100), left: Math.max(0, p.hatchAt - now) };
  }
  const len = stageLength(p);
  const ref = p.end?.at ?? p.cryo?.at ?? now;
  const next = { baby: 'juvenile', juvenile: 'adolescent', adolescent: 'adult', adult: 'elder', elder: null }[p.stage];
  return { stage: p.stage, next, pct: clamp(((ref - p.stageAt) / len) * 100), left: Math.max(0, p.stageAt + len - ref) };
}

export function forecast(p) {
  if (!p || p.stage === 'egg') return null;
  return p.variant || adultVariant(p);
}

export function weightStatus(p) {
  if (!p || p.stage === 'egg') return 'ok';
  const base = BASE_WEIGHT[p.stage];
  if (p.m.weight > base * 1.6) return 'chubby';
  if (p.m.weight < base * 0.6) return 'thin';
  return 'ok';
}

/** Zeit bis zur nächsten Pflegeanfrage (ARK: „Möchte Pflege in …“), sonst null. */
export function nextRequestIn(p, now) {
  if (!p || p.request || p.nextRequestAt == null || p.cryo || p.end) return null;
  return Math.max(0, p.nextRequestAt - now);
}

export function hygiene(p) {
  return p ? clamp(100 - p.poop * 25) : 100;
}
