import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import { startServer } from '../src/server.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

test('Password hashes reject malformed inputs and preserve legacy verification', async () => {
  const hash = await hashPassword('Secret test password');
  assert.match(hash, /^scrypt-v2:/);
  assert.equal(await verifyPassword('Secret test password', hash), true);
  assert.equal(await verifyPassword('incorrect', hash), false);
  for (const input of [null, {}, [], 'x'.repeat(201)]) assert.equal(await verifyPassword(input, hash), false);
  for (const stored of ['x:y', hash + ':extra', 'scrypt-v2:a:b']) assert.equal(await verifyPassword('test', stored), false);
  const salt = 'a'.repeat(32);
  const legacy = `${salt}:${scryptSync('Old password', salt, 64).toString('hex')}`;
  assert.equal(await verifyPassword('Old password', legacy), true);
});

test('Security regressions through HTTP and real sessions', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ath-security-'));
  const app = await startServer(path.join(dir, 'test.db'), 0, { rateLimits: { globalMax: 100000, authMax: 100000 } });
  t.after(async () => { await new Promise(r => app.server.close(r)); await app.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://localhost:${app.port}`;
  let cookie, csrf;
  async function request(method, url, body) {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json();
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    if (data.csrfToken) csrf = data.csrfToken;
    return { status: res.status, data, headers: res.headers };
  }
  const login = (password = 'ChangeMe123!', tribeSlug = 'oao', identifier = 'admin@oao.dev') => request('POST', '/api/auth/login', { identifier, password, tribeSlug });
  await t.test('Email brute-force limit cannot be bypassed by changing tribe', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await login('wrong', `random-${i}`)).status, 401);
    const locked = await login('ChangeMe123!', 'another');
    assert.equal(locked.status, 401);
    assert.match(locked.data.error.message, /15 Minuten/);
    await app.db.run('DELETE FROM login_attempts');
  });
  await t.test('Legacy password upgraded on successful login', async () => {
    const salt = 'b'.repeat(32);
    const legacy = `${salt}:${scryptSync('ChangeMe123!', salt, 64).toString('hex')}`;
    await app.db.run("UPDATE users SET password_hash=? WHERE email='admin@oao.dev'", [legacy]);
    assert.equal((await login()).status, 200);
    assert.match((await app.db.get("SELECT password_hash FROM users WHERE email='admin@oao.dev'")).password_hash, /^scrypt-v2:/);
  });
  await t.test('Email removal requires password and clears previous verification', async () => {
    await app.db.run("UPDATE users SET email_verified=1,email_verify_token='old-token' WHERE email='admin@oao.dev'");
    assert.equal((await request('PATCH', '/api/users/me', { email: '' })).status, 401);
    assert.equal((await request('PATCH', '/api/users/me', { email: '', currentPassword: {} })).status, 401);
    assert.equal((await request('PATCH', '/api/users/me', { email: '', currentPassword: 'ChangeMe123!' })).status, 200);
    const row = await app.db.get("SELECT email_verified,email_verify_token FROM users WHERE username='OaO Admin'");
    assert.equal(row.email_verified, 0); assert.equal(row.email_verify_token, null);
    await app.db.run("UPDATE users SET email='admin@oao.dev' WHERE username='OaO Admin'");
  });
  await t.test('Private responses are not cached; malformed input fails safely', async () => {
    assert.equal((await request('GET', '/api/auth/me')).headers.get('cache-control'), 'no-store');
    for (const body of [null, [], 123]) assert.equal((await request('POST', '/api/auth/login', body)).status, 400);
    assert.equal((await fetch(base + '/%ZZ')).status, 400);
    assert.equal((await fetch(base + '/api/health', { headers: { Cookie: 'broken=%ZZ' } })).status, 200);
    assert.equal((await request('POST', '/api/voice/channels', { name: {} })).status, 400);
  });
  await t.test('Password guessing through profile endpoints shares a limit', async () => {
    // Three credential checks were already used by the email-removal test.
    for (let i=0;i<7;i++) assert.equal((await request('POST','/api/users/me/password', {currentPassword:'wrong',newPassword:'Another password'})).status,401);
    assert.equal((await request('POST','/api/users/me/password', {currentPassword:'wrong',newPassword:'Another password'})).status,429);
    assert.equal((await request('PATCH','/api/users/me', {email:'',currentPassword:'wrong'})).status,429);
  });
  await t.test('Deactivated tribe invalidates sessions and rejects both login methods', async () => {
    await app.db.run("UPDATE tribes SET is_active=0 WHERE slug='oao'");
    assert.equal((await request('GET', '/api/auth/me')).status, 401);
    assert.equal((await login()).status, 401);
    assert.equal((await login('ChangeMe123!', 'oao', 'OaO Admin')).status, 401);
    await app.db.run("UPDATE tribes SET is_active=1 WHERE slug='oao'");
    assert.equal((await request('GET', '/api/auth/me')).status, 401);
  });
});
