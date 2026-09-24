import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db/sqliteClient.js';
import { migrateEmailTokens, emailTokenHash } from '../src/lib/emailTokens.js';
import { verifyEmail } from '../src/services/authService.js';

test('Email tokens: legacy migration, one-time consumption, expiry and database-leak resistance', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ath-email-'));
  const db = await openDatabase(path.join(dir, 'test.db'));
  t.after(async () => { await db.close(); rmSync(dir, {recursive:true,force:true}); });
  const raw = 'a'.repeat(48);
  const expires = new Date(Date.now()+60000).toISOString();
  const user = await db.get("INSERT INTO users (username,password_hash,email,email_verify_token,email_verify_expires_at) VALUES ('test','unused','test@example.test',?,?) RETURNING id", [raw,expires]);
  await migrateEmailTokens(db);
  await migrateEmailTokens(db);
  assert.equal((await db.get('SELECT email_verify_token FROM users WHERE id=?',[user.id])).email_verify_token,emailTokenHash(raw));
  assert.equal((await verifyEmail(db,emailTokenHash(raw))).ok,false);
  const both = await Promise.all([verifyEmail(db,raw),verifyEmail(db,raw)]);
  assert.equal(both.filter(x=>x.ok).length,1);
  assert.equal((await verifyEmail(db,raw)).ok,false);
  for (const expiry of ['invalid-date',new Date(Date.now()-1000).toISOString()]) {
    await db.run('UPDATE users SET email_verified=0,email_verify_token=?,email_verify_expires_at=? WHERE id=?',[emailTokenHash(raw),expiry,user.id]);
    assert.equal((await verifyEmail(db,raw)).ok,false);
  }
  for (const token of [null,{},'x'.repeat(10000)]) assert.equal((await verifyEmail(db,token)).ok,false);
});

test('A verification racing an email change cannot confirm the new address',async()=>{
  let updateArgs;
  const db={get:async(sql,args)=>{
    if(sql.startsWith('SELECT')) return {id:7,username:'test',email_verify_expires_at:null};
    updateArgs=args; return undefined; // Token was replaced between SELECT and UPDATE.
  }};
  assert.equal((await verifyEmail(db,'a'.repeat(48))).ok,false);
  assert.deepEqual(updateArgs,[7,emailTokenHash('a'.repeat(48))]);
});
