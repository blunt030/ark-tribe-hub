import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL engine: additive schema migration, CRUD, constraints and retention', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const schema = readFileSync(new URL('../src/db/schema.postgres.sql', import.meta.url), 'utf8');
  const oldSchema = schema.split('-- Additive, idempotent tables')[0];
  await db.exec(oldSchema);
  const { rows: [tribe] } = await db.query("INSERT INTO tribes (slug,name) VALUES ('test','Preserved tribe') RETURNING id");
  const { rows: [user] } = await db.query("INSERT INTO users (tribe_id,username,password_hash,status) VALUES ($1,'Tester','test-only','active') RETURNING id",[tribe.id]);
  await db.exec(schema);
  await db.exec(schema);
  const requiredColumns = await db.query(
    `SELECT table_name,column_name FROM information_schema.columns
     WHERE (table_name='users' AND column_name='personal_pin_encrypted')
        OR (table_name='game_servers' AND column_name IN ('map_image_path','map_image_data','map_image_mime'))
        OR (table_name='voice_participants' AND column_name='last_seen_at')`
  );
  assert.equal(requiredColumns.rows.length,5);
  for (const table of ['task_partners','voice_signals']) {
    assert.equal((await db.query('SELECT to_regclass($1) AS name',[table])).rows[0].name,table);
  }
  assert.equal((await db.query('SELECT name FROM tribes WHERE id=$1',[tribe.id])).rows[0].name,'Preserved tribe');
  const { rows: [relation] } = await db.query('INSERT INTO tribe_relationships (tribe_id,name,relationship,server,map,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',[tribe.id,'Friends','alliance','EU','The Island',user.id]);
  assert.equal(relation.relationship,'alliance');
  await db.query('UPDATE tribe_relationships SET relationship=$1 WHERE id=$2 AND tribe_id=$3 RETURNING *',['friend',relation.id,tribe.id]);
  const now = new Date().toISOString();
  const { rows: [message] } = await db.query('INSERT INTO tribe_messages (tribe_id,author_id,body,created_at) VALUES ($1,$2,$3,$4) RETURNING id,author_id,body,created_at',[tribe.id,user.id,'Hello',now]);
  assert.equal(message.body,'Hello');
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM tribe_messages WHERE tribe_id=$1 AND author_id=$2 AND created_at >= $3',[tribe.id,user.id,now])).rows[0].n,1);
  assert.equal((await db.query('SELECT id FROM tribe_messages WHERE tribe_id=$1 AND id > $2 ORDER BY id ASC LIMIT $3',[tribe.id,0,50])).rows[0].id,message.id);
  await assert.rejects(db.query('INSERT INTO tribe_messages (tribe_id,body,created_at) VALUES ($1,$2,$3)',[tribe.id,'x'.repeat(2001),now]));
  await assert.rejects(db.query('INSERT INTO tribe_messages (tribe_id,body,created_at) VALUES ($1,$2,$3)',[999999,'foreign',now]));
  await db.query('DELETE FROM users WHERE id=$1',[user.id]);
  assert.equal((await db.query('SELECT author_id FROM tribe_messages')).rows[0].author_id,null);
  assert.equal((await db.query('DELETE FROM tribe_relationships WHERE id=$1 AND tribe_id=$2 RETURNING id',[relation.id,tribe.id])).rows[0].id,relation.id);
});

test('PostgreSQL: email token migration is repeatable and links are single-use', async t => {
  const { migrateEmailTokens, emailTokenHash } = await import('../src/lib/emailTokens.js');
  const { verifyEmail } = await import('../src/services/authService.js');
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(readFileSync(new URL('../src/db/schema.postgres.sql', import.meta.url), 'utf8'));
  const query = (sql,args=[]) => {let n=0;return pg.query(sql.replace(/\?/g,()=>`$${++n}`),args);};
  const db = {all:async(s,a)=>(await query(s,a)).rows,get:async(s,a)=>(await query(s,a)).rows[0],run:query};
  const token='b'.repeat(48);
  await db.run("INSERT INTO users (username,password_hash,email_verify_token,email_verify_expires_at) VALUES ('token-test','unused',?,?)",[token,new Date(Date.now()+60000).toISOString()]);
  await migrateEmailTokens(db); await migrateEmailTokens(db);
  assert.equal((await db.get('SELECT email_verify_token FROM users')).email_verify_token,emailTokenHash(token));
  assert.equal((await verifyEmail(db,emailTokenHash(token))).ok,false);
  assert.equal((await verifyEmail(db,token)).ok,true);
  assert.equal((await verifyEmail(db,token)).ok,false);
});

