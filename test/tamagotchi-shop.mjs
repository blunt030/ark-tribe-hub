import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { startServer } from '../src/server.js';
import { config } from '../src/config.js';
import { signWebhook, verifyWebhook, formEncode } from '../src/services/stripeService.js';
import { DEFAULT_FREE } from '../src/services/petConfigService.js';
import * as E from '../public/js/tamagotchi/engine.js';
import * as P from '../public/js/tamagotchi/progress.js';
import { BUNDLED } from '../public/js/tamagotchi/artwork.js';
import { accessOf, forbiddenSpecies, speciesInDoc, freeKeys, artKeys } from '../public/js/tamagotchi/access.js';

/** Kleines, gültiges PNG (einfarbig) für den Bild-Upload. */
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.writeUInt32BE(0x8a6a4aff, y * (w * 4 + 1) + 1 + x * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('Arten-Zugang: gleiche Regel für Browser und Server', () => {
  const arts = artKeys([]);
  assert.equal(arts.size, Object.keys(BUNDLED).length);
  const free = freeKeys({ free: ['rex', 'dodo', 'quetzal'], off: ['quetzal'] }, arts);
  assert.deepEqual([...free], ['rex'], 'nur mit Bild und nicht abgeschaltet');
  const ctx = { arts, off: new Set(['quetzal']), free, owned: new Set(['mosasaurus']), kept: new Set(['dodo']), sale: true };
  assert.equal(accessOf('rex', ctx), 'free');
  assert.equal(accessOf('mosasaurus', ctx), 'owned');
  assert.equal(accessOf('dodo', ctx), 'kept', 'Altbestand ohne Bild bleibt');
  assert.equal(accessOf('giganotosaurus', ctx), 'buy');
  assert.equal(accessOf('giganotosaurus', { ...ctx, sale: false }), 'locked');
  assert.equal(accessOf('quetzal', ctx), 'off');
  assert.equal(accessOf('raptor', ctx), 'off', 'ohne Bild');

  const doc = P.newGame(3);
  P.startEgg(doc, { species: 'dodo', name: 'Dodi', now: Date.now(), seed: 1 });
  assert.deepEqual([...speciesInDoc(doc)], ['dodo']);
  const next = structuredClone(doc);
  E.startEgg(next, { species: 'giganotosaurus', name: 'Giga', now: Date.now(), seed: 2 });
  assert.deepEqual(forbiddenSpecies(doc, next, new Set(['rex'])), ['giganotosaurus']);
  assert.deepEqual(forbiddenSpecies(doc, next, new Set(['giganotosaurus'])), []);
  assert.equal(DEFAULT_FREE.length, 20);
  assert.ok(DEFAULT_FREE.every((k) => BUNDLED[k]), 'Gratis-Vorgabe nur mit Bild');
});

test('Stripe-Webhook-Signatur', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const header = signWebhook(body, 'whsec_test');
  assert.equal(verifyWebhook(body, header, 'whsec_test').id, 'evt_1');
  assert.throws(() => verifyWebhook(body, header, 'whsec_other'));
  assert.throws(() => verifyWebhook(body + ' ', header, 'whsec_test'));
  const old = signWebhook(body, 'whsec_test', Math.floor(Date.now() / 1000) - 3600);
  assert.throws(() => verifyWebhook(body, old, 'whsec_test'), 'zu alte Signatur');
  assert.throws(() => verifyWebhook(body, 't=1,v1=zz', 'whsec_test'));
  assert.equal(formEncode({ a: 1, b: { c: 'x', d: [{ e: 2 }] } }).toString(), 'a=1&b%5Bc%5D=x&b%5Bd%5D%5B0%5D%5Be%5D=2');
});

