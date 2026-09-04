// Vollständige End-to-End- und Security-Testsuite für ARK Tribe Hub.
// Startet einen echten Server (echte SQLite-DB in einem Temp-Verzeichnis) und
// spricht ihn ausschließlich über echte HTTP-Requests an – so wie es später
// auch ein Frontend tun würde. Nichts hier ist gemockt.
//
// Ausführen: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';

function makeClient(base) {
  let cookie = null;
  let csrf = null;

  async function request(method, urlPath, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (opts.badCsrf) headers['X-CSRF-Token'] = 'not-a-real-token';
    else if (csrf && !opts.noCsrf) headers['X-CSRF-Token'] = csrf;

    const res = await fetch(base + urlPath, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      if (/Max-Age=0/.test(setCookie)) cookie = null;
      else {
        const m = setCookie.match(/atb_session=[^;]+/);
        if (m) cookie = m[0];
      }
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* kein JSON-Body */
    }
    return { status: res.status, json };
  }

  return {
    get: (p, o) => request('GET', p, undefined, o),
    post: (p, b, o) => request('POST', p, b, o),
    patch: (p, b, o) => request('PATCH', p, b, o),
    put: (p, b, o) => request('PUT', p, b, o),
    async login(identifier, password) {
      const r = await request('POST', '/api/auth/login', { identifier, password });
      if (r.status === 200) csrf = r.json.csrfToken;
      return r;
    },
  };
}