test('PostgreSQL: Tamagotchi-Spielstand mit Revision, Konflikt und Löschkaskade', async t => {
  const { savePet, loadPet, tribePets } = await import('../src/services/petService.js');
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(readFileSync(new URL('../src/db/schema.postgres.sql', import.meta.url), 'utf8'));
  const query = (sql,args=[]) => {let n=0;return pg.query(sql.replace(/\?/g,()=>`$${++n}`),args);};
  const db = {all:async(s,a)=>(await query(s,a)).rows,get:async(s,a)=>(await query(s,a)).rows[0],run:query,transaction:async(fn)=>fn(db)};
  const { rows: [tribe] } = await pg.query("INSERT INTO tribes (slug,name) VALUES ('pets','Pets') RETURNING id");
  const { rows: [user] } = await pg.query("INSERT INTO users (tribe_id,username,password_hash,status) VALUES ($1,'Keeper','x','active') RETURNING id",[tribe.id]);
  const state = JSON.stringify({ v: 1, pet: { species: 'rex', name: 'Rexi' }, dex: {}, hall: [], settings: { shell: 'tek', retro: false } });
  assert.deepEqual(await savePet(db, user.id, state, 0), { ok: true, revision: 1 });
  assert.equal((await savePet(db, user.id, state, 0)).ok, false);
  assert.deepEqual(await savePet(db, user.id, state, 1), { ok: true, revision: 2 });
  const stale = await savePet(db, user.id, state, 1);
  assert.equal(stale.ok, false);
  assert.equal(stale.revision, 2);
  assert.equal((await loadPet(db, user.id)).doc.pet.name, 'Rexi');
  assert.equal((await tribePets(db, tribe.id))[0].username, 'Keeper');
  await assert.rejects(pg.query('INSERT INTO pets (user_id,state,updated_at) VALUES ($1,$2,$3)', [999999, '{}', 'now']));
  await pg.query('DELETE FROM users WHERE id=$1', [user.id]);
  assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM pets')).rows[0].n, 0);
});

