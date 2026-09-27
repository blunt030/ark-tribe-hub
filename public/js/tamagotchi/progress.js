/**
 * Fortschritt des Spielers über das einzelne Tier hinaus: tägliche
 * Versorgungskiste mit Serie, Tagesaufgaben, Element-Splitter, Pfleger-Rang,
 * Bindung, Händler, Gehege-Einrichtung, Erfolge und Events.
 *
 * Dazu die Aktionen auf Spielstandsebene: Sie rufen die Tier-Aktion der Engine
 * auf und verbuchen bei Erfolg Erfahrung, Bindung, Aufgaben und Erfolge. Jede
 * Aktion liefert das Ergebnis der Engine plus `given` (was es gab) und `notes`
 * (Aufgabe erledigt, Rang aufgestiegen, Erfolg freigeschaltet …).
 *
 * Wie die Engine rein und deterministisch, ohne DOM – läuft auch in den Tests.
 */
import * as E from './engine.js';
import {
  ITEMS, DECOR, SLOTS, SHELLS, TRICKS, ZONES, QUESTS, QUEST_COUNT, QUEST_BONUS, DROPS, DROP_BONUS,
  REWARDS, RANKS, RANK_NAMES, RANK_BONUS, ACHIEVEMENTS, EVENTS, WEEKEND_EVENT,
} from './catalog.js';

const SALT = { quest: 31, drop: 33, dropPick: 34, loot: 35, lootPick: 36, lootShards: 37, swap: 38, deal: 39 };
const pad = (n) => String(n).padStart(2, '0');
const fail = (code) => ({ ok: false, code });

/* -------------------------------------------------------------------------- */
/* Kalender                                                                     */
/* -------------------------------------------------------------------------- */

function localDayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localNextDay(ms) {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Tageswechsel um Mitternacht Ortszeit. In den Tests wird eine feste Zeitzone übergeben. */
export const ENV = {
  dayKey: localDayKey,
  weekday: (ms) => new Date(ms).getDay(),
  nextDay: localNextDay,
  minuteOfDay: (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); },
};

export function dayNumber(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / E.DAY);
}

/* -------------------------------------------------------------------------- */
/* Spielstand                                                                   */
/* -------------------------------------------------------------------------- */

export function newPlayer(seed = E.newSeed()) {
  return {
    seed: seed >>> 0,
    shards: 30,
    earned: 0,
    xp: 0,
    streak: 0,
    best: 0,
    lastDay: null,
    day: null,
    quests: [],
    bonus: false,
    swapped: false,
    inv: { kibble_basic: 3, treat: 5 },
    owned: ['bed_straw', 'shell_tek'],
    deco: { bed: 'bed_straw', toy: null, plant: null, light: null, trophy: null },
    ach: {},
    tally: {},
  };
}

/** Neuer Spielstand mit Spielerprofil. */
export function newGame(seed) {
  return { ...E.newDoc(), player: newPlayer(seed) };
}

/** Bringt ältere oder unvollständige Spielstände auf den aktuellen Stand. */
export function upgradeDoc(doc, now) {
  doc.v = E.DOC_VERSION;
  doc.dex ||= {};
  doc.hall ||= [];
  doc.settings = { shell: 'tek', retro: false, ...(doc.settings || {}) };
  const fresh = newPlayer();
  const pl = (doc.player = { ...fresh, ...(doc.player || {}) });
  pl.inv = { ...(pl.inv || {}) };
  pl.deco = { ...fresh.deco, ...(pl.deco || {}) };
  for (const k of ['quests', 'owned']) if (!Array.isArray(pl[k])) pl[k] = [...fresh[k]];
  for (const k of ['ach', 'tally']) pl[k] ||= {};
  if (!pl.owned.includes('shell_tek')) pl.owned.push('shell_tek');
  // Wer schon ein Gehäuse benutzt hat, behält es.
  const shell = 'shell_' + doc.settings.shell;
  if (SHELLS[doc.settings.shell] && !pl.owned.includes(shell)) pl.owned.push(shell);
  if (doc.pet) E.migratePet(doc.pet, now);
  return doc;
}

function addItem(pl, id, n = 1) {
  if (!ITEMS[id]) return;
  pl.inv[id] = Math.min(9999, (pl.inv[id] || 0) + n);
}

export const itemCount = (doc, id) => doc.player?.inv?.[id] || 0;

