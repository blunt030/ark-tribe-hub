import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../public/js/tamagotchi/engine.js';
import { SPECIES } from '../public/js/tamagotchi/species.js';
import { creatureArt } from '../public/js/tamagotchi/art.js';
import { toSvgString } from '../public/js/tamagotchi/vdom.js';

// Feste Tageszeit in UTC, damit Schlafenszeiten unabhängig von der Testmaschine sind.
const env = { minuteOfDay: (ms) => Math.floor((ms % E.DAY) / E.MINUTE) };
const at = (h, m = 0) => Date.UTC(2026, 0, 5, h, m);
const clone = (v) => JSON.parse(JSON.stringify(v));

function hatched({ mode = 'relaxed', seed = 7, start = at(9) } = {}) {
  const doc = E.newDoc();
  E.startEgg(doc, { species: 'rex', name: 'Rexi', now: start, mode, seed });
  const now = start + E.EGG_TIME + E.MINUTE;
  E.advanceDoc(doc, now, env);
  return { doc, p: doc.pet, now };
}

test('Ei schlüpft nach der Brutzeit, Wärmen beschleunigt', () => {
  const doc = E.newDoc();
  E.startEgg(doc, { species: 'rex', name: '  Rex\u0007  der   Große ', now: at(9), seed: 1 });
  const p = doc.pet;
  assert.equal(p.name, 'Rex der Große');
  assert.equal(p.stage, 'egg');
  E.advance(p, at(9, 1), env);
  assert.equal(p.stage, 'egg');
  assert.equal(E.warm(p, at(9, 1)).ok, true);
  assert.ok(p.hatchAt < at(9) + E.EGG_TIME);
  E.advance(p, at(9, 3), env);
  assert.equal(p.stage, 'baby');
  assert.equal(p.m.weight, E.BASE_WEIGHT.baby);
  assert.deepEqual(E.needs(p, at(9, 3)).filter((n) => n === 'hatch'), []);
});

test('Nachrechnen in einem Rutsch ergibt denselben Zustand wie viele Einzelschritte', () => {
  for (const mode of ['relaxed', 'classic']) {
    const { p, now } = hatched({ mode, seed: 99 });
    const a = clone(p), b = clone(p);
    const end = now + 3 * E.DAY + 7 * E.HOUR + 13 * E.MINUTE;
    E.advance(a, end, env);
    let t = now;
    let step = 0;
    while (t < end) { t = Math.min(end, t + [61_000, 17 * E.MINUTE, 3 * E.HOUR + 5_000, 29_000][step++ % 4]); E.advance(b, t, env); }
    assert.deepEqual(b, a, `Modus ${mode}`);
  }
});

test('Pflegefehler: leeres Herz 15 Minuten ignoriert zählt genau einmal, Füttern setzt zurück', () => {
  const { p, now } = hatched({ mode: 'classic' });
  p.m.hunger = 0;
  E.advance(p, now + 14 * E.MINUTE, env);
  assert.equal(p.cm, 0);
  E.advance(p, now + 16 * E.MINUTE, env);
  assert.equal(p.cm, 1);
  assert.ok(E.calling(p, now + 16 * E.MINUTE).includes('hungry'));
  E.advance(p, now + 40 * E.MINUTE, env);
  assert.equal(p.cm, 1, 'kein zweiter Fehler im selben Hungerfenster');
  assert.equal(E.feed(p, 'meal', now + 40 * E.MINUTE).ok, true);
  assert.ok(p.m.hunger > 0);
  E.advance(p, now + 41 * E.MINUTE, env);
  assert.equal(p.empty.hunger, null);
  assert.equal(p.cm, 1);
});