test('PostgreSQL: Tamagotchi-Verwaltung (Einstellungen, Bilder, Freischaltungen, Geschenke, Käufe)', async t => {
  const cfg = await import('../src/services/petConfigService.js');
  const shop = await import('../src/services/petShopService.js');
  const admin = await import('../src/services/petAdminService.js');
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(readFileSync(new URL('../src/db/schema.postgres.sql', import.meta.url), 'utf8'));
  const query = (sql,args=[]) => {let n=0;return pg.query(sql.replace(/\?/g,()=>`$${++n}`),args);};
  const db = {
    kind: 'postgres',
    all: async (s,a) => (await query(s,a)).rows,
    get: async (s,a) => (await query(s,a)).rows[0],
    run: async (s,a) => ({ changes: (await query(s,a)).affectedRows ?? 0 }),
  };
  db.transaction = async (fn) => fn(db);
  const { rows: [tribe] } = await pg.query("INSERT INTO tribes (slug,name) VALUES ('shop','Shop') RETURNING id");
  const { rows: [user] } = await pg.query("INSERT INTO users (tribe_id,username,password_hash,status) VALUES ($1,'Buyer','x','active') RETURNING id",[tribe.id]);
  cfg.invalidatePetConfig();

  const settings = await cfg.updateSettings(db, { roster: { free: ['rex'], prices: { quetzal: 399 } }, game: { news: { text: 'Hallo' } } }, user.id);
  assert.deepEqual(settings.roster.free, ['rex']);
  assert.equal((await cfg.loadSettings(db)).roster.prices.quetzal, 399);
  await cfg.saveArt(db, 'raptor', { meta: { w: 20, h: 20, face: 1, head: [0.8, 0.1], mouth: [0.9, 0.3], base: 0.9, size: 'm' }, buffer: Buffer.from([1, 2, 3, 4]), mime: 'image/png' }, user.id);
  const img = await cfg.artImage(db, 'raptor');
  assert.deepEqual([...img.buffer], [1, 2, 3, 4]);
  assert.ok((await cfg.artSpecies(db)).has('raptor'));
  assert.equal(await cfg.grantUnlock(db, { userId: user.id, species: 'quetzal', source: 'gift' }), true);
  assert.equal(await cfg.grantUnlock(db, { userId: user.id, species: 'quetzal', source: 'gift' }), false);
  const allowed = await cfg.allowedSpecies(db, { id: user.id, roles: [] });
  assert.deepEqual([...allowed].sort(), ['quetzal', 'rex']);

  const doc = { v: 2, pet: null, dex: {}, hall: [], settings: { shell: 'tek', retro: false }, player: { seed: 1, shards: 5, earned: 0, xp: 0, streak: 0, best: 0, lastDay: null, day: null, quests: [], bonus: false, swapped: false, inv: {}, owned: [], deco: {}, ach: {}, tally: {} } };
  await pg.query('INSERT INTO pets (user_id,state,revision,updated_at) VALUES ($1,$2,1,$3)', [user.id, JSON.stringify(doc), new Date().toISOString()]);
  const gift = cfg.cleanGift({ shards: 40, items: { treat: 3 } });
  const giftId = await cfg.createGift(db, { userId: null, gift, by: user.id });
  assert.equal((await cfg.pendingGifts(db, user.id)).length, 1);
  const claim = await cfg.claimGift(db, user.id, giftId, 1);
  assert.equal(claim.ok, true);
  assert.equal(claim.doc.player.shards, 45);
  assert.equal(claim.revision, 2);
  assert.equal((await cfg.pendingGifts(db, user.id)).length, 0);
  assert.equal((await admin.listGifts(db))[0].claims, 1);

  await pg.query("INSERT INTO pet_purchases (session_id,user_id,species,amount_cents,currency,status,consent_at,created_at,updated_at) VALUES ('cs_test_aaaaaaaaaaaa',$1,'mosasaurus',199,'eur','open','x','x','x')", [user.id]);
  const res = await shop.fulfillSession(db, { id: 'cs_test_aaaaaaaaaaaa', payment_status: 'paid', client_reference_id: String(user.id), metadata: { app: 'ark-tribe-hub-tamagotchi', user_id: String(user.id), species: 'mosasaurus' }, amount_total: 199, payment_intent: 'pi_1', livemode: false });
  assert.equal(res.status, 'paid');
  assert.equal((await shop.fulfillSession(db, { id: 'cs_test_aaaaaaaaaaaa', payment_status: 'paid', client_reference_id: String(user.id), metadata: { app: 'ark-tribe-hub-tamagotchi', species: 'mosasaurus' } })).already, true);
  const ov = await admin.overview(db);
  assert.equal(ov.sales.count, 1);
  assert.equal(ov.sales.cents, 199);
  assert.equal(ov.players, 1);
  const list = await admin.players(db, { search: 'buy' });
  assert.equal(list[0].username, 'Buyer');
  assert.deepEqual(list[0].unlocks.map((u) => u.species).sort(), ['mosasaurus', 'quetzal']);
  assert.equal(await shop.refundIntent(db, 'pi_1'), true);
  assert.equal((await shop.listPurchases(db))[0].status, 'refunded');
  assert.equal(await cfg.revokeUnlock(db, user.id, 'quetzal'), true);
  assert.equal(await admin.resetPlayer(db, user.id), true);
  await admin.writeStripeState(db, { at: 'now', type: 'x' });
  assert.equal((await admin.readStripeState(db)).type, 'x');
  cfg.invalidatePetConfig();
});