/* -------------------------------------------------------------------------- */
/* Events, Rang, Belohnungen                                                    */
/* -------------------------------------------------------------------------- */

/** Aktive Events am Tag von `now` (Saison-Event nach Kalender, Wochenend-Event). */
export function eventsAt(now, env = ENV) {
  const md = env.dayKey(now).slice(5);
  const list = EVENTS.filter((e) => (e.from <= e.to ? md >= e.from && md <= e.to : md >= e.from || md <= e.to));
  if (WEEKEND_EVENT.days.includes(env.weekday(now))) list.push(WEEKEND_EVENT);
  return list;
}

export function multipliers(now, env = ENV) {
  const m = { xp: 1, shards: 1, bond: 1 };
  for (const e of eventsAt(now, env)) for (const [k, v] of Object.entries(e.mult)) m[k] *= v;
  return m;
}

/** Pfleger-Rang aus der Gesamterfahrung. Jenseits der Tabelle: alle 1000 Punkte eine Stufe. */
export function rankOf(xp = 0) {
  const last = RANKS[RANKS.length - 1];
  let level = 1;
  for (let i = 1; i < RANKS.length; i++) if (xp >= RANKS[i]) level = i + 1;
  if (xp >= last + 1000) level = RANKS.length + Math.floor((xp - last) / 1000);
  const lo = level <= RANKS.length ? RANKS[level - 1] : last + (level - RANKS.length) * 1000;
  const hi = level < RANKS.length ? RANKS[level] : last + (level - RANKS.length + 1) * 1000;
  return {
    level,
    name: RANK_NAMES[Math.min(level, RANK_NAMES.length) - 1],
    xp, lo, hi,
    pct: Math.max(0, Math.min(100, ((xp - lo) / (hi - lo)) * 100)),
  };
}

/**
 * Verbucht Erfahrung, Splitter, Bindung und Gegenstände (mit Event-Boni).
 * Ein Rangaufstieg gibt zusätzlich Splitter.
 */
export function grant(doc, g, now, env = ENV) {
  const pl = doc.player;
  const notes = [];
  const given = {};
  if (!pl) return { given, notes };
  const mult = multipliers(now, env);
  if (g.xp) {
    const xp = Math.max(1, Math.round(g.xp * mult.xp));
    const before = rankOf(pl.xp).level;
    pl.xp += xp;
    given.xp = xp;
    const after = rankOf(pl.xp).level;
    for (let lvl = before + 1; lvl <= after; lvl++) {
      pl.shards += RANK_BONUS * lvl;
      pl.earned += RANK_BONUS * lvl;
      notes.push({ type: 'rank', level: lvl, shards: RANK_BONUS * lvl });
    }
  }
  if (g.shards) {
    const shards = Math.max(1, Math.round(g.shards * mult.shards));
    pl.shards += shards;
    pl.earned += shards;
    given.shards = shards;
  }
  const p = doc.pet;
  if (g.bond && p && !p.end) {
    const bond = Math.max(1, Math.round(g.bond * mult.bond));
    const before = E.bondLevel(p);
    p.bond = (p.bond || 0) + bond;
    given.bond = bond;
    const after = E.bondLevel(p);
    if (after > before) notes.push({ type: 'bond', level: after });
  }
  if (g.items?.length) {
    given.items = [];
    for (const [id, n] of g.items) {
      addItem(pl, id, n);
      const same = given.items.find((x) => x[0] === id);
      if (same) same[1] += n; else given.items.push([id, n]);
    }
  }
  return { given, notes };
}

/* -------------------------------------------------------------------------- */
/* Tagesaufgaben                                                                */
/* -------------------------------------------------------------------------- */

function questFits(doc, id) {
  const p = doc.pet;
  const alive = Boolean(p && !p.end);
  switch (QUESTS[id].when) {
    case 'always': return true;
    case 'pet': return alive;
    case 'nopet': return !alive;
    case 'grown': return alive && !['egg', 'baby'].includes(p.stage);
    case 'young': return alive && ['egg', 'baby', 'juvenile', 'adolescent'].includes(p.stage);
    case 'trainable': return alive && !['egg', 'baby'].includes(p.stage) && Object.keys(TRICKS).some((t) => E.trickState(p, t) === 'training');
    case 'trick': return alive && Object.keys(TRICKS).some((t) => E.learned(p, t));
    default: return false;
  }
}