test('Licht: klassisch Pflegefehler nach 15 Minuten, entspannt automatisch', () => {
  // Jungtier schläft um 21 Uhr ein
  for (const mode of ['classic', 'relaxed']) {
    const { p } = hatched({ mode, start: at(15) });
    E.advance(p, at(20, 55), env);
    // Sicherstellen, dass das Tier bis zum Abend versorgt ist
    Object.assign(p.m, { hunger: 100, happy: 100 });
    p.poop = 0; p.poopSince = []; p.sick = 0;
    E.advance(p, at(21, 5), env);
    assert.equal(p.asleep, true, mode);
    if (mode === 'classic') {
      assert.ok(E.calling(p, at(21, 5)).includes('lights'));
      const before = p.cm;
      E.advance(p, at(21, 20), env);
      assert.equal(p.cm, before + 1);
    } else {
      assert.equal(p.lightsOff, true);
      assert.ok(!E.calling(p, at(21, 5)).includes('lights'));
    }
    E.advance(p, at(8, 5) + E.DAY, env);
    assert.equal(p.asleep, false, 'wacht morgens auf');
  }
});

test('Krankheit braucht die richtige Anzahl Medizin-Dosen', () => {
  const { p, now } = hatched();
  assert.equal(E.medicine(p, now).code, 'healthy');
  p.sick = 2;
  assert.equal(E.medicine(p, now).code, 'dose');
  assert.equal(E.play(p, { won: true }, now).code, 'sick');
  assert.equal(E.medicine(p, now).code, 'cured');
  assert.equal(p.sick, 0);
  assert.equal(p.stats.meds, 2);
});

test('Disziplin: Fake-Ruf schimpfen hilft, grundloses Schimpfen macht traurig', () => {
  const { p, now } = hatched();
  const happy = p.m.happy;
  assert.equal(E.scold(p, now).code, 'unfair');
  assert.equal(p.m.happy, happy - 10);
  p.misbehave = { at: now };
  assert.ok(E.calling(p, now).includes('attention'));
  assert.equal(E.scold(p, now).code, 'disciplined');
  assert.equal(p.m.discipline, 25);
  // Klassisch: Ignorierter Fake-Ruf wird zum Erziehungsfehler
  const c = hatched({ mode: 'classic' });
  c.p.stage = 'juvenile';
  c.p.misbehave = { at: c.now };
  E.advance(c.p, c.now + 20 * E.MINUTE, env);
  assert.equal(c.p.dm, 1);
});

test('Prägung: Pflegeanfrage erfüllen gibt Prägung und plant die nächste', () => {
  const { p, now } = hatched();
  p.request = { type: 'cuddle', at: now, until: now + E.HOUR };
  const res = E.cuddle(p, now + E.MINUTE);
  assert.equal(res.ok, true);
  assert.ok(res.imprint > 0);
  assert.equal(p.request, null);
  assert.equal(p.nextRequestAt, now + E.MINUTE + E.REQUEST_EVERY.baby * E.MINUTE);
  assert.equal(E.cuddle(p, now + 2 * E.MINUTE).code, 'cooldown');
});

function raise(mode, online, seed = 3, days = 4) {
  const start = at(9);
  const doc = E.newDoc();
  E.startEgg(doc, { species: 'raptor', name: 'Blue', now: start, mode, seed });
  let now = start;
  while (now < start + days * E.DAY && !doc.pet.end) {
    now += 5 * E.MINUTE;
    E.advanceDoc(doc, now, env);
    const p = doc.pet;
    if (p.cryo) E.thaw(p, now);
    if (!online(env.minuteOfDay(now))) continue;
    for (const n of E.needs(p, now)) {
      if (n === 'sick') { E.medicine(p, now); E.medicine(p, now); }
      if (n === 'lights') E.lights(p, now);
      if (n === 'attention') E.scold(p, now);
      if (n === 'poop') E.clean(p, now);
      if (n === 'imprint') {
        const type = p.request?.type;
        if (type === 'cuddle') E.cuddle(p, now);
        if (type === 'walk') E.walk(p, now);
        if (type === 'meal') E.feed(p, 'meal', now);
        if (type === 'kibble') E.feed(p, 'kibble_basic', now);
        if (type === 'snack') E.feed(p, 'snack', now);
      }
    }
    if (p.stage !== 'egg' && !p.asleep && E.hygiene(p, now) < 60) E.groom(p, now);
    if (p.stage !== 'egg' && !p.asleep) {
      for (let i = 0; i < 4 && p.m.hunger < 80; i++) if (!E.feed(p, 'meal', now).ok) break;
      for (let i = 0; i < 4 && p.m.happy < 80; i++) if (!E.play(p, { won: true }, now).ok) { E.cuddle(p, now); break; }
    }
  }
  return doc;
}

