import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/js/tamagotchi/engine.js';
import * as P from '../public/js/tamagotchi/progress.js';
import { DROPS, ITEMS, QUESTS, TRICK_SESSIONS, ZONES } from '../public/js/tamagotchi/catalog.js';

// Feste Zeitzone (UTC), damit Tageswechsel und Schlafenszeiten überall gleich sind.
const env = {
  dayKey: (ms) => new Date(ms).toISOString().slice(0, 10),
  weekday: (ms) => new Date(ms).getUTCDay(),
  nextDay: (ms) => (Math.floor(ms / E.DAY) + 1) * E.DAY,
  minuteOfDay: (ms) => Math.floor((ms % E.DAY) / E.MINUTE),
};
const MON = Date.UTC(2026, 8, 21, 9); // Montag, kein Event
const day = (n, h = 9) => MON + n * E.DAY + (h - 9) * E.HOUR;

function withPet(species = 'rex', { mode = 'relaxed', at = MON } = {}) {
  const doc = P.newGame(11);
  P.startEgg(doc, { species, name: 'Rexi', now: at, mode, seed: 7 }, env);
  const now = at + E.EGG_TIME + E.MINUTE;
  P.advanceGame(doc, now, env);
  return { doc, p: doc.pet, now };
}

test('Versorgungskiste: Serie zählt Tage, 7er-Runde, Lücke setzt zurück, Serien-Schutz rettet einen Tag', () => {
  const doc = P.newGame(3);
  const colors = [];
  for (let d = 0; d < 8; d++) {
    const r = P.openDrop(doc, day(d), env);
    assert.equal(r.ok, true);
    assert.equal(r.streak, d + 1);
    colors.push(r.color);
  }
  assert.deepEqual(colors, [...DROPS.map((d) => d.color), 'white']);
  assert.equal(P.openDrop(doc, day(7, 22), env).code, 'claimed', 'nur eine Kiste pro Tag');
  assert.equal(P.openDrop(doc, day(6), env).code, 'claimed', 'zurückgestellte Uhr bringt nichts');
  assert.equal(P.dropReady(doc, day(6), env), false, '… und zeigt auch keine Kiste an');
  assert.equal(P.dropReady(doc, day(8), env), true);
  assert.ok((doc.player.inv.freeze || 0) >= 1, 'Tag 7 bringt einen Serien-Schutz');

  // Einen Tag verpasst: Schutz wird verbraucht, Serie läuft weiter
  const freeze = doc.player.inv.freeze;
  let r = P.openDrop(doc, day(9), env);
  assert.equal(r.saved, true);
  assert.equal(r.streak, 9);
  assert.equal(doc.player.inv.freeze, freeze - 1);
  // Zwei Tage verpasst: von vorn
  doc.player.inv.freeze = 5;
  r = P.openDrop(doc, day(12), env);
  assert.equal(r.streak, 1);
  assert.equal(r.lost, 9);
  assert.equal(doc.player.best, 9);
});

test('Serien-Anzeige: gefährdet, verloren, schon geholt', () => {
  const doc = P.newGame(3);
  assert.deepEqual(P.streakInfo(doc, day(0), env).next, 1);
  P.openDrop(doc, day(0), env);
  assert.equal(P.streakInfo(doc, day(0), env).claimed, true);
  assert.equal(P.streakInfo(doc, day(1), env).next, 2);
  assert.equal(P.streakInfo(doc, day(2), env).atRisk, true);
  assert.equal(P.streakInfo(doc, day(3), env).lost, true);
  assert.equal(P.dropReady(doc, day(0), env), false);
  assert.equal(P.dropReady(doc, day(1), env), true);
});

test('Tagesaufgaben: passend zum Tier, gleich für denselben Tag, zahlen aus, Bonus bei allen dreien', () => {
  const a = withPet();
  const b = withPet();
  assert.deepEqual(a.doc.player.quests.map((q) => q.id), b.doc.player.quests.map((q) => q.id), 'deterministisch');
  for (const q of a.doc.player.quests) assert.ok(QUESTS[q.id], q.id);
  // Ohne Tier gibt es nur passende Aufgaben
  const empty = P.newGame(4);
  P.rollDay(empty, MON, env);
  assert.ok(empty.player.quests.every((q) => ['always', 'nopet'].includes(QUESTS[q.id].when)));

  // Aufgaben erfüllen: wir setzen gezielt drei bekannte Aufgaben
  const { doc } = a;
  doc.player.quests = [{ id: 'feed', n: 0, goal: 3, done: false }, { id: 'cuddle', n: 0, goal: 3, done: false }, { id: 'drop', n: 0, goal: 1, done: false }];
  const before = doc.player.shards;
  const notes = [];
  for (let i = 0; i < 3; i++) notes.push(...P.gain(doc, 'feed', 1, a.now, env));
  assert.ok(notes.some((n) => n.type === 'quest' && n.id === 'feed'));
  assert.ok(doc.player.shards > before);
  P.gain(doc, 'cuddle', 3, a.now, env);
  const last = P.gain(doc, 'drop', 1, a.now, env);
  assert.ok(last.some((n) => n.type === 'bonus'), 'Bonus für alle drei');
  assert.equal(doc.player.bonus, true);
  assert.equal(P.gain(doc, 'drop', 1, a.now, env).filter((n) => n.type === 'bonus').length, 0, 'Bonus nur einmal');
});