test('Tamagotchi-Verwaltung, Gratis-Arten, Geschenke und Kauf über Stripe', async (t) => {
  // Stripe-Nachbildung: merkt sich die Checkout-Sitzungen
  const sessions = new Map();
  let lastForm = null;
  const stripe = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.authorization !== 'Bearer sk_test_123') { res.writeHead(401); res.end('{"error":{"message":"bad key"}}'); return; }
      if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
        lastForm = new URLSearchParams(body);
        const id = 'cs_test_' + String(sessions.size + 1).padStart(12, '0');
        const s = {
          id, url: 'https://checkout.stripe.test/' + id, livemode: false, status: 'open', payment_status: 'unpaid',
          client_reference_id: lastForm.get('client_reference_id'),
          metadata: { app: lastForm.get('metadata[app]'), user_id: lastForm.get('metadata[user_id]'), species: lastForm.get('metadata[species]') },
          amount_total: Number(lastForm.get('line_items[0][price_data][unit_amount]')), currency: 'eur', payment_intent: null,
        };
        sessions.set(id, s);
        res.end(JSON.stringify(s));
        return;
      }
      const m = /^\/v1\/checkout\/sessions\/(cs_test_\w+)$/.exec(req.url);
      if (req.method === 'GET' && m && sessions.has(m[1])) { res.end(JSON.stringify(sessions.get(m[1]))); return; }
      res.writeHead(404); res.end('{"error":{"message":"not found"}}');
    });
  });
  await new Promise((r) => stripe.listen(0, r));
  const saved = { ...config.stripe };
  Object.assign(config.stripe, { secretKey: 'sk_test_123', webhookSecret: 'whsec_test', apiBase: `http://localhost:${stripe.address().port}` });

  const dir = mkdtempSync(path.join(tmpdir(), 'ath-petshop-'));
  const app = await startServer(path.join(dir, 'test.db'), 0, { rateLimits: { globalMax: 100000, authMax: 100000 } });
  t.after(async () => {
    Object.assign(config.stripe, saved);
    await new Promise((r) => stripe.close(r));
    await new Promise((r) => app.server.close(r));
    await app.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://localhost:${app.port}`;
  function client() {
    let cookie, csrf;
    return async (method, url, body, { raw = null, headers = {} } = {}) => {
      const res = await fetch(base + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      });
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : { bytes: Buffer.from(await res.arrayBuffer()), type };
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: res.status, ...data };
    };
  }
  const member = client(), dev = client(), anon = client();
  assert.equal((await member('POST', '/api/auth/login', { identifier: 'Blunt OaO', password: 'ChangeMe123!', tribeSlug: 'oao' })).status, 200);
  assert.equal((await dev('POST', '/api/auth/login', { identifier: 'blunt@ark-tribe-hub.dev', password: 'ChangeMe123!' })).status, 200);
  const me = await app.db.get("SELECT id FROM users WHERE username = 'Blunt OaO'");
  const now = Date.now();
  const eggDoc = (species, seed = 3) => { const d = P.newGame(seed); P.startEgg(d, { species, name: 'Testi', now, seed }); return d; };

  await t.test('Konfiguration kommt mit dem Spielstand', async () => {
    const res = await member('GET', '/api/pet');
    assert.equal(res.status, 200);
    assert.equal(res.config.free.length, 20);
    assert.equal(res.config.sale, false, 'Verkauf ist ohne Einstellung aus');
    assert.equal(res.config.price, 199);
    assert.deepEqual(res.config.owned, []);
    assert.equal(res.config.dev, false);
    assert.equal((await dev('GET', '/api/pet')).config.dev, true);
  });

  let revision = 0;
  await t.test('Nur freigeschaltete Arten lassen sich ausbrüten', async () => {
    const locked = await member('PUT', '/api/pet', { doc: eggDoc('giganotosaurus'), baseRevision: 0 });
    assert.equal(locked.status, 403);
    assert.equal(locked.error.code, 'SPECIES_LOCKED');
    assert.equal((await member('PUT', '/api/pet', { doc: eggDoc('dodo'), baseRevision: 0 })).status, 403, 'ohne Bild nicht neu');
    const ok = await member('PUT', '/api/pet', { doc: eggDoc('rex'), baseRevision: 0 });
    assert.equal(ok.status, 200);
    revision = ok.revision;
    // Developer dürfen zum Testen alles mit Bild
    assert.equal((await dev('PUT', '/api/pet', { doc: eggDoc('quetzal'), baseRevision: 0 })).status, 200);
  });

  await t.test('Altbestand bleibt: gespeicherte Arten ohne Bild dürfen weiter gespielt und gezüchtet werden', async () => {
    const old = eggDoc('dodo', 9);
    await app.db.run('UPDATE pets SET state = ?, revision = revision + 1 WHERE user_id = ?', [JSON.stringify(old), me.id]);
    revision += 1;
    old.pet.name = 'Dodo II';
    const res = await member('PUT', '/api/pet', { doc: old, baseRevision: revision });
    assert.equal(res.status, 200);
    revision = res.revision;
    const next = structuredClone(old);
    E.startEgg(next, { species: 'dodo', name: 'Dodo III', now, seed: 5 });
    const again = await member('PUT', '/api/pet', { doc: next, baseRevision: revision });
    assert.equal(again.status, 200, 'dieselbe Art erneut – steht im Spielstand');
    revision = again.revision;
  });

  await t.test('Verwaltung nur für Developer; Einstellungen werden geprüft', async () => {
    assert.equal((await member('GET', '/api/developer/pet')).status, 403);
    assert.equal((await anon('GET', '/api/developer/pet')).status, 401);
    assert.equal((await member('PATCH', '/api/developer/pet/settings', { roster: { free: [] } })).status, 403);
    const st = await dev('GET', '/api/developer/pet');
    assert.equal(st.status, 200);
    assert.equal(st.stripe.configured, true);
    assert.equal(st.stripe.mode, 'test');
    assert.ok(st.webhookUrl.endsWith('/api/stripe/webhook'));
    for (const bad of [
      { roster: { free: ['pikachu'] } },
      { roster: { prices: { rex: 5 } } },
      { sale: { price: 10 } },
      { sale: { terms: 'javascript:alert(1)' } },
      { sale: { terms: 'http://example.com/agb' } },
      { game: { custom: [{ name: 'X', from: '2026-02-30', to: '2026-03-01', mult: { xp: 2 } }] } },
      { game: { custom: [{ name: 'X', from: '2026-03-01', to: '2026-03-02', mult: { xp: 7 } }] } },
      { game: { news: { text: '' + 'x'.repeat(301) } } },
      { game: { events: { off: ['nope'] } } },
    ]) assert.equal((await dev('PATCH', '/api/developer/pet/settings', bad)).status, 400, JSON.stringify(bad));
    const notReady = await dev('PATCH', '/api/developer/pet/settings', { sale: { enabled: true } });
    assert.equal(notReady.status, 400);
    assert.equal(notReady.error.code, 'SALE_NOT_READY');

    const ok = await dev('PATCH', '/api/developer/pet/settings', {
      roster: { free: ['rex', 'triceratops', 'quetzal'], off: ['quetzal'], prices: { mosasaurus: 299 } },
      game: {
        news: { text: 'Willkommen im neuen Tamagotchi!', link: '/nutzungsbedingungen.html' },
        events: { off: ['summer'], weekend: false },
        custom: [{ name: 'Doppel-XP', from: '2026-10-01', to: '2026-10-03', mult: { xp: 2 } }],
        startShards: 50,
      },
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.settings.roster.free, ['quetzal', 'rex', 'triceratops']);
    assert.equal(ok.settings.game.custom[0].mult.xp, 2);
    assert.ok(ok.settings.game.news.at);
    const cfg = (await member('GET', '/api/pet')).config;
    assert.deepEqual(cfg.free.sort(), ['rex', 'triceratops'], 'abgeschaltete Arten sind nicht gratis');
    assert.equal(cfg.prices.mosasaurus, 299);
    assert.equal(cfg.news.text, 'Willkommen im neuen Tamagotchi!');
    assert.deepEqual(cfg.events, { off: ['summer'], weekend: false });
    assert.equal(cfg.startShards, 50);
    assert.equal((await member('PUT', '/api/pet', { doc: eggDoc('brontosaurus'), baseRevision: revision })).status, 403, 'nicht mehr gratis');
  });

  await t.test('Tierbild hochladen macht eine Art verfügbar', async () => {
    const image = 'data:image/png;base64,' + png(40, 30).toString('base64');
    const meta = { face: 1, head: [0.8, 0.1], mouth: [0.9, 0.3], base: 0.95, size: 'm' };
    assert.equal((await member('POST', '/api/developer/pet/art/dodo', { imageBase64: image, mimeType: 'image/png', meta })).status, 403);
    assert.equal((await dev('POST', '/api/developer/pet/art/pikachu', { imageBase64: image, mimeType: 'image/png', meta })).status, 400);
    assert.equal((await dev('POST', '/api/developer/pet/art/dodo', { imageBase64: image, mimeType: 'image/png', meta: { ...meta, face: 0 } })).status, 400);
    const noImage = await dev('PATCH', '/api/developer/pet/art/raptor', { meta: { ...meta, w: 40, h: 30 } });
    assert.equal(noImage.status, 400, 'Angaben ohne Bild nur für mitgelieferte');
    assert.equal(noImage.error.code, 'NO_IMAGE');
    const up = await dev('POST', '/api/developer/pet/art/dodo', { imageBase64: image, mimeType: 'image/png', meta });
    assert.equal(up.status, 200);
    assert.equal(up.art.dodo.img, true);
    assert.equal(up.art.dodo.meta.w, 40, 'Maße kommen aus dem Bild');
    const img = await member('GET', `/api/pet/art/dodo?v=${up.art.dodo.v}`);
    assert.equal(img.status, 200);
    assert.equal(img.type, 'image/png');
    assert.ok(img.bytes.length > 50);
    assert.equal((await anon('GET', '/api/pet/art/dodo')).status, 401);
    assert.equal((await member('GET', '/api/pet/art/raptor')).status, 404);
    assert.equal((await member('GET', '/api/pet/art/pikachu')).status, 404);
    // Angaben eines mitgelieferten Bildes anpassen und wieder entfernen
    const adj = await dev('PATCH', '/api/developer/pet/art/rex', { meta: { ...BUNDLED.rex, size: 'xl' } });
    assert.equal(adj.status, 200);
    assert.equal(adj.art.rex.img, false);
    assert.equal(adj.art.rex.meta.size, 'xl');
    assert.equal((await dev('DELETE', '/api/developer/pet/art/rex')).status, 200);
    assert.equal((await dev('DELETE', '/api/developer/pet/art/rex')).status, 404);
    // Mit Bild und als gratis markiert: neu ausbrütbar
    await dev('PATCH', '/api/developer/pet/settings', { roster: { free: ['rex', 'triceratops', 'dodo'] } });
    const cfg = (await member('GET', '/api/pet')).config;
    assert.ok(cfg.free.includes('dodo'));
    assert.equal(cfg.art.dodo.img, true);
  });

  await t.test('Arten schenken und entziehen', async () => {
    assert.equal((await dev('POST', '/api/developer/pet/unlocks', { userId: me.id, species: 'pikachu' })).status, 400);
    assert.equal((await dev('POST', '/api/developer/pet/unlocks', { userId: 999999, species: 'rex' })).status, 404);
    assert.equal((await dev('POST', '/api/developer/pet/unlocks', { userId: me.id, species: 'mosasaurus' })).status, 201);
    assert.equal((await dev('POST', '/api/developer/pet/unlocks', { userId: me.id, species: 'mosasaurus' })).status, 200, 'doppelt: keine zweite Zeile');
    const cfg = (await member('GET', '/api/pet')).config;
    assert.deepEqual(cfg.owned.map((o) => [o.species, o.source]), [['mosasaurus', 'gift']]);
    const cur = await member('GET', '/api/pet');
    const doc = structuredClone(cur.doc);
    E.startEgg(doc, { species: 'mosasaurus', name: 'Mosi', now, seed: 4 });
    const res = await member('PUT', '/api/pet', { doc, baseRevision: cur.revision });
    assert.equal(res.status, 200);
    revision = res.revision;
    const list = await dev('GET', '/api/developer/pet/purchases');
    assert.equal(list.unlocks[0].species, 'mosasaurus');
    assert.equal(list.unlocks[0].created_by, 'Blunt');
    assert.equal((await dev('DELETE', `/api/developer/pet/unlocks/${me.id}/mosasaurus`)).status, 200);
    assert.equal((await dev('DELETE', `/api/developer/pet/unlocks/${me.id}/mosasaurus`)).status, 404);
  });

  await t.test('Geschenke: an ein Konto oder alle, einmal annehmen', async () => {
    assert.equal((await dev('POST', '/api/developer/pet/gifts', { userId: me.id })).status, 400, 'leer');
    assert.equal((await dev('POST', '/api/developer/pet/gifts', { userId: me.id, items: { nuke: 1 } })).status, 400);
    assert.equal((await dev('POST', '/api/developer/pet/gifts', { userId: me.id, shards: 100, items: { treat: 2 }, message: 'Danke fürs Testen!' })).status, 201);
    assert.equal((await dev('POST', '/api/developer/pet/gifts', { userId: null, shards: 25, expiresAt: '2099-12-31' })).status, 201);
    const cur = await member('GET', '/api/pet');
    assert.equal(cur.config.gifts.length, 2);
    const [personal, everyone] = cur.config.gifts;
    assert.equal(personal.message, 'Danke fürs Testen!');
    const before = cur.doc.player.shards;
    const stale = await member('POST', `/api/pet/gifts/${personal.id}/claim`, { baseRevision: cur.revision - 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.revision, cur.revision);
    const claim = await member('POST', `/api/pet/gifts/${personal.id}/claim`, { baseRevision: cur.revision });
    assert.equal(claim.status, 200);
    assert.equal(claim.revision, cur.revision + 1);
    assert.equal(claim.doc.player.shards, before + 100);
    assert.equal(claim.doc.player.inv.treat, (cur.doc.player.inv.treat || 0) + 2);
    assert.equal((await member('POST', `/api/pet/gifts/${personal.id}/claim`, { baseRevision: claim.revision })).status, 409, 'nur einmal');
    const second = await member('POST', `/api/pet/gifts/${everyone.id}/claim`, { baseRevision: claim.revision });
    assert.equal(second.status, 200);
    revision = second.revision;
    assert.equal((await member('GET', '/api/pet')).config.gifts.length, 0);
    const gifts = await dev('GET', '/api/developer/pet/gifts');
    assert.equal(gifts.gifts.find((g) => g.id === everyone.id).claims, 1);
    assert.equal((await dev('DELETE', `/api/developer/pet/gifts/${everyone.id}`)).status, 200);
  });

  let sessionId;
  await t.test('Kauf: Checkout, Webhook, Rückkehr und Erstattung', async () => {
    assert.equal((await member('POST', '/api/pet/checkout', { species: 'mosasaurus', consent: true })).status, 403, 'Verkauf noch zu');
    const open = await dev('PATCH', '/api/developer/pet/settings', { sale: { enabled: true, price: 249, terms: 'https://example.com/agb', withdrawal: '/widerruf.html' } });
    assert.equal(open.status, 200);
    assert.deepEqual(open.saleMissing, []);
    const cfg = (await member('GET', '/api/pet')).config;
    assert.equal(cfg.sale, true);
    assert.deepEqual(cfg.legal, { terms: 'https://example.com/agb', withdrawal: '/widerruf.html' });

    assert.equal((await member('POST', '/api/pet/checkout', { species: 'mosasaurus' })).status, 400, 'ohne Zustimmung');
    assert.equal((await member('POST', '/api/pet/checkout', { species: 'rex', consent: true })).error.code, 'FREE');
    assert.equal((await member('POST', '/api/pet/checkout', { species: 'raptor', consent: true })).error.code, 'NOT_AVAILABLE');
    assert.equal((await member('POST', '/api/pet/checkout', { species: 'mosasaurus', consent: true })).error.code, 'OWNED', 'steht schon im Spielstand');

    const buy = await member('POST', '/api/pet/checkout', { species: 'giganotosaurus', consent: true, lang: 'de' });
    assert.equal(buy.status, 200);
    assert.match(buy.url, /^https:\/\/checkout\.stripe\.test\/cs_test_/);
    assert.equal(lastForm.get('line_items[0][price_data][unit_amount]'), '249');
    assert.equal(lastForm.get('line_items[0][price_data][currency]'), 'eur');
    assert.equal(lastForm.get('metadata[species]'), 'giganotosaurus');
    assert.equal(lastForm.get('client_reference_id'), String(me.id));
    assert.match(lastForm.get('success_url'), /\?pet_checkout=\{CHECKOUT_SESSION_ID\}#\/tamagotchi$/);
    sessionId = [...sessions.keys()].at(-1);

    // Noch nicht bezahlt: Rückkehr meldet "pending"
    const pending = await member('POST', '/api/pet/checkout/confirm', { sessionId });
    assert.equal(pending.status, 200);
    assert.equal(pending.result, 'pending');
    assert.equal(pending.species, 'giganotosaurus');
    assert.equal(pending.config.owned.some((o) => o.species === 'giganotosaurus'), false);

    // Webhook mit falscher Signatur wird abgelehnt
    const s = { ...sessions.get(sessionId), payment_status: 'paid', status: 'complete', payment_intent: 'pi_test_1' };
    sessions.set(sessionId, s);
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', livemode: false, data: { object: s } });
    const bad = await anon('POST', '/api/stripe/webhook', undefined, { raw: payload, headers: { 'Stripe-Signature': signWebhook(payload, 'whsec_wrong') } });
    assert.equal(bad.status, 400);
    const hook = await anon('POST', '/api/stripe/webhook', undefined, { raw: payload, headers: { 'Stripe-Signature': signWebhook(payload, 'whsec_test') } });
    assert.equal(hook.status, 200);
    assert.equal(hook.handled, true);
    const again = await anon('POST', '/api/stripe/webhook', undefined, { raw: payload, headers: { 'Stripe-Signature': signWebhook(payload, 'whsec_test') } });
    assert.equal(again.status, 200, 'Wiederholung ist harmlos');
    assert.equal((await app.db.get("SELECT COUNT(*) AS n FROM pet_unlocks WHERE species = 'giganotosaurus'")).n, 1);
    const done = await member('POST', '/api/pet/checkout/confirm', { sessionId });
    assert.equal(done.status, 200);
    assert.equal(done.result, 'paid');
    assert.equal(done.config.owned.find((o) => o.species === 'giganotosaurus').source, 'purchase');
    const list = await dev('GET', '/api/developer/pet/purchases');
    assert.equal(list.purchases[0].status, 'paid');
    assert.equal(list.purchases[0].amount_cents, 249);
    const st = await dev('GET', '/api/developer/pet');
    assert.equal(st.stripe.last.type, 'checkout.session.completed');

    // Andere Konten dürfen fremde Sitzungen nicht einlösen
    assert.equal((await dev('POST', '/api/pet/checkout/confirm', { sessionId })).status, 403);
    assert.equal((await member('POST', '/api/pet/checkout/confirm', { sessionId: 'cs_test_../../x' })).status, 400);
    assert.equal((await member('POST', '/api/pet/checkout/confirm', { sessionId: 'cs_test_unknown000000' })).status, 404, 'nur eigene, hier angelegte Käufe');
    // Fremde Sitzung (anderes System am selben Stripe-Konto) schaltet nichts frei
    const foreign = JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed', data: { object: { id: 'cs_test_elsewhere00000', payment_status: 'paid', client_reference_id: String(me.id), metadata: { app: 'ark-tribe-hub-tamagotchi', user_id: String(me.id), species: 'managarmr' } } } });
    const ignored = await anon('POST', '/api/stripe/webhook', undefined, { raw: foreign, headers: { 'Stripe-Signature': signWebhook(foreign, 'whsec_test') } });
    assert.equal(ignored.status, 200);
    assert.equal(ignored.handled, false);
    assert.equal((await app.db.get("SELECT COUNT(*) AS n FROM pet_unlocks WHERE species = 'managarmr'")).n, 0);

    // Vollständige Erstattung nimmt die Freischaltung zurück
    const refund = JSON.stringify({ id: 'evt_2', type: 'charge.refunded', data: { object: { id: 'ch_1', refunded: true, payment_intent: 'pi_test_1' } } });
    assert.equal((await anon('POST', '/api/stripe/webhook', undefined, { raw: refund, headers: { 'Stripe-Signature': signWebhook(refund, 'whsec_test') } })).status, 200);
    assert.equal((await member('GET', '/api/pet')).config.owned.some((o) => o.species === 'giganotosaurus'), false);
    assert.equal((await dev('GET', '/api/developer/pet/purchases')).purchases[0].status, 'refunded');
  });

  await t.test('Rückkehr ohne Webhook schaltet trotzdem frei', async () => {
    const buy = await member('POST', '/api/pet/checkout', { species: 'carcharodontosaurus', consent: true });
    assert.equal(buy.status, 200);
    const id = [...sessions.keys()].at(-1);
    sessions.set(id, { ...sessions.get(id), payment_status: 'paid', status: 'complete', payment_intent: 'pi_test_2' });
    const done = await member('POST', '/api/pet/checkout/confirm', { sessionId: id });
    assert.equal(done.status, 200);
    assert.ok(done.config.owned.some((o) => o.species === 'carcharodontosaurus'));
    const cur = await member('GET', '/api/pet');
    const doc = structuredClone(cur.doc);
    E.startEgg(doc, { species: 'carcharodontosaurus', name: 'Carchi', now, seed: 8 });
    assert.equal((await member('PUT', '/api/pet', { doc, baseRevision: cur.revision })).status, 200);
  });

  await t.test('Übersicht, Spielerliste und Zurücksetzen', async () => {
    const ov = await dev('GET', '/api/developer/pet/overview');
    assert.equal(ov.status, 200);
    assert.ok(ov.overview.players >= 2);
    assert.equal(ov.overview.sales.count, 1, 'die erstattete zählt nicht');
    assert.equal(ov.overview.sales.cents, 249);
    const list = await dev('GET', '/api/developer/pet/players?search=blunt');
    const row = list.players.find((p) => p.id === me.id);
    assert.equal(row.pet.species, 'carcharodontosaurus');
    assert.ok(row.shards > 0);
    assert.deepEqual(row.unlocks.map((u) => u.species), ['carcharodontosaurus']);
    assert.equal((await dev('DELETE', `/api/developer/pet/players/${me.id}`)).status, 200);
    assert.equal((await member('GET', '/api/pet')).doc, null);
    assert.ok((await member('GET', '/api/pet')).config.owned.length, 'Freischaltungen bleiben');
    const log = await app.db.all("SELECT action FROM audit_logs WHERE action LIKE 'pet_%'");
    for (const a of ['pet_settings_updated', 'pet_art_uploaded', 'pet_species_granted', 'pet_gift_created', 'pet_species_purchased', 'pet_state_reset']) {
      assert.ok(log.some((l) => l.action === a), a);
    }
  });
});