function pick(pool, seed, n, salt) {
  return pool.splice(Math.floor(E.rand(seed, n, salt) * pool.length), 1)[0];
}

/** Neuer Tag: drei neue Aufgaben, die zum aktuellen Tier passen. */
export function rollDay(doc, now, env = ENV) {
  const pl = doc.player;
  const today = env.dayKey(now);
  if (!pl || pl.day === today) return false;
  const pool = Object.keys(QUESTS).filter((id) => questFits(doc, id));
  const dn = dayNumber(today);
  const quests = [];
  for (let i = 0; quests.length < QUEST_COUNT && pool.length; i++) quests.push(pick(pool, pl.seed, dn * 16 + i, SALT.quest));
  pl.day = today;
  pl.quests = quests.map((id) => ({ id, n: 0, goal: QUESTS[id].goal, done: false }));
  pl.bonus = false;
  pl.swapped = false;
  return true;
}

/** Einmal am Tag darf eine offene Aufgabe gegen eine andere getauscht werden. */
export function swapQuest(doc, index, now, env = ENV) {
  const pl = doc.player;
  rollDay(doc, now, env);
  const q = pl?.quests[index];
  if (!q || q.done) return fail('quest');
  if (pl.swapped) return fail('swapped');
  const taken = pl.quests.map((x) => x.id);
  const pool = Object.keys(QUESTS).filter((id) => !taken.includes(id) && questFits(doc, id));
  if (!pool.length) return fail('quest');
  const id = pick(pool, pl.seed, dayNumber(pl.day) * 16 + index, SALT.swap);
  pl.quests[index] = { id, n: 0, goal: QUESTS[id].goal, done: false };
  pl.swapped = true;
  return { ok: true, code: 'swapped', id };
}

/** Zählt Fortschritt für Aufgaben und Erfolge. Erledigte Aufgaben zahlen sofort aus. */
export function gain(doc, key, amount, now, env = ENV) {
  const pl = doc.player;
  if (!pl) return [];
  pl.tally[key] = (pl.tally[key] || 0) + amount;
  rollDay(doc, now, env);
  const notes = [];
  for (const q of pl.quests) {
    if (q.done || q.id !== key) continue;
    q.n = Math.min(q.goal, q.n + amount);
    if (q.n < q.goal) continue;
    q.done = true;
    pl.tally.quest = (pl.tally.quest || 0) + 1;
    const r = grant(doc, { shards: QUESTS[q.id].shards, xp: QUESTS[q.id].xp }, now, env);
    notes.push({ type: 'quest', id: q.id, ...r.given }, ...r.notes);
  }
  if (!pl.bonus && pl.quests.length && pl.quests.every((q) => q.done)) {
    pl.bonus = true;
    const r = grant(doc, QUEST_BONUS, now, env);
    notes.push({ type: 'bonus', ...r.given }, ...r.notes);
  }
  return notes;
}

/* -------------------------------------------------------------------------- */
/* Versorgungskiste und Serie                                                    */
/* -------------------------------------------------------------------------- */

/** Ist heute eine Kiste offen? Auch wer mit dem Gerät eine Zeitzone zurückreist, bekommt keine zweite. */
export function dropReady(doc, now, env = ENV) {
  const pl = doc?.player;
  if (!pl) return false;
  return !pl.lastDay || dayNumber(env.dayKey(now)) > dayNumber(pl.lastDay);
}

/**
 * Wie steht die Serie heute? `next` ist der Tag in der 7er-Runde, den die
 * nächste Kiste hätte; `atRisk`, wenn gestern keine Kiste geöffnet wurde.
 */
export function streakInfo(doc, now, env = ENV) {
  const pl = doc?.player;
  if (!pl) return { streak: 0, best: 0, next: 1, claimed: false, atRisk: false, freeze: 0 };
  const today = env.dayKey(now);
  const gap = pl.lastDay ? dayNumber(today) - dayNumber(pl.lastDay) : Infinity;
  const freeze = pl.inv.freeze || 0;
  const claimed = gap <= 0;
  const keeps = gap === 1 || (gap === 2 && freeze > 0);
  const current = claimed || keeps ? pl.streak : 0;
  const next = claimed ? ((pl.streak - 1) % DROPS.length) + 1 : (current % DROPS.length) + 1;
  return { streak: current, best: pl.best, next, claimed, atRisk: gap === 2, lost: !claimed && !keeps && pl.streak > 0, freeze };
}