test('Entwicklung hängt von der Pflege ab: fleißig → Alpha, vernachlässigt → Verwildert', () => {
  const diligent = raise('relaxed', (m) => m >= 7 * 60 && m < 23 * 60 + 30);
  assert.equal(diligent.pet.stage, 'adult');
  assert.equal(diligent.pet.variant, 'alpha');
  assert.equal(diligent.pet.teen, 'good');
  assert.ok(diligent.dex.raptor.a >= 1);
  assert.ok(diligent.dex.raptor.v.includes('alpha'));
  const neglected = raise('relaxed', (m) => m >= 19 * 60 && m < 19 * 60 + 20);
  assert.equal(neglected.pet.variant, 'feral');
  assert.equal(neglected.pet.end, null, 'entspannter Modus: kein Tod');
});

test('Klassischer Modus: völlige Vernachlässigung ist tödlich, entspannter Modus rettet per Kryopod', () => {
  const c = hatched({ mode: 'classic' });
  E.advance(c.p, c.now + 3 * E.DAY, env);
  assert.ok(c.p.end);
  assert.ok(['starvation', 'sickness', 'neglect'].includes(c.p.end.cause));
  const r = hatched({ mode: 'relaxed' });
  E.advance(r.p, r.now + 3 * E.DAY, env);
  assert.equal(r.p.end, null);
  assert.equal(r.p.cryo?.reason, 'rescue');
  assert.equal(E.thaw(r.p, r.now + 3 * E.DAY).ok, true);
  assert.ok(r.p.m.health > 0);
});

test('Kryopod friert Alter und Werte ein', () => {
  const { p, now } = hatched();
  const age = E.ageMs(p, now);
  const meters = clone(p.m);
  assert.equal(E.freeze(p, now).ok, true);
  E.advance(p, now + 5 * E.DAY, env);
  assert.equal(E.ageMs(p, now + 5 * E.DAY), age);
  assert.deepEqual(p.m, meters);
  assert.equal(E.thaw(p, now + 5 * E.DAY).ok, true);
  assert.equal(E.ageMs(p, now + 5 * E.DAY), age);
  assert.equal(p.stage, 'baby');
  assert.equal(E.mood(p, now + 5 * E.DAY), 'dazed');
});

test('Zucht: Nachwuchs der nächsten Generation, Vorfahr kommt in die Ahnengalerie', () => {
  // Vier Tage Aufzucht plus gut zwei Tage als Erwachsener, tagsüber gepflegt
  const doc = raise('relaxed', (m) => m >= 7 * 60 && m < 23 * 60 + 30, 3, 6.5);
  const t = doc.pet.t;
  assert.equal(doc.pet.stage, 'adult');
  if (doc.pet.sick) { E.medicine(doc.pet, t); E.medicine(doc.pet, t); }
  assert.equal(E.canBreed(doc.pet, t), true);
  const res = E.breed(doc, t, 12345);
  assert.equal(res.ok, true);
  assert.equal(doc.pet.stage, 'egg');
  assert.equal(doc.pet.gen, 2);
  assert.equal(doc.pet.name, 'Blue II');
  assert.equal(doc.hall[0].cause, 'bred');
  assert.equal(doc.hall[0].species, 'raptor');
});

test('Neues Ei entlässt ein lebendes Tier, Spielstand bleibt JSON-tauglich', () => {
  const { doc, now } = hatched();
  E.startEgg(doc, { species: 'dodo', name: 'Dodo', now, seed: 5 });
  assert.equal(doc.hall[0].cause, 'released');
  assert.equal(doc.pet.species, 'dodo');
  const copy = clone(doc);
  E.advanceDoc(doc, now + 5 * E.HOUR, env);
  E.advanceDoc(copy, now + 5 * E.HOUR, env);
  assert.deepEqual(copy, clone(doc));
  assert.ok(JSON.stringify(doc).length < 20_000);
});