test('Aufgabe tauschen geht einmal am Tag, neuer Tag bringt neue Aufgaben', () => {
  const { doc, now } = withPet();
  const first = doc.player.quests.map((q) => q.id);
  const r = P.swapQuest(doc, 0, now, env);
  assert.equal(r.ok, true);
  assert.notEqual(doc.player.quests[0].id, first[0]);
  assert.equal(P.swapQuest(doc, 1, now, env).code, 'swapped');
  P.advanceGame(doc, now + E.DAY, env);
  assert.equal(doc.player.day, env.dayKey(now + E.DAY));
  assert.equal(doc.player.swapped, false);
  assert.ok(doc.player.quests.every((q) => !q.done && q.n === 0));
});

test('Rang: Erfahrung, Aufstieg mit Splitter-Bonus, doppelte Erfahrung am Wochenende', () => {
  assert.equal(P.rankOf(0).level, 1);
  assert.equal(P.rankOf(60).level, 2);
  assert.equal(P.rankOf(5600).level, 15);
  assert.equal(P.rankOf(7600).level, 17, 'jenseits der Tabelle alle 1000 Punkte');
  const doc = P.newGame(1);
  const r = P.grant(doc, { xp: 70 }, MON, env);
  assert.equal(doc.player.xp, 70);
  assert.ok(r.notes.some((n) => n.type === 'rank' && n.level === 2));
  const sat = Date.UTC(2026, 8, 26, 12); // Samstag: Evolution-Event
  assert.deepEqual(P.eventsAt(sat, env).map((e) => e.id), ['evolution']);
  assert.equal(P.grant(doc, { xp: 10 }, sat, env).given.xp, 20);
  assert.deepEqual(P.eventsAt(Date.UTC(2026, 11, 30, 12), env).map((e) => e.id), ['winter'], 'Winter-Event über den Jahreswechsel');
});

test('Händler: kaufen, Rang- und Event-Sperre, Einrichtung wird aufgestellt, Gehäuse wählbar', () => {
  const doc = P.newGame(1);
  doc.player.shards = 1000;
  assert.equal(P.buy(doc, 'bed_fur', MON, env).code, 'rank');
  assert.equal(P.buy(doc, 'ev_pumpkin', MON, env).code, 'event');
  assert.equal(P.buy(doc, 'toy_ball', MON, env).code, 'bought');
  assert.equal(doc.player.deco.toy, 'toy_ball');
  assert.equal(P.buy(doc, 'toy_ball', MON, env).code, 'owned');
  assert.equal(P.buy(doc, 'kibble_superior', MON, env).code, 'bought');
  assert.equal(P.itemCount(doc, 'kibble_superior'), 1);
  assert.equal(P.setShell(doc, 'bronze').code, 'locked');
  doc.player.xp = 200;
  assert.equal(P.buy(doc, 'shell_bronze', MON, env).code, 'bought');
  assert.equal(P.setShell(doc, 'bronze').ok, true);
  assert.equal(doc.settings.shell, 'bronze');
  assert.equal(P.buy(doc, 'trophy_alpha', MON, env).code, 'unknown', 'Trophäen gibt es nur über Erfolge');
  doc.player.shards = 5;
  assert.equal(P.buy(doc, 'honey', MON, env).code, 'shards');
  assert.equal(P.placeDecor(doc, 'toy', null).ok, true);
  assert.equal(P.placeDecor(doc, 'bed', 'toy_ball').code, 'slot');
});

test('Tagesangebot: jeden Tag ein anderer Vorrat zum halben Preis', () => {
  const doc = P.newGame(1);
  const deals = new Set();
  for (let d = 0; d < 14; d++) {
    const deal = P.dailyDeal(doc, day(d), env);
    assert.notEqual(deal.id, 'freeze', 'der Serienschutz ist nie im Angebot');
    assert.equal(deal.price, Math.round(ITEMS[deal.id].price / 2));
    assert.equal(P.priceOf(doc, deal.id, day(d), env), deal.price);
    deals.add(deal.id);
  }
  assert.ok(deals.size >= 3, 'das Angebot wechselt');
  const deal = P.dailyDeal(doc, MON, env);
  doc.player.shards = deal.price;
  const r = P.buy(doc, deal.id, MON, env);
  assert.equal(r.code, 'bought', 'genau passend reicht');
  assert.equal(r.price, deal.price);
  assert.equal(P.priceOf(doc, 'toy_ball', MON, env), 60, 'Einrichtung kostet immer den vollen Preis');
});