/** Öffnet die heutige Kiste: Serie weiterzählen, Beute verbuchen. */
export function openDrop(doc, now, env = ENV) {
  const pl = doc.player;
  if (!pl) return fail('no_player');
  const today = env.dayKey(now);
  const gap = pl.lastDay ? dayNumber(today) - dayNumber(pl.lastDay) : Infinity;
  if (gap <= 0) return fail('claimed');
  let saved = false;
  let lost = 0;
  if (gap === 1) pl.streak += 1;
  else if (gap === 2 && (pl.inv.freeze || 0) > 0) {
    pl.inv.freeze -= 1;
    pl.streak += 1;
    saved = true;
  } else {
    lost = pl.streak;
    pl.streak = 1;
  }
  pl.best = Math.max(pl.best, pl.streak);
  pl.lastDay = today;
  const tier = (pl.streak - 1) % DROPS.length;
  const d = DROPS[tier];
  const dn = dayNumber(today);
  const items = d.items.map(([id, n]) => [id, n]);
  if (E.rand(pl.seed, dn, SALT.drop) < 0.35) items.push([DROP_BONUS[Math.floor(E.rand(pl.seed, dn, SALT.dropPick) * DROP_BONUS.length)], 1]);
  const r = grant(doc, { shards: d.shards, xp: d.xp, items }, now, env);
  const notes = [...r.notes, ...gain(doc, 'drop', 1, now, env), ...checkAchievements(doc, now, env)];
  return { ok: true, code: 'drop', tier, color: d.color, streak: pl.streak, saved, lost, given: r.given, notes };
}

/* -------------------------------------------------------------------------- */
/* Händler, Einrichtung, Gehäuse                                                 */
/* -------------------------------------------------------------------------- */

function productOf(id) {
  if (ITEMS[id]) return { type: 'item', def: ITEMS[id] };
  if (DECOR[id]) return { type: 'decor', def: DECOR[id] };
  if (id?.startsWith('shell_') && SHELLS[id.slice(6)]) return { type: 'shell', def: SHELLS[id.slice(6)] };
  return null;
}

/** Warum etwas (noch) nicht zu haben ist: 'event', 'rank', 'ach' oder null. */
export function lockReason(doc, id, now, env = ENV) {
  const pr = productOf(id);
  if (!pr) return 'unknown';
  const { def } = pr;
  if (def.ach) return doc.player?.owned?.includes(id) ? null : 'ach';
  if (def.event && !eventsAt(now, env).some((e) => e.id === def.event)) return 'event';
  if (def.rank && rankOf(doc.player?.xp).level < def.rank) return 'rank';
  return null;
}

/** Angebot des Tages: ein Vorrat zum halben Preis, jeden Tag ein anderer (Serienschutz nie). */
export const DEAL_OFF = 0.5;
const DEAL_POOL = Object.keys(ITEMS).filter((id) => id !== 'freeze' && ITEMS[id].price >= 15);

export function dailyDeal(doc, now, env = ENV) {
  const dn = dayNumber(env.dayKey(now));
  const id = DEAL_POOL[Math.floor(E.rand(doc?.player?.seed || 0, dn, SALT.deal) * DEAL_POOL.length)];
  return { id, price: Math.max(1, Math.round(ITEMS[id].price * DEAL_OFF)), was: ITEMS[id].price };
}

/** Preis heute (mit Tagesangebot) oder null, wenn es das nicht zu kaufen gibt. */
export function priceOf(doc, id, now, env = ENV) {
  const pr = productOf(id);
  if (!pr || pr.def.price == null) return null;
  if (pr.type === 'item') {
    const deal = dailyDeal(doc, now, env);
    if (deal.id === id) return deal.price;
  }
  return pr.def.price;
}

export function owns(doc, id) {
  if (id === 'shell_tek') return true;
  return Boolean(doc.player?.owned?.includes(id));
}