test('Alle 217 Katalog-Kreaturen haben eine Art mit gültiger Grafik', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/catalog/creatures.json', import.meta.url), 'utf8')).creatures;
  assert.equal(SPECIES.length, catalog.length);
  const byKey = new Map(SPECIES.map((s) => [s.key, s]));
  for (const [key, name, hab, repro] of catalog) {
    const sp = byKey.get(key);
    assert.ok(sp, `Art fehlt: ${key}`);
    assert.equal(sp.name, name);
    assert.equal(sp.hab, hab);
    if (repro) assert.equal(sp.birth, repro, key);
    assert.ok(['egg', 'embryo', 'tek', 'relic'].includes(sp.birth), key);
    for (const c of sp.colors) assert.match(c, /^#[0-9a-f]{6}$/);
  }
  for (const sp of SPECIES) {
    for (const stage of ['baby', 'adolescent', 'adult']) {
      for (const variant of stage === 'adult' ? [null, 'alpha', 'tek', 'feral'] : [null]) {
        const svg = toSvgString(creatureArt(sp, { stage, variant }));
        assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${sp.key} ${stage} ${variant}`);
        assert.match(svg, /class="c-head/, `${sp.key} braucht einen Kopf für Animationen`);
      }
    }
  }
});

test('Animierte Teile tragen nie gleichzeitig transform und transform-origin', () => {
  // Browser wenden transform-origin auch auf das transform-Attribut an: beides am
  // selben Element verschiebt z. B. den vergrößerten Babykopf vom Hals weg.
  const walk = (node, where) => {
    if (!node || typeof node !== 'object') return;
    assert.ok(!(node.attrs.transform && /transform-origin/.test(node.attrs.style || '')), `${where}: ${node.attrs.class}`);
    for (const c of node.children) walk(c, where);
  };
  for (const sp of SPECIES) {
    for (const stage of ['baby', 'juvenile', 'adult']) walk(creatureArt(sp, { stage, variant: stage === 'adult' ? 'alpha' : null }), `${sp.key} ${stage}`);
  }
});

test('Requisiten: Eier jeder Geburtsart, Kisten, Gegenstände, Einrichtung und Events ergeben gültige Grafik', async () => {
  const { eggArt, crateArt, itemArt, decorArt, eventArt, DROP_COLORS } = await import('../public/js/tamagotchi/props.js');
  const { ITEMS, DECOR, EVENTS } = await import('../public/js/tamagotchi/catalog.js');
  const bad = /NaN|undefined|Infinity|\[object/;
  for (const sp of SPECIES) {
    for (const cracks of [0, 3]) {
      const svg = toSvgString(eggArt(sp, { cracks }));
      assert.doesNotMatch(svg, bad, `${sp.key} Ei`);
      assert.match(svg, /class="[^"]*egg-body/, `${sp.key}: das Ei braucht einen beweglichen Körper`);
    }
  }
  for (const color of Object.keys(DROP_COLORS)) for (const open of [false, true]) assert.doesNotMatch(toSvgString(crateArt(color, { open })), bad, color);
  for (const id of [...Object.keys(ITEMS), 'shard']) assert.doesNotMatch(toSvgString(itemArt(id)), bad, id);
  for (const id of Object.keys(DECOR)) assert.doesNotMatch(toSvgString(decorArt(id)), bad, id);
  assert.doesNotMatch(toSvgString(eventArt([...EVENTS.map((e) => e.id), 'evolution'])), bad);
  assert.equal(eventArt([]), null, 'ohne Event keine Ebene');
  // Gleiche Grafik zweimal auf einer Seite: IDs dürfen sich nicht überschneiden
  const ids = (s) => [...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const a = ids(toSvgString(eggArt(SPECIES[0]))), b = ids(toSvgString(eggArt(SPECIES[0])));
  assert.equal(a.filter((x) => b.includes(x)).length, 0);
});
