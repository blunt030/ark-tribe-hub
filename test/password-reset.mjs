import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';
import { requestPasswordReset, resetPassword, resetTokenHash, RESET_TTL_MS } from '../src/services/passwordResetService.js';
import { assignDeveloperContactEmail } from '../src/db/migrations.js';

async function setup(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ath-reset-'));
  const app = await startServer(path.join(dir, 'test.db'), 0, { rateLimits: { globalMax: 100000, authMax: 100000 } });
  t.after(async () => { await new Promise(r => app.server.close(r)); await app.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://localhost:${app.port}`;
  const post = async (url, body, cookie) => {
    const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };
  return { app, db: app.db, post, base };
}

test('Passwort vergessen: Link, einmalige Einlösung, Ablauf, Sitzungen beendet', async t => {
  const { db, post, base } = await setup(t);
  const mails = [];
  const send = async (m) => { mails.push(m); return { sent: true }; };

  // Unbekanntes Konto und Konto ohne Mail: gleiche, generische Antwort, keine Mail.
  const unknown = await post('/api/auth/password/forgot', { identifier: 'niemand@example.test' });
  assert.equal(unknown.status, 200);
  const known = await post('/api/auth/password/forgot', { identifier: 'admin@oao.dev' });
  assert.equal(known.status, 200);
  assert.equal(known.data.message, unknown.data.message);
  assert.equal((await post('/api/auth/password/forgot', {})).status, 400);

  // Tribe-Mitglied per Kuerzel + Name, Grossschreibung egal.
  await db.run("UPDATE users SET password_reset_expires = NULL, password_reset_token = NULL");
  await requestPasswordReset(db, { identifier: 'OaO Admin', tribeSlug: 'OaO' }, { send });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'admin@oao.dev');
  const token = new URL(mails[0].resetUrl).searchParams.get('reset');
  assert.match(token, /^[a-f0-9]{64}$/);
  const row = await db.get("SELECT password_reset_token FROM users WHERE email='admin@oao.dev'");
  assert.equal(row.password_reset_token, resetTokenHash(token), 'nur der Hash liegt in der Datenbank');

  // Sofortiger zweiter Antrag: kein Mail-Bombing.
  await requestPasswordReset(db, { identifier: 'admin@oao.dev' }, { send });
  assert.equal(mails.length, 1);

  // Laufende Sitzung existiert vorher.
  const login = await post('/api/auth/login', { identifier: 'admin@oao.dev', password: 'ChangeMe123!' });
  assert.equal(login.status, 200);

  assert.equal((await post('/api/auth/password/reset', { token, password: 'kurz' })).status, 400);
  assert.equal((await post('/api/auth/password/reset', { token: 'f'.repeat(64), password: 'NeuesPasswort123' })).status, 400);
  assert.equal((await post('/api/auth/password/reset', { token: {}, password: 'NeuesPasswort123' })).status, 400);

  const ok = await post('/api/auth/password/reset', { token, password: 'NeuesPasswort123' });
  assert.equal(ok.status, 200);
  assert.equal((await post('/api/auth/password/reset', { token, password: 'NochEinPasswort1' })).status, 400, 'Link nur einmal gueltig');

  const me = await fetch(base + '/api/auth/me', { headers: { cookie: login.cookie } });
  assert.equal(me.status, 401, 'alte Sitzungen sind beendet');
  assert.equal((await post('/api/auth/login', { identifier: 'admin@oao.dev', password: 'ChangeMe123!' })).status, 401);
  assert.equal((await post('/api/auth/login', { identifier: 'admin@oao.dev', password: 'NeuesPasswort123' })).status, 200);
  assert.ok(await db.get("SELECT id FROM audit_logs WHERE action='password_reset'"));

  // Abgelaufener Link.
  await db.run("UPDATE users SET password_reset_expires = NULL WHERE email='admin@oao.dev'");
  const now = Date.now();
  await requestPasswordReset(db, { identifier: 'admin@oao.dev' }, { send, now });
  const t2 = new URL(mails.at(-1).resetUrl).searchParams.get('reset');
  await assert.rejects(resetPassword(db, { token: t2, password: 'NeuesPasswort456' }, { now: now + RESET_TTL_MS + 1000 }), /abgelaufen/);

  // Zwei gleichzeitige Einloesungen: nur eine gewinnt.
  const both = await Promise.allSettled([
    resetPassword(db, { token: t2, password: 'ParallelEins123' }, { now }),
    resetPassword(db, { token: t2, password: 'ParallelZwei123' }, { now }),
  ]);
  assert.equal(both.filter(r => r.status === 'fulfilled').length, 1);
});

test('Developer: Reset ohne Tribe, gesperrte Konten bekommen keine Mail', async t => {
  const { db } = await setup(t);
  const mails = [];
  const send = async (m) => { mails.push(m); return { sent: true }; };
  await requestPasswordReset(db, { identifier: 'blunt' }, { send });
  assert.equal(mails.length, 1, 'Developer ohne Tribe-Kuerzel');
  await requestPasswordReset(db, { identifier: 'OaO Admin' }, { send });
  assert.equal(mails.length, 1, 'Tribe-Mitglied ohne Kuerzel wird nicht gefunden');
  await db.run("UPDATE users SET status='disabled', password_reset_expires=NULL WHERE email='breeder@oao.dev'");
  await requestPasswordReset(db, { identifier: 'breeder@oao.dev' }, { send });
  assert.equal(mails.length, 1);
});

test('Developer-Kontaktadresse wird genau einmal gesetzt', async t => {
  const { db } = await setup(t);
  const contact = { username: 'blunt', email: 'support.arkhub@gmail.com' };
  assert.equal(await assignDeveloperContactEmail(db, contact), true);
  const dev = await db.get("SELECT email FROM users WHERE username='Blunt' AND tribe_id IS NULL");
  assert.equal(dev.email, contact.email);
  // Spaetere Aenderung im Profil wird nicht wieder ueberschrieben.
  await db.run("UPDATE users SET email='neu@example.test' WHERE username='Blunt' AND tribe_id IS NULL");
  assert.equal(await assignDeveloperContactEmail(db, contact), false);
  assert.equal((await db.get("SELECT email FROM users WHERE username='Blunt' AND tribe_id IS NULL")).email, 'neu@example.test');
});

test('Anmeldeseite: kein OaO-Beispiel, Passwort-vergessen und Augen-Knopf vorhanden', () => {
  const auth = readFileSync(new URL('../public/js/views/auth.js', import.meta.url), 'utf8');
  const i18n = readFileSync(new URL('../public/js/i18n.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../public/js/ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(auth, /placeholder: 'oao'/);
  const lastHints = [...i18n.matchAll(/'auth\.tribe_login_hint': '([^']*)'/g)].map(m => m[1]);
  assert.equal(lastHints.length, 4);
  for (const h of lastHints) assert.doesNotMatch(h, /oao/i);
  assert.match(auth, /api\.forgotPassword/);
  assert.match(auth, /api\.resetPassword/);
  assert.match(ui, /export function installPasswordToggles/);
});