export function buy(doc, id, now, env = ENV) {
  const pl = doc.player;
  const pr = productOf(id);
  if (!pl || !pr || pr.def.price == null) return fail('unknown');
  if (pr.type !== 'item' && owns(doc, id)) return fail('owned');
  const lock = lockReason(doc, id, now, env);
  if (lock) return fail(lock);
  const price = priceOf(doc, id, now, env);
  if (pl.shards < price) return fail('shards');
  pl.shards -= price;
  if (pr.type === 'item') addItem(pl, id, 1);
  else pl.owned.push(id);
  // Neue Einrichtung gleich aufstellen, wenn der Platz noch frei ist.
  if (pr.type === 'decor' && !pl.deco[pr.def.slot]) pl.deco[pr.def.slot] = id;
  const notes = [...gain(doc, 'buy', 1, now, env), ...checkAchievements(doc, now, env)];
  return { ok: true, code: 'bought', id, type: pr.type, price, notes };
}

export function placeDecor(doc, slot, id) {
  const pl = doc.player;
  if (!pl || !SLOTS.includes(slot)) return fail('slot');
  if (id == null) {
    pl.deco[slot] = null;
    return { ok: true, code: 'placed' };
  }
  if (DECOR[id]?.slot !== slot) return fail('slot');
  if (!owns(doc, id)) return fail('locked');
  pl.deco[slot] = id;
  return { ok: true, code: 'placed' };
}

export function setShell(doc, shell) {
  if (!SHELLS[shell]) return fail('unknown');
  if (!owns(doc, 'shell_' + shell)) return fail('locked');
  doc.settings.shell = shell;
  return { ok: true, code: 'shell' };
}

/** Dauerwirkung der aufgestellten Einrichtung für die Engine. */
export function decorMods(doc) {
  const m = { happy: 1, hunger: 1, energy: 1, sick: 1, sleep: 0, night: false };
  for (const id of Object.values(doc?.player?.deco || {})) {
    const d = DECOR[id];
    if (!d) continue;
    for (const k of ['happy', 'hunger', 'energy', 'sick']) if (d[k]) m[k] *= d[k];
    if (d.sleep) m.sleep += d.sleep;
    if (d.night) m.night = true;
  }
  return m;
}

/* -------------------------------------------------------------------------- */
/* Erfolge                                                                       */
/* -------------------------------------------------------------------------- */

function metric(doc, key) {
  const pl = doc.player;
  const dex = Object.values(doc.dex || {});
  switch (key) {
    case 'best': return pl.best;
    case 'raised': return dex.filter((e) => e.a > 0).length;
    case 'alpha': return dex.some((e) => e.v.includes('alpha')) ? 1 : 0;
    case 'tek': return dex.some((e) => e.v.includes('tek')) ? 1 : 0;
    case 'rank': return rankOf(pl.xp).level;
    case 'gen': return Math.max(pl.tally.gen || 1, doc.pet?.gen || 1);
    default: return pl.tally[key] || 0;
  }
}

export function achievementList(doc) {
  const pl = doc.player;
  return ACHIEVEMENTS.map((a) => ({ ...a, value: Math.min(a.goal, metric(doc, a.metric)), at: pl?.ach?.[a.id] || null }));
}

export function checkAchievements(doc, now, env = ENV) {
  const pl = doc.player;
  if (!pl) return [];
  const notes = [];
  for (const a of ACHIEVEMENTS) {
    if (pl.ach[a.id] || metric(doc, a.metric) < a.goal) continue;
    pl.ach[a.id] = now;
    if (a.decor && !pl.owned.includes(a.decor)) pl.owned.push(a.decor);
    const r = grant(doc, { shards: a.shards, items: a.item ? [a.item] : [] }, now, env);
    notes.push({ type: 'ach', id: a.id, ...r.given }, ...r.notes);
  }
  return notes;
}

/* -------------------------------------------------------------------------- */
/* Zeit vergeht                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Wie E.advanceDoc, dazu Tageswechsel (neue Aufgaben), Belohnung fürs Schlüpfen
 * und Erfolge. Liefert die Hinweise (`notes`) für die Oberfläche.
 */
export function advanceGame(doc, now, env = ENV) {
  const before = doc.pet ? { id: doc.pet.id, stage: doc.pet.stage } : null;
  E.advanceDoc(doc, now, { ...env, mods: decorMods(doc) });
  const pl = doc.player;
  if (!pl) return [];
  const notes = [];
  if (rollDay(doc, now, env)) notes.push({ type: 'day' });
  const p = doc.pet;
  if (p && before?.id === p.id && before.stage === 'egg' && p.stage !== 'egg') {
    const r = grant(doc, REWARDS.hatch, now, env);
    notes.push(...r.notes, ...gain(doc, 'hatch', 1, now, env));
  }
  if (p?.m?.imprint >= 100) pl.tally.imprint100 = 1;
  if (p?.gen) pl.tally.gen = Math.max(pl.tally.gen || 1, p.gen);
  notes.push(...checkAchievements(doc, now, env));
  return notes;
}