test('Schlafqualität: Licht aus → erholt, zugedeckt → traumhaft, Licht an → unruhig', () => {
  const night = (fn, mode = 'classic') => {
    const { doc, p } = withPet('rex', { mode, at: Date.UTC(2026, 8, 21, 9) });
    P.advanceGame(doc, Date.UTC(2026, 8, 21, 20, 0), env);
    p.stage = 'adult';
    p.variant = 'loyal';
    p.personality = 'robust'; // feste Schlafenszeit 23–8 Uhr
    Object.assign(p.m, { hunger: 100, happy: 100, energy: 60, health: 100 });
    p.stageAt = Date.UTC(2026, 8, 21, 20, 0);
    p.span = 7 * E.DAY;
    P.advanceGame(doc, Date.UTC(2026, 8, 21, 23, 5), env);
    assert.equal(p.asleep, true);
    fn(doc, Date.UTC(2026, 8, 21, 23, 6));
    P.advanceGame(doc, Date.UTC(2026, 8, 22, 8, 5), env);
    assert.equal(p.asleep, false);
    return p;
  };
  const dark = night((doc, t) => P.lights(doc, t));
  assert.ok(dark.buffs.rested > 0 && !dark.buffs.dreamy);
  const tucked = night((doc, t) => assert.equal(P.tuck(doc, t).code, 'tucked'));
  assert.ok(tucked.buffs.dreamy > 0);
  const lit = night(() => {});
  assert.ok(lit.buffs.restless > 0, 'klassisch ohne Licht aus: unruhige Nacht');
  const lightsMistake = (p) => p.log.some((l) => l.k === 'mistake' && l.v === 'lights');
  assert.equal(lightsMistake(lit), true);
  // Nachtlicht im Gehege schaltet auch klassisch von selbst ab
  const lamp = night((doc) => { doc.player.owned.push('light_torch'); doc.player.deco.light = 'light_torch'; });
  assert.ok(lamp.buffs.rested > 0);
  assert.equal(lightsMistake(lamp), false, 'kein Licht-Pflegefehler dank Nachtlicht');
});

test('Hygiene: sinkt ohne Fellpflege, Baden hilft und gibt Glanz', () => {
  const { doc, p, now } = withPet();
  assert.equal(E.hygiene(p, now), 100);
  const later = now + 30 * E.HOUR;
  assert.ok(E.hygiene(p, later) < 60, 'nach 30 Stunden ohne Bad');
  const r = P.groom(doc, later, env);
  assert.equal(r.code, 'groom');
  assert.equal(E.hygiene(p, later), 100);
  assert.ok(p.buffs.shiny > later);
  assert.equal(P.groom(doc, later + E.HOUR, env).code, 'cooldown');
});

test('Futter: Kibble aus dem Beutel, erfüllt Kibble-Wünsche, leerer Beutel', () => {
  const { doc, p, now } = withPet();
  p.m.hunger = 20;
  p.request = { type: 'kibble', at: now, until: now + E.HOUR };
  const count = P.itemCount(doc, 'kibble_basic');
  const r = P.feedItem(doc, 'kibble_basic', now, env);
  assert.equal(r.code, 'kibble');
  assert.ok(r.imprint > 0, 'Kibble-Wunsch erfüllt');
  assert.equal(P.itemCount(doc, 'kibble_basic'), count - 1);
  assert.equal(p.m.hunger, 50);
  assert.equal(P.feedItem(doc, 'kibble_extraordinary', now, env).code, 'none');
  p.m.energy = 30;
  doc.player.inv.stimberry = 1;
  assert.equal(P.feedItem(doc, 'stimberry', now, env).code, 'boost');
  assert.equal(p.m.energy, 65);
});

test('Tricks: Bindung schaltet frei, drei Lektionen, Vorführen belohnt einmal am Tag', () => {
  const { doc, p, now } = withPet();
  p.stage = 'juvenile';
  assert.equal(P.train(doc, 'sit', true, now, env).code, 'bond');
  p.bond = 30; // Bindung 2
  let t = now;
  for (let i = 0; i < TRICK_SESSIONS; i++) {
    t += 11 * E.MINUTE;
    p.m.energy = 100;
    p.asleep = false;
    const r = P.train(doc, 'sit', true, t, env);
    assert.equal(r.code, i === TRICK_SESSIONS - 1 ? 'trick_learned' : 'trained');
  }
  assert.equal(E.learned(p, 'sit'), true);
  assert.equal(doc.player.tally.learned, 1);
  assert.equal(P.perform(doc, 'sit', t, env).code, 'performed');
  assert.equal(P.perform(doc, 'sit', t + E.MINUTE, env).code, 'performed_again');
  assert.equal(P.perform(doc, 'sit', t + E.DAY, env).code, 'performed');
  assert.equal(P.train(doc, 'sit', true, t + E.DAY, env).code, 'learned');
});

