import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';
import * as E from '../public/js/tamagotchi/engine.js';
import * as P from '../public/js/tamagotchi/progress.js';

test('Dino-Tamagotchi API: Konto-Spielstand, Konflikte, Prüfung und Tribe-Gehege', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ath-pet-'));
  const app = await startServer(path.join(dir, 'test.db'), 0, { rateLimits: { globalMax: 100000, authMax: 100000 } });
  t.after(async () => { await new Promise((r) => app.server.close(r)); await app.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://localhost:${app.port}`;
  function client() {
    let cookie, csrf;
    return async (method, url, body, noCsrf = false) => {
      const res = await fetch(base + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf && !noCsrf ? { 'X-CSRF-Token': csrf } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      const data = await res.json();
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: res.status, ...data };
    };
  }
  const member = client(), admin = client(), dev = client(), anon = client(), outsider = client(), pending = client();
  for (const [c, identifier, tribeSlug] of [[member, 'Blunt OaO', 'oao'], [admin, 'OaO Admin', 'oao'], [dev, 'blunt@ark-tribe-hub.dev', null]]) {
    assert.equal((await c('POST', '/api/auth/login', { identifier, password: 'ChangeMe123!', tribeSlug })).status, 200);
  }
  const other = await app.db.get("INSERT INTO tribes (slug,name) VALUES ('rivals','Rivals') RETURNING id");
  const oao = await app.db.get("SELECT id FROM tribes WHERE slug='oao'");
  const template = await app.db.get("SELECT password_hash FROM users WHERE username='Blunt OaO'");
  for (const [name, tribeId, status] of [['Rival', other.id, 'active'], ['Waiting', oao.id, 'pending_approval']]) {
    await app.db.run('INSERT INTO users (username,tribe_id,password_hash,status) VALUES (?,?,?,?)', [name, tribeId, template.password_hash, status]);
  }
  assert.equal((await outsider('POST', '/api/auth/login', { identifier: 'Rival', password: 'ChangeMe123!', tribeSlug: 'rivals' })).status, 200);
  assert.equal((await pending('POST', '/api/auth/login', { identifier: 'Waiting', password: 'ChangeMe123!', tribeSlug: 'oao' })).status, 200);

  const now = Date.now();
  // Aktueller Spielstand (Version 2) mit Spielerprofil, Kiste, Aufgaben und Beutel
  const doc = P.newGame(5);
  P.startEgg(doc, { species: 'rex', name: 'Rexi', now: now - 10 * E.MINUTE, seed: 42 });
  P.advanceGame(doc, now);
  P.openDrop(doc, now);
  P.feedItem(doc, 'kibble_basic', now);

  await t.test('Nur angemeldete, freigeschaltete Konten; Schreiben braucht CSRF', async () => {
    assert.equal((await anon('GET', '/api/pet')).status, 401);
    assert.equal((await pending('GET', '/api/pet')).status, 403);
    assert.equal((await member('PUT', '/api/pet', { doc, baseRevision: 0 }, true)).status, 403);
    const empty = await member('GET', '/api/pet');
    assert.equal(empty.status, 200);
    assert.equal(empty.doc, null);
    assert.equal(empty.revision, 0);
    assert.ok(Math.abs(empty.serverTime - Date.now()) < 60_000);
  });

  let revision;
  await t.test('Speichern und Laden mit Revisionszähler', async () => {
    const saved = await member('PUT', '/api/pet', { doc, baseRevision: 0 });
    assert.equal(saved.status, 200);
    assert.equal(saved.revision, 1);
    const loaded = await member('GET', '/api/pet');
    assert.deepEqual(loaded.doc, JSON.parse(JSON.stringify(doc)));
    E.feed(doc.pet, 'meal', Date.now());
    const second = await member('PUT', '/api/pet', { doc, baseRevision: 1 });
    assert.equal(second.revision, 2);
    revision = 2;
  });

  await t.test('Veralteter Stand eines zweiten Geräts bekommt 409 und den neueren Spielstand', async () => {
    const stale = await member('PUT', '/api/pet', { doc: E.newDoc(), baseRevision: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.revision, revision);
    assert.equal(stale.doc.pet.name, 'Rexi');
    const again = await member('PUT', '/api/pet', { doc: E.newDoc(), baseRevision: 0 });
    assert.equal(again.status, 409, 'zweites Anlegen darf nicht überschreiben');
  });

  await t.test('Ungültige Spielstände werden abgelehnt', async () => {
    const bad = (mutate) => { const d = JSON.parse(JSON.stringify(doc)); mutate(d); return d; };
    const cases = [
      bad((d) => { d.pet.species = 'pikachu'; }),
      bad((d) => { d.pet.name = 'x'.repeat(25); }),
      bad((d) => { d.pet.name = 'Rex' + String.fromCharCode(0x202e) + 'ix'; }),
      bad((d) => { d.pet.name = '   '; }),
      bad((d) => { d.pet.m.hunger = 101; }),
      bad((d) => { d.pet.m.happy = 'viel'; }),
      bad((d) => { d.pet.stage = 'god'; }),
      bad((d) => { d.pet.colors = { 0: 'red' }; }),
      bad((d) => { d.dex.nessie = { h: 1, a: 1, v: [] }; }),
      bad((d) => { d.settings.shell = '<script>'; }),
      bad((d) => { d.v = 3; }),
      bad((d) => { d.player.shards = -5; }),
      bad((d) => { d.player.inv.nuke = 1; }),
      bad((d) => { d.player.owned.push('shell_gold'); }),
      bad((d) => { d.player.deco.bed = 'toy_ball'; }),
      bad((d) => { d.player.quests = [{ id: 'hack', n: 0, goal: 1, done: false }]; }),
      bad((d) => { d.player.ach.fake = 1; }),
      bad((d) => { d.player.lastDay = 'gestern'; }),
      bad((d) => { d.pet.tricks = { fly: 3 }; }),
      bad((d) => { d.pet.exp = { zone: 'moon', at: 1, until: 2, done: false }; }),
      bad((d) => { d.settings.shell = 'gold'; }),
      bad((d) => { d.hall = Array.from({ length: 31 }, () => ({ name: 'A', species: 'rex', gen: 1, stage: 'adult', cause: 'age', age: 1, at: 1 })); }),
      bad((d) => { d.hall = [{ name: 'A', species: 'rex', gen: 1, stage: 'god', cause: 'age', age: 1, at: 1 }]; }),
      bad((d) => { d.pet.personality = 'evil'; }),
      null, [], 'text',
    ];
    for (const c of cases) assert.equal((await member('PUT', '/api/pet', { doc: c, baseRevision: revision })).status, 400);
    for (const b of [-1, 1.5, '2', null]) assert.equal((await member('PUT', '/api/pet', { doc, baseRevision: b })).status, 400);
    const huge = bad((d) => { d.pet.log = Array.from({ length: 100 }, (_, i) => ({ t: 1, k: 'x'.repeat(30) + i })); d.hall = Array.from({ length: 30 }, () => ({ name: 'Ä'.repeat(24), species: 'rex', gen: 1, stage: 'adult', variant: null, cause: 'age', age: 1000, at: 1, pad: 'y'.repeat(2000) })); });
    assert.equal((await member('PUT', '/api/pet', { doc: huge, baseRevision: revision })).status, 413);
    assert.equal((await member('GET', '/api/pet')).revision, revision, 'nichts davon wurde gespeichert');
  });

  await t.test('Tribe-Gehege zeigt nur Tiere des eigenen Tribes, ohne Protokoll', async () => {
    const rivalDoc = E.newDoc();
    E.startEgg(rivalDoc, { species: 'triceratops', name: 'Spy', now, seed: 7 });
    assert.equal((await outsider('PUT', '/api/pet', { doc: rivalDoc, baseRevision: 0 })).status, 200);
    const list = await admin('GET', '/api/pet/tribe');
    assert.equal(list.status, 200);
    assert.deepEqual(list.pets.map((p) => p.username), ['Blunt OaO']);
    assert.equal(list.pets[0].pet.name, 'Rexi');
    assert.equal(list.pets[0].pet.log, undefined);
    assert.equal(list.pets[0].streak, 1, 'Rangliste: Serie');
    assert.ok(list.pets[0].xp > 0, 'Rangliste: Erfahrung');
    assert.equal(list.pets[0].inv, undefined, 'kein Beutel für andere');
    assert.deepEqual((await outsider('GET', '/api/pet/tribe')).pets.map((p) => p.pet.name), ['Spy']);
    // Ohne Tier, aber mit Fortschritt: bleibt in der Rangliste
    const released = JSON.parse(JSON.stringify(doc));
    E.release(released, Date.now());
    assert.equal((await member('PUT', '/api/pet', { doc: released, baseRevision: revision })).status, 200);
    revision += 1;
    const after = await admin('GET', '/api/pet/tribe');
    assert.equal(after.pets.length, 1);
    assert.equal(after.pets[0].pet, null);
    assert.ok(after.pets[0].xp > 0);
    assert.equal((await dev('GET', '/api/pet/tribe')).status, 403, 'Developer ohne Tribe hat kein Gehege');
    assert.equal((await dev('GET', '/api/pet')).status, 200, '… aber ein eigenes Tier');
  });

  await t.test('Konto löschen entfernt den Spielstand', async () => {
    const rival = await app.db.get("SELECT id FROM users WHERE username='Rival'");
    await app.db.run('DELETE FROM users WHERE id = ?', [rival.id]);
    assert.equal(await app.db.get('SELECT user_id FROM pets WHERE user_id = ?', [rival.id]), undefined);
  });
});

test('Rangliste: Serie verfällt nach Tagen ohne Kiste (mit Spielraum für Zeitzonen)', async () => {
  const { liveStreak } = await import('../src/services/petService.js');
  const at = Date.UTC(2026, 8, 21, 12);
  assert.equal(liveStreak({ streak: 5, lastDay: '2026-09-21', inv: {} }, at), 5);
  assert.equal(liveStreak({ streak: 5, lastDay: '2026-09-19', inv: {} }, at), 5, 'ein Tag Spielraum');
  assert.equal(liveStreak({ streak: 5, lastDay: '2026-09-18', inv: {} }, at), 0);
  assert.equal(liveStreak({ streak: 5, lastDay: '2026-09-18', inv: { freeze: 1 } }, at), 5, 'Serienschutz hält einen Tag länger');
  assert.equal(liveStreak({ streak: 5, lastDay: null, inv: {} }, at), 0);
  assert.equal(liveStreak(undefined, at), 0);
});