/* -------------------------------------------------------------------------- */
/* Aktionen mit Belohnung                                                        */
/* -------------------------------------------------------------------------- */

function settle(doc, res, { reward = null, keys = [] }, now, env) {
  if (!res.ok) return res;
  const notes = [];
  const given = {};
  const add = (r) => {
    notes.push(...r.notes);
    for (const [k, v] of Object.entries(r.given)) given[k] = k === 'items' ? [...(given.items || []), ...v] : (given[k] || 0) + v;
  };
  if (reward) add(grant(doc, reward, now, env));
  if (res.imprint > 0) {
    add(grant(doc, REWARDS.imprint, now, env));
    keys = [...keys, ['imprint', 1]];
  }
  for (const [k, n] of keys) notes.push(...gain(doc, k, n, now, env));
  notes.push(...checkAchievements(doc, now, env));
  return { ...res, given, notes };
}

const pet = (doc) => doc.pet;

/** Füttern mit Grundfutter ('meal') oder einem Gegenstand aus dem Beutel. */
export function feedItem(doc, id, now, env = ENV) {
  const pl = doc.player;
  if (id !== 'meal') {
    if (!ITEMS[id]) return fail('food');
    if ((pl?.inv?.[id] || 0) <= 0) return fail('none');
  }
  const res = E.feed(pet(doc), id, now);
  if (!res.ok) return res;
  if (id !== 'meal') pl.inv[id] -= 1;
  const def = E.foodDef(id);
  if (def.kind === 'kibble') {
    const r = REWARDS.kibble;
    return settle(doc, res, { reward: { xp: r.xp + def.tier, bond: r.bond + def.tier }, keys: [['feed', 1], ['kibble', 1]] }, now, env);
  }
  if (def.kind === 'meal') return settle(doc, res, { reward: REWARDS.meal, keys: [['feed', 1]] }, now, env);
  return settle(doc, res, { reward: REWARDS[def.kind] || REWARDS.snack, keys: [[def.kind, 1]] }, now, env);
}

export function play(doc, result, now, env = ENV) {
  const res = E.play(pet(doc), result, now);
  const won = res.code === 'won';
  const reward = { xp: REWARDS.play.xp + (won ? REWARDS.win.xp : 0), bond: REWARDS.play.bond + (won ? REWARDS.win.bond : 0) };
  return settle(doc, res, { reward, keys: won ? [['play', 1], ['win', 1]] : [['play', 1]] }, now, env);
}

export function cuddle(doc, now, env = ENV) {
  return settle(doc, E.cuddle(pet(doc), now), { reward: REWARDS.cuddle, keys: [['cuddle', 1]] }, now, env);
}

export function walk(doc, now, env = ENV) {
  return settle(doc, E.walk(pet(doc), now), { reward: REWARDS.walk, keys: [['walk', 1]] }, now, env);
}

export function clean(doc, now, env = ENV) {
  return settle(doc, E.clean(pet(doc), now), { reward: REWARDS.clean, keys: [['clean', 1]] }, now, env);
}

export function groom(doc, now, env = ENV) {
  return settle(doc, E.groom(pet(doc), now), { reward: REWARDS.groom, keys: [['groom', 1]] }, now, env);
}

/** Medizin (unbegrenzt, manchmal zwei Dosen) oder Heiltrank aus dem Beutel (heilt sofort). */
export function cure(doc, strong, now, env = ENV) {
  const pl = doc.player;
  if (strong && (pl?.inv?.brew || 0) <= 0) return fail('none');
  const res = E.medicine(pet(doc), now, strong);
  if (!res.ok) return res;
  if (strong) pl.inv.brew -= 1;
  return settle(doc, res, { reward: res.code === 'cured' ? REWARDS.cured : REWARDS.dose, keys: [['cure', 1]] }, now, env);
}

export function lights(doc, now) {
  return E.lights(pet(doc), now);
}