test('Expedition: unterwegs keine Pflegefehler, Rückkehr mit Beute, Rang-Sperre, Zurückrufen', () => {
  const { doc, p, now } = withPet();
  assert.equal(P.explore(doc, 'shore', now).code, 'too_young');
  p.stage = 'juvenile';
  p.stageAt = now;
  Object.assign(p.m, { hunger: 90, happy: 90, energy: 90 });
  assert.equal(P.explore(doc, 'ruins', now).code, 'rank');
  const r = P.explore(doc, 'shore', now);
  assert.equal(r.ok, true);
  assert.equal(E.mood(p, now + E.MINUTE), 'away');
  assert.equal(E.feed(p, 'meal', now + E.MINUTE).code, 'away');
  P.advanceGame(doc, now + 20 * E.MINUTE, env);
  assert.equal(p.poop, 0);
  assert.deepEqual(E.calling(p, now + 20 * E.MINUTE), []);
  P.advanceGame(doc, now + ZONES.shore.mins * E.MINUTE + E.MINUTE, env);
  assert.equal(p.exp.done, true);
  assert.ok(E.needs(p, now + 31 * E.MINUTE).includes('loot'));
  const loot = P.expeditionLoot(p);
  assert.deepEqual(loot, P.expeditionLoot(structuredClone(p)), 'Beute ist deterministisch');
  const shards = doc.player.shards;
  const c = P.claimLoot(doc, now + 32 * E.MINUTE, env);
  assert.equal(c.code, 'loot');
  assert.ok(doc.player.shards >= shards + ZONES.shore.shards[0]);
  assert.equal(p.exp, null);
  assert.equal(doc.player.tally.expedition, 1);
  // Zurückrufen: sofort da, keine Beute
  Object.assign(p.m, { hunger: 90, energy: 90 });
  p.asleep = false;
  P.explore(doc, 'shore', now + E.HOUR);
  assert.equal(P.recall(doc, now + E.HOUR + E.MINUTE).code, 'recalled');
  assert.equal(P.claimLoot(doc, now + E.HOUR + 2 * E.MINUTE, env).code, 'no_loot');
});

test('Erfolge werden einmal freigeschaltet und belohnen, Trophäen kommen ins Gehege', () => {
  const doc = P.newGame(2);
  for (let d = 0; d < 7; d++) P.openDrop(doc, day(d), env);
  const list = P.achievementList(doc);
  assert.ok(doc.player.ach.streak_3 && doc.player.ach.streak_7 && doc.player.ach.drops_7);
  assert.equal(list.find((a) => a.id === 'streak_30').value, 7);
  const shards = doc.player.shards;
  assert.deepEqual(P.checkAchievements(doc, day(7), env), [], 'kein zweites Mal');
  assert.equal(doc.player.shards, shards);
  doc.dex.rex = { h: 1, a: 1, v: ['alpha'] };
  const notes = P.checkAchievements(doc, day(7), env);
  assert.ok(notes.some((n) => n.id === 'first_alpha'));
  assert.ok(doc.player.owned.includes('trophy_alpha'));
  assert.equal(P.placeDecor(doc, 'trophy', 'trophy_alpha').ok, true);
});

test('Spielstand aus Version 1 wird ergänzt; Nachrechnen bleibt deterministisch', () => {
  const old = { v: 1, pet: null, dex: {}, hall: [], settings: { shell: 'amber', retro: false } };
  E.startEgg(old, { species: 'dodo', name: 'Alt', now: MON, seed: 9 });
  for (const k of ['bond', 'tricks', 'buffs', 'groomedAt', 'exp', 'night', 'trickDay']) delete old.pet[k];
  P.upgradeDoc(old, MON + E.HOUR);
  assert.equal(old.v, E.DOC_VERSION);
  assert.ok(old.player && old.player.owned.includes('shell_amber'), 'benutztes Gehäuse bleibt');
  assert.equal(old.pet.bond, 0);
  assert.deepEqual(old.pet.tricks, {});

  const a = withPet('raptor');
  a.doc.player.deco.toy = 'toy_ball';
  a.doc.player.owned.push('toy_ball');
  const b = structuredClone(a.doc);
  const end = a.now + 3 * E.DAY;
  P.advanceGame(a.doc, end, env);
  for (let t = a.now; t < end;) { t = Math.min(end, t + 7 * E.HOUR + 13_000); P.advanceGame(b, t, env); }
  assert.deepEqual(JSON.parse(JSON.stringify(b.pet)), JSON.parse(JSON.stringify(a.doc.pet)));
});