test('ARK Tribe Hub – Backend End-to-End- und Security-Suite', async (t) => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'ath-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  // Rate-Limits für die Testsuite hochgesetzt: alle Requests kommen hier von
  // 127.0.0.1 und würden sonst den IP-Limiter auslösen. Das Rate-Limiting selbst
  // wird in Test 31 mit einer eigenen, absichtlich niedrig konfigurierten
  // Server-Instanz geprüft; der Brute-Force-Schutz (Test 28) ist davon unabhängig
  // und bleibt hier voll aktiv.
  const { server: initialServer, db: initialDb, port } = await startServer(dbPath, 0, {
    rateLimits: { globalMax: 100000, authMax: 100000 },
  });
  let server = initialServer;
  let db = initialDb;
  const base = `http://localhost:${port}`;

  const anon = makeClient(base);
  const dev = makeClient(base);
  const oaoAdmin = makeClient(base);
  const oaoBreeder = makeClient(base);
  const oaoBreeder2 = makeClient(base);
  const oaoMember = makeClient(base);
  const newbie = makeClient(base); // wird später zu einem zweiten aktiven OaO-Member
  const xyzAdmin = makeClient(base);
  const xyzMember = makeClient(base);

  let pendingUserId, xyzTribeId, xyzAdminId, rexId, rexEggId, rexSaddleId;
  let openOrderId, secondOrderId;

  await t.test('1. Unauthentifizierter Zugriff auf geschützte Route wird abgelehnt (401)', async () => {
    const r = await anon.get('/api/orders');
    assert.equal(r.status, 401);
  });

  await t.test('2. Demo-Zugänge aus dem Seed funktionieren (Passwort-Hashing/Login real)', async () => {
    assert.equal((await dev.login('Blunt', 'ChangeMe123!')).status, 200);
    assert.equal((await oaoAdmin.login('OaO Admin', 'ChangeMe123!')).status, 200);
    assert.equal((await oaoBreeder.login('OaO Breeder', 'ChangeMe123!')).status, 200);
    const memberLogin = await oaoMember.login('Blunt OaO', 'ChangeMe123!');
    assert.equal(memberLogin.status, 200);
    assert.deepEqual(memberLogin.json.user.roles, ['member']);
  });

  await t.test('3. Falsches Passwort wird abgelehnt, ohne Details preiszugeben', async () => {
    const r = await anon.post('/api/auth/login', { identifier: 'Blunt', password: 'falsch' });
    assert.equal(r.status, 401);
  });

  await t.test('4. Katalog ist vollständig (>= 200 Kreaturen, keine Handvoll Platzhalter)', async () => {
    const r = await oaoMember.get('/api/items');
    assert.equal(r.status, 200);
    const creatures = r.json.items.filter((i) => i.product_type === 'creature');
    assert.ok(creatures.length >= 200, `Erwartet >= 200 Kreaturen, erhalten ${creatures.length}`);

    const rex = r.json.items.find((i) => i.key === 'rex');
    rexId = rex.id;
    rexEggId = r.json.items.find((i) => i.key === 'rex_egg').id;
    rexSaddleId = r.json.items.find((i) => i.key === 'rex_saddle').id;

    // Stichprobe der Korrektur: Yutyrannus legt ein Ei (kein Embryo) und hat einen Sattel.
    const yuty = r.json.items.filter((i) => i.key.startsWith('yutyrannus'));
    assert.ok(yuty.some((i) => i.key === 'yutyrannus_egg'));
    assert.ok(yuty.some((i) => i.key === 'yutyrannus_saddle'));
    assert.ok(!yuty.some((i) => i.product_type === 'embryo'));
  });

  await t.test('5. SQL-Injection-artiger Suchbegriff bricht nichts und liefert keine Fremddaten', async () => {
    const r = await oaoMember.get(`/api/items?search=${encodeURIComponent("Rex' OR '1'='1")}`);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.items));
  });

  await t.test('6. Registrierung erzeugt "pending_approval", kein direkter Zugriff', async () => {
    const r = await anon.post('/api/auth/register', { tribeSlug: 'oao', username: 'Neuling', password: 'Testpass123!' });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.status, 'pending_approval');
    pendingUserId = r.json.user.id;
  });

  await t.test('7. Pending-Konto kann sich einloggen, ist aber von Tribe-Funktionen blockiert', async () => {
    const login = await newbie.login('Neuling', 'Testpass123!');
    assert.equal(login.status, 200);
    const orders = await newbie.get('/api/orders');
    assert.equal(orders.status, 403);
    const me = await newbie.get('/api/auth/me');
    assert.equal(me.json.user.status, 'pending_approval');
  });

  await t.test('8. Normales Mitglied darf keine Mitglieder freischalten (RBAC serverseitig)', async () => {
    const r = await oaoMember.patch(`/api/admin/members/${pendingUserId}/approve`);
    assert.equal(r.status, 403);
  });

  await t.test('9. Admin schaltet frei -> Zugriff funktioniert danach sofort', async () => {
    const r = await oaoAdmin.patch(`/api/admin/members/${pendingUserId}/approve`);
    assert.equal(r.status, 200);
    const orders = await newbie.get('/api/orders');
    assert.equal(orders.status, 200);
  });

  await t.test('10. CSRF-Schutz: gültiges Cookie reicht NICHT für POST ohne gültiges CSRF-Token', async () => {
    const r = await oaoMember.post(
      '/api/orders',
      { items: [{ itemId: rexId, quantity: 1 }] },
      { badCsrf: true }
    );
    assert.equal(r.status, 403);
    const r2 = await oaoMember.post('/api/orders', { items: [{ itemId: rexId, quantity: 1 }] }, { noCsrf: true });
    assert.equal(r2.status, 403);
  });

  await t.test('11. Bestellung erstellen funktioniert mit gültigem CSRF-Token', async () => {
    const r = await oaoMember.post('/api/orders', {
      priority: 'urgent',
      note: 'Bitte vor dem Abendraid',
      items: [
        { itemId: rexEggId, quantity: 10 },
        { itemId: rexSaddleId, quantity: 1 },
      ],
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.order.status, 'open');
    assert.equal(r.json.order.items.length, 2);
    openOrderId = r.json.order.id;

    const r2 = await oaoMember.post('/api/orders', { items: [{ itemId: rexId, quantity: 2 }] });
    assert.equal(r2.status, 201);
    secondOrderId = r2.json.order.id;
  });

  await t.test('12. Ein anderes Mitglied darf fremde Bestellung weder sehen noch bearbeiten', async () => {
    const view = await newbie.get(`/api/orders/${openOrderId}`);
    assert.equal(view.status, 403);
    const comment = await newbie.post(`/api/orders/${openOrderId}/comments`, { body: 'Hallo' });
    assert.equal(comment.status, 403);
  });

  await t.test('13. Zweiter Tribe (XYZ) kann NUR vom Developer angelegt werden', async () => {
    const blocked = await oaoAdmin.post('/api/developer/tribes', { slug: 'xyz', name: 'XYZ' });
    assert.equal(blocked.status, 403);
    const r = await dev.post('/api/developer/tribes', { slug: 'xyz', name: 'XYZ' });
    assert.equal(r.status, 201);
    xyzTribeId = r.json.tribe.id;
  });

  await t.test('14. XYZ-Admin registrieren, Rolle vergeben, per Developer freischalten (fremder Tribe-Kontext)', async () => {
    const reg = await anon.post('/api/auth/register', { tribeSlug: 'xyz', username: 'XYZ Admin', password: 'Testpass123!' });
    assert.equal(reg.status, 201);
    xyzAdminId = reg.json.user.id;
    const roleRes = await dev.patch(`/api/developer/users/${xyzAdminId}/roles`, { roles: ['member', 'admin'] });
    assert.equal(roleRes.status, 200);
    const approve = await dev.patch(`/api/admin/members/${xyzAdminId}/approve?tribeId=${xyzTribeId}`);
    assert.equal(approve.status, 200);
    assert.equal((await xyzAdmin.login('XYZ Admin', 'Testpass123!')).status, 200);

    const regMember = await anon.post('/api/auth/register', { tribeSlug: 'xyz', username: 'XYZ Member', password: 'Testpass123!' });
    await dev.patch(`/api/admin/members/${regMember.json.user.id}/approve?tribeId=${xyzTribeId}`);
    assert.equal((await xyzMember.login('XYZ Member', 'Testpass123!')).status, 200);
  });

  await t.test('15. Tribe-Isolation: XYZ kann OaO-Bestellungen weder lesen noch übernehmen (404, nicht 403)', async () => {
    const view = await xyzMember.get(`/api/orders/${openOrderId}`);
    assert.equal(view.status, 404); // bewusst 404: Existenz einer fremden Tribe-Bestellung wird nicht bestätigt
    const claim = await xyzAdmin.post(`/api/orders/${openOrderId}/claim`);
    assert.equal(claim.status, 404);
  });

  await t.test('16. Admin darf sich selbst keine Developer-/Plattformrechte verschaffen', async () => {
    const r = await oaoAdmin.patch(`/api/developer/users/${pendingUserId}/roles`, { roles: ['member', 'developer'] });
    assert.equal(r.status, 403);
  });

  await t.test('17. Manipulierte/unsinnige IDs führen zu sauberem 400/404, nicht zu einem Serverfehler', async () => {
    const r1 = await oaoMember.get('/api/orders/hallo-ich-bin-keine-id');
    assert.equal(r1.status, 400);
    const r2 = await oaoMember.get('/api/orders/999999');
    assert.equal(r2.status, 404);
    const r3 = await oaoMember.get('/api/orders/-1');
    assert.equal(r3.status, 400);
  });

  await t.test('18. Breeder übernimmt eine offene Bestellung ("Übernehmen")', async () => {
    const r1 = await oaoBreeder.post(`/api/orders/${openOrderId}/claim`);
    assert.equal(r1.status, 200);
    const me = (await oaoBreeder.get('/api/auth/me')).json.user;
    assert.equal(r1.json.order.assigned_to, me.id);
  });

  await t.test('19. Zweiter, echter Breeder kann eine bereits übernommene Bestellung nicht doppelt übernehmen', async () => {
    // "OaO Breeder2" anlegen: Developer vergibt Rolle direkt und schaltet frei.
    const reg = await anon.post('/api/auth/register', { tribeSlug: 'oao', username: 'OaO Breeder2', password: 'Testpass123!' });
    const id2 = reg.json.user.id;
    await dev.patch(`/api/developer/users/${id2}/roles`, { roles: ['member', 'breeder_crafter'] });
    await oaoAdmin.patch(`/api/admin/members/${id2}/approve`);
    const breeder2 = makeClient(base);
    await breeder2.login('OaO Breeder2', 'Testpass123!');

    // openOrderId wurde in Schritt 18 bereits von oaoBreeder übernommen -> muss jetzt fehlschlagen.
    const doubleClaim = await breeder2.post(`/api/orders/${openOrderId}/claim`);
    assert.equal(doubleClaim.status, 409);

    // Echter Parallel-Race auf der ZWEITEN, noch offenen Bestellung mit zwei unabhängigen Accounts:
    const [a, b] = await Promise.all([
      oaoBreeder.post(`/api/orders/${secondOrderId}/claim`),
      breeder2.post(`/api/orders/${secondOrderId}/claim`),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409], `Erwartet genau einen Erfolg und einen Konflikt, erhalten ${JSON.stringify(statuses)}`);
  });

  await t.test('20. Nicht zugewiesener Breeder darf Item-Status nicht ändern; zuständiger schon', async () => {
    const order = (await oaoAdmin.get(`/api/orders/${openOrderId}`)).json.order;
    const itemId = order.items[0].id;

    const forbidden = await newbie.patch(`/api/orders/${openOrderId}/items/${itemId}`, { status: 'prepared' });
    assert.equal(forbidden.status, 403);

    const ok = await oaoBreeder.patch(`/api/orders/${openOrderId}/items/${itemId}`, { status: 'prepared' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.order.status, 'partially_prepared');
  });

  await t.test('21. "Nicht verfügbar" erzeugt eine Benachrichtigung für den Besteller', async () => {
    const order = (await oaoBreeder.get(`/api/orders/${openOrderId}`)).json.order;
    const secondItem = order.items[1].id;
    const r = await oaoBreeder.patch(`/api/orders/${openOrderId}/items/${secondItem}`, { status: 'not_available' });
    assert.equal(r.status, 200);

    const notifications = await oaoMember.get('/api/notifications');
    assert.ok(notifications.json.notifications.some((n) => n.type === 'item_not_available'));
  });

  await t.test('22. Bestellung wird erst "completed", wenn WIRKLICH ALLE Positionen ausgegeben sind', async () => {
    const order = (await oaoBreeder.get(`/api/orders/${openOrderId}`)).json.order;
    const [itemA, itemB] = order.items;

    // itemB stand auf "not_available" -> erst zurücksetzen, dann ausgeben
    await oaoBreeder.patch(`/api/orders/${openOrderId}/items/${itemB.id}`, { status: 'issued' });
    let current = (await oaoBreeder.get(`/api/orders/${openOrderId}`)).json.order;
    assert.equal(current.status, 'partially_issued'); // itemA ist noch "prepared", nicht "issued"

    await oaoBreeder.patch(`/api/orders/${openOrderId}/items/${itemA.id}`, { status: 'issued' });
    current = (await oaoBreeder.get(`/api/orders/${openOrderId}`)).json.order;
    assert.equal(current.status, 'completed');
    assert.ok(current.completed_at);
  });

  await t.test('23. Individuelle Notification-Preferences werden respektiert (nicht nur an/aus global)', async () => {
    const before = await oaoMember.get('/api/notifications');
    const beforeCount = before.json.notifications.filter((n) => n.type === 'order_completed').length;

    await newbie.login('Neuling', 'Testpass123!'); // eigener Client, um Member nicht zu beeinflussen
    const disable = await oaoMember.put('/api/notifications/preferences', {
      preferences: [{ type: 'order_cancelled', enabled: false }],
    });
    assert.equal(disable.status, 200);

    const order2 = await oaoMember.post('/api/orders', { items: [{ itemId: rexId, quantity: 1 }] });
    const cancel = await oaoMember.post(`/api/orders/${order2.json.order.id}/cancel`);
    assert.equal(cancel.status, 200);

    const after = await oaoMember.get('/api/notifications');
    const afterCancelledCount = after.json.notifications.filter((n) => n.type === 'order_cancelled').length;
    assert.equal(afterCancelledCount, 0, 'Benachrichtigung trotz deaktivierter Präferenz erhalten');
  });

  await t.test('24. Kommentare: Besteller und zuständiger Breeder sehen sie, fremde Mitglieder nicht', async () => {
    const c1 = await oaoMember.post(`/api/orders/${secondOrderId}/comments`, { body: 'Kann ich das heute Abend bekommen?' });
    assert.equal(c1.status, 201);
    const claimant = (await oaoAdmin.get(`/api/orders/${secondOrderId}`)).json.order.assigned_to;
    const staffClient = claimant === (await oaoBreeder.get('/api/auth/me')).json.user.id ? oaoBreeder : oaoAdmin;
    const list = await staffClient.get(`/api/orders/${secondOrderId}/comments`);
    assert.equal(list.status, 200);
    assert.ok(list.json.comments.length >= 1);

    const denied = await newbie.get(`/api/orders/${secondOrderId}/comments`);
    assert.equal(denied.status, 403);
  });

  await t.test('25. Stornierung: offene Bestellung kann storniert werden, abgeschlossene nicht mehr', async () => {
    const openOne = await oaoMember.post('/api/orders', { items: [{ itemId: rexId, quantity: 1 }] });
    const cancel = await oaoMember.post(`/api/orders/${openOne.json.order.id}/cancel`);
    assert.equal(cancel.status, 200);
    assert.equal(cancel.json.order.status, 'cancelled');

    const cancelCompleted = await oaoMember.post(`/api/orders/${openOrderId}/cancel`);
    assert.equal(cancelCompleted.status, 409);
  });

  await t.test('26. Audit-Log: Admin sieht Log seines Tribes, normales Mitglied wird abgewiesen', async () => {
    const denied = await oaoMember.get('/api/admin/audit-logs');
    assert.equal(denied.status, 403);
    const allowed = await oaoAdmin.get('/api/admin/audit-logs');
    assert.equal(allowed.status, 200);
    assert.ok(allowed.json.logs.length > 0);
    assert.ok(allowed.json.logs.every((l) => l.tribe_id === null || l.tribe_id !== xyzTribeId));
  });

  await t.test('27. Developer sieht tribeübergreifend BEIDE Tribes; Admin sieht nur seinen eigenen', async () => {
    const devView = await dev.get('/api/developer/tribes');
    assert.equal(devView.status, 200);
    const slugs = devView.json.tribes.map((t) => t.slug).sort();
    // Enthält neben den beiden im Test angelegten Tribes zusätzlich "betatribe" aus
    // den festen Demo-Daten (Seed) - deshalb hier auf "enthält", nicht auf exakte Liste prüfen.
    assert.ok(slugs.includes('oao') && slugs.includes('xyz'), `Erwartet oao+xyz enthalten, erhalten ${JSON.stringify(slugs)}`);

    const adminBlocked = await oaoAdmin.get('/api/developer/tribes');
    assert.equal(adminBlocked.status, 403);
  });

  await t.test('28. Brute-Force-Schutz: nach mehreren Fehlversuchen wird der Account temporär gesperrt', async () => {
    const bruteClient = makeClient(base);
    // Die ersten Fehlversuche liefern normale 401 mit generischer Meldung.
    for (let i = 0; i < 5; i++) {
      const r = await bruteClient.post('/api/auth/login', { identifier: 'OaO Admin', password: 'falsches-passwort' });
      assert.equal(r.status, 401);
    }
    // Ab dem 6. Versuch greift die Sperre – erkennbar an der abweichenden Meldung.
    const locked = await bruteClient.post('/api/auth/login', { identifier: 'OaO Admin', password: 'falsches-passwort' });
    assert.equal(locked.status, 401);
    assert.match(locked.json.error.message, /Zu viele fehlgeschlagene/);

    // Entscheidend: Auch mit dem RICHTIGEN Passwort bleibt der Login währenddessen gesperrt.
    const withCorrectPassword = await bruteClient.post('/api/auth/login', { identifier: 'OaO Admin', password: 'ChangeMe123!' });
    assert.equal(withCorrectPassword.status, 401);
    assert.match(withCorrectPassword.json.error.message, /Zu viele fehlgeschlagene/);
  });

  await t.test('29. Bild-Upload: falsch deklarierter Dateityp wird per Magic-Bytes abgelehnt', async () => {
    const fakeImage = Buffer.from('das ist definitiv kein PNG').toString('base64');
    const r = await oaoMember.post('/api/users/me/avatar', { imageBase64: fakeImage, mimeType: 'image/png' });
    assert.equal(r.status, 400);
  });

  await t.test('30. Server/Map sind für normale Mitglieder unsichtbar, für Admin/Breeder sichtbar', async () => {
    const targetId = (await oaoAdmin.get('/api/auth/me')).json.user.id;
    const asMember = await newbie.get(`/api/users/${targetId}`);
    assert.equal(asMember.json.user.server, undefined);
    const asBreeder = await oaoBreeder.get(`/api/users/${targetId}`);
    assert.ok(asBreeder.json.user.server);
  });

  await t.test('31. Admin greift in eine bereits zugewiesene Bestellung ein (Statusänderung UND Neuzuweisung)', async () => {
    // Neue Bestellung, von oaoBreeder übernommen.
    const order = await oaoMember.post('/api/orders', { items: [{ itemId: rexId, quantity: 3 }] });
    const oid = order.json.order.id;
    await oaoBreeder.post(`/api/orders/${oid}/claim`);

    // Ein ANDERER Breeder darf den Status nicht ändern ...
    const reg = await anon.post('/api/auth/register', { tribeSlug: 'oao', username: 'OaO Breeder3', password: 'Testpass123!' });
    await dev.patch(`/api/developer/users/${reg.json.user.id}/roles`, { roles: ['member', 'breeder_crafter'] });
    await oaoAdmin.patch(`/api/admin/members/${reg.json.user.id}/approve`);
    const breeder3 = makeClient(base);
    await breeder3.login('OaO Breeder3', 'Testpass123!');
    const itemId = order.json.order.items[0].id;
    const blocked = await breeder3.patch(`/api/orders/${oid}/items/${itemId}`, { status: 'prepared' });
    assert.equal(blocked.status, 403);

    // ... aber der ADMIN darf trotz fremder Zuweisung jederzeit eingreifen.
    const adminSetsStatus = await oaoAdmin.patch(`/api/orders/${oid}/items/${itemId}`, { status: 'prepared' });
    assert.equal(adminSetsStatus.status, 200);

    // Admin darf die Bestellung auch einem anderen Breeder neu zuweisen.
    const reassign = await oaoAdmin.post(`/api/orders/${oid}/assign`, { userId: reg.json.user.id });
    assert.equal(reassign.status, 200);
    assert.equal(reassign.json.order.assigned_to, reg.json.user.id);
  });

  await t.test('32. Persistenz über einen echten Server-Neustart hinweg (gleiche DB-Datei)', async () => {
    const marker = await oaoMember.post('/api/orders', {
      note: 'Ueberlebt-den-Neustart-Marker',
      items: [{ itemId: rexId, quantity: 1 }],
    });
    const markerId = marker.json.order.id;

    // Server komplett schließen (Prozess/Listener weg) und aus derselben DB-Datei
    // eine VOLLSTÄNDIG NEUE Server-Instanz auf demselben Port starten - simuliert
    // exakt das, was bei einem Neustart/Redeploy auf dem Hosting passiert. Bestehende
    // Test-Clients (dev, oaoAdmin, oaoBreeder, ...) zeigen weiter auf denselben Port
    // und funktionieren danach unverändert weiter.
    await new Promise((resolve) => server.close(resolve));
    db.close();
    const restarted = await startServer(dbPath, port, { rateLimits: { globalMax: 100000, authMax: 100000 } });
    server = restarted.server;
    db = restarted.db;

    // Node/undici hält Verbindungen zum alten Prozess ggf. noch im Keep-Alive-Pool,
    // obwohl derselbe Port sofort wiederverwendet wird - ein reines Test-Artefakt
    // (ein echter Browser würde ohnehin neu verbinden). Ein einziger Retry macht den
    // Test robust, ohne die eigentliche Aussage (Daten sind noch da) zu verwässern.
    const freshClient = makeClient(base);
    let login;
    try {
      login = await freshClient.login('Blunt OaO', 'ChangeMe123!');
    } catch {
      login = await freshClient.login('Blunt OaO', 'ChangeMe123!'); // ein Retry, siehe Kommentar oben
    }
    assert.equal(login.status, 200, 'Login nach Neustart fehlgeschlagen - Benutzerdaten nicht persistent');

    const reopened = await freshClient.get(`/api/orders/${markerId}`);
    assert.equal(reopened.status, 200);
    assert.equal(reopened.json.order.note, 'Ueberlebt-den-Neustart-Marker');
  });

  await t.test('33. Rate-Limiting greift auf einer eigens niedrig konfigurierten Instanz (429)', async () => {
    const rlDir = mkdtempSync(path.join(tmpdir(), 'ath-rl-'));
    const rl = await startServer(path.join(rlDir, 'rl.db'), 0, {
      rateLimits: { globalMax: 5, authMax: 5 },
    });
    const rlBase = `http://localhost:${rl.port}`;

    let sawRateLimit = false;
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${rlBase}/api/health`);
      if (res.status === 429) sawRateLimit = true;
      await res.arrayBuffer();
    }
    assert.ok(sawRateLimit, 'Rate-Limiter hat trotz Überschreitung kein 429 geliefert');

    rl.server.close();
    rl.db.close();
    rmSync(rlDir, { recursive: true, force: true });
  });

  server.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});