export function tuck(doc, now, env = ENV) {
  const res = E.tuck(pet(doc), now);
  return settle(doc, res, { reward: res.code === 'tucked' ? REWARDS.tucked : null, keys: res.code === 'tucked' ? [['tuck', 1]] : [] }, now, env);
}

export function scold(doc, now, env = ENV) {
  const res = E.scold(pet(doc), now);
  return settle(doc, res, { reward: res.code === 'disciplined' ? REWARDS.disciplined : null }, now, env);
}

export function toy(doc, now, env = ENV) {
  if (!doc.player?.deco?.toy) return fail('no_toy');
  return settle(doc, E.toyPlay(pet(doc), now), { reward: { xp: 2, bond: 3 } }, now, env);
}

export function train(doc, trick, success, now, env = ENV) {
  const res = E.train(pet(doc), trick, success, now);
  if (!res.ok || res.code === 'train_fail') return res;
  const learnedNow = res.code === 'trick_learned';
  if (learnedNow) doc.player.tally.learned = (doc.player.tally.learned || 0) + 1;
  return settle(doc, res, { reward: learnedNow ? REWARDS.trick_learned : REWARDS.trained, keys: [['train', 1]] }, now, env);
}

export function perform(doc, trick, now, env = ENV) {
  const res = E.perform(pet(doc), trick, now, env.dayKey(now));
  if (res.code !== 'performed') return res;
  return settle(doc, res, { reward: REWARDS.performed, keys: [['trick', 1]] }, now, env);
}

/** Expedition in eine Zone – höhere Zonen brauchen einen höheren Pfleger-Rang. */
export function explore(doc, zone, now) {
  const z = ZONES[zone];
  if (!z) return fail('zone');
  if (rankOf(doc.player?.xp).level < z.rank) return fail('rank');
  return E.explore(pet(doc), zone, now);
}

export function recall(doc, now) {
  return E.recall(pet(doc), now);
}

/** Beute einer Expedition – aus Seed und Startzeit bestimmt. */
export function expeditionLoot(p) {
  const z = ZONES[p?.exp?.zone];
  if (!z) return null;
  const n = Math.floor(p.exp.at / E.MINUTE);
  const shards = z.shards[0] + Math.floor(E.rand(p.seed, n, SALT.lootShards) * (z.shards[1] - z.shards[0] + 1));
  const items = [];
  const count = E.rand(p.seed, n, SALT.loot) < 0.5 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const id = z.loot[Math.floor(E.rand(p.seed, n + i * 7, SALT.lootPick) * z.loot.length)];
    const same = items.find((x) => x[0] === id);
    if (same) same[1] += 1; else items.push([id, 1]);
  }
  return { shards, items, xp: z.xp, bond: Math.round(z.xp / 2) };
}

export function claimLoot(doc, now, env = ENV) {
  const p = pet(doc);
  if (!p?.exp?.done) return fail('no_loot');
  const loot = expeditionLoot(p);
  const zone = p.exp.zone;
  p.exp = null;
  p.stats.expeditions = (p.stats.expeditions || 0) + 1;
  return settle(doc, { ok: true, code: 'loot', zone }, { reward: loot, keys: [['expedition', 1]] }, now, env);
}

export function warm(doc, now) {
  return E.warm(pet(doc), now);
}

export function startEgg(doc, opts, env = ENV) {
  const res = E.startEgg(doc, opts);
  return settle(doc, res, { reward: REWARDS.egg, keys: [['egg', 1]] }, opts.now, env);
}

export function breed(doc, now, seed, env = ENV) {
  const res = E.breed(doc, now, seed);
  if (res.ok && doc.player) doc.player.tally.gen = Math.max(doc.player.tally.gen || 1, doc.pet.gen);
  return settle(doc, res, {}, now, env);
}

/* -------------------------------------------------------------------------- */
/* Für die Oberfläche                                                            */
/* -------------------------------------------------------------------------- */

/** Rang-Freischaltungen einer Stufe (für die Rang-Karte und Hinweise). */
export function unlocksAt(level) {
  const out = [];
  for (const [id, s] of Object.entries(SHELLS)) if (s.rank === level) out.push('shell_' + id);
  for (const [id, d] of Object.entries(DECOR)) if (d.rank === level && d.price) out.push(id);
  for (const [id, z] of Object.entries(ZONES)) if (z.rank === level) out.push('zone_' + id);
  return out;
}

export { SLOTS };
