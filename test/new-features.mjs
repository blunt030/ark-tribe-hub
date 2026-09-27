import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';

function client(base) {
  let cookie;
  let csrf;
  async function request(method, route, body) {
    const response = await fetch(base + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const json = await response.json();
    if (json.csrfToken) csrf = json.csrfToken;
    return { status: response.status, json };
  }
  return {
    get: (route) => request('GET', route),
    post: (route, body = {}) => request('POST', route, body),
    patch: (route, body = {}) => request('PATCH', route, body),
    put: (route, body = {}) => request('PUT', route, body),
    delete: (route) => request('DELETE', route),
    login: (identifier, tribeSlug) => request('POST', '/api/auth/login', { identifier, tribeSlug, password: 'ChangeMe123!' }),
  };
}

test('Neue Tribe-Funktionen: Login, PIN/Vault, Aufgaben und Voice', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ath-new-features-'));
  const app = await startServer(path.join(dir, 'test.db'), 0, { rateLimits: { globalMax: 100000, authMax: 100000 } });
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await app.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://localhost:${app.port}`;
  const anonymous = client(base);
  const admin = client(base);
  const member = client(base);
  const breeder = client(base);
  const outsider = client(base);
  const developer = client(base);

  await t.test('Tribe-Namen brauchen ein Kürzel; globale Developer nicht', async () => {
    assert.equal((await anonymous.post('/api/auth/login', { identifier: 'OaO Admin', password: 'ChangeMe123!' })).status, 401);
    assert.equal((await admin.login('OaO Admin', 'oao')).status, 200);
    assert.equal((await member.login('Blunt OaO', 'oao')).status, 200);
    assert.equal((await breeder.login('OaO Breeder', 'oao')).status, 200);
    assert.equal((await outsider.login('BetaTribe Member', 'betatribe')).status, 200);
    assert.equal((await developer.login('Blunt')).status, 200);
    assert.equal((await client(base).login('admin@oao.dev', null)).status, 200);
  });

  await t.test('Mitglieder sehen Rollen, aber keine fremden Zugangs- oder Profildaten', async () => {
    const publicList = await member.get('/api/admin/members');
    assert.equal(publicList.status, 200);
    assert.ok(publicList.json.members.some((entry) => entry.roles.includes('admin')));
    for (const entry of publicList.json.members) {
      assert.equal(entry.email, undefined);
      assert.equal(entry.personal_vault_number, undefined);
      assert.equal(entry.personalPin, undefined);
    }
    const adminId = (await app.db.get("SELECT id FROM users WHERE username='OaO Admin'")).id;
    const profile = await member.get('/api/users/' + adminId);
    assert.equal(profile.status, 200);
    assert.equal(profile.json.user.personalVaultNumber, undefined);
  });

  await t.test('PIN setzt das Mitglied selbst (4 Ziffern, verschlüsselt); Vaults verwaltet der Admin', async () => {
    const memberId = (await app.db.get("SELECT id FROM users WHERE username='Blunt OaO'")).id;
    assert.equal((await member.post('/api/users/me/access-pin/generate', {})).status, 401, 'ohne Passwort kein PIN');
    const generated = await member.post('/api/users/me/access-pin/generate', { currentPassword: 'ChangeMe123!' });
    assert.equal(generated.status, 200);
    assert.match(generated.json.pin, /^\d{4}$/);
    const stored = await app.db.get('SELECT personal_pin_encrypted FROM users WHERE id = ?', [memberId]);
    assert.match(stored.personal_pin_encrypted, /^v1:/);
    assert.doesNotMatch(stored.personal_pin_encrypted, /^\d+$/);

    const pw = { currentPassword: 'ChangeMe123!' };
    assert.equal((await member.put('/api/users/me/access-pin', { pin: '12345', ...pw })).status, 400);
    assert.equal((await member.put('/api/users/me/access-pin', { pin: '12a4', ...pw })).status, 400);
    assert.equal((await member.put('/api/users/me/access-pin', { pin: '4711', currentPassword: 'falsch-falsch' })).status, 401);
    assert.equal((await member.put('/api/users/me/access-pin', { pin: '4711', ...pw })).status, 200);
    // Anzeigen nur mit Passwort; ohne Passwort erfaehrt man nur, ob ein PIN existiert.
    const plain = (await member.get('/api/users/me/access-pin')).json;
    assert.equal(plain.pin, undefined);
    assert.equal(plain.pinSet, true);
    assert.equal((await member.post('/api/users/me/access-pin/reveal', {})).status, 401);
    assert.equal((await member.post('/api/users/me/access-pin/reveal', pw)).json.pin, '4711');

    // Admins koennen den PIN nicht mehr setzen, nur Vaults verwalten.
    assert.equal((await admin.patch(`/api/admin/members/${memberId}/access`, { personalPin: '1234' })).status, 400);
    assert.equal((await member.post('/api/vaults', { name: 'V-42' })).status, 403);
    const created = await admin.post('/api/vaults', { name: 'V-42', assignedUserId: memberId });
    assert.equal(created.status, 201);
    assert.equal((await admin.post('/api/vaults', { name: 'V-42' })).status, 400);
    const adminVaults = (await admin.get('/api/vaults')).json.vaults;
    const v = adminVaults.find((x) => x.name === 'V-42');
    assert.equal(v.assigned_username, 'Blunt OaO');
    // Admins sehen keinen PIN mehr, nur ob einer gesetzt ist.
    assert.equal(v.pin, undefined);
    assert.equal(v.pinSet, true);
    const listed = (await admin.get('/api/admin/members')).json.members.find((m) => m.id === memberId);
    assert.equal(listed.personalPin, undefined);
    const own = (await member.get('/api/vaults')).json.vaults;
    assert.deepEqual(own.map((x) => x.name), ['V-42']);
    assert.equal(own[0].pin, undefined);
    const outsiderVaults = await outsider.get('/api/vaults');
    assert.ok(!outsiderVaults.json.vaults.some((x) => x.name === 'V-42'));
    assert.equal((await outsider.patch(`/api/vaults/${v.id}`, { assignedUserId: null })).status, 403);
    const profile = await member.get('/api/users/me');
    assert.equal(profile.json.user.personalVaultNumber, 'V-42');
    assert.equal((await admin.patch(`/api/vaults/${v.id}`, { assignedUserId: null })).status, 200);
    assert.equal((await member.get('/api/users/me')).json.user.personalVaultNumber, null);
  });

  await t.test('Breeder und Crafter sind getrennte Rollen mit den bisherigen Rechten', async () => {
    const memberId = (await app.db.get("SELECT id FROM users WHERE username='Blunt OaO'")).id;
    assert.equal((await admin.patch(`/api/admin/members/${memberId}/roles`, { crafter: true })).status, 200);
    const roles = (await admin.get('/api/admin/members')).json.members.find((m) => m.id === memberId).roles;
    assert.ok(roles.includes('crafter'));
    assert.ok(!roles.includes('breeder'));
    assert.ok(roles.includes('breeder_crafter'), 'Berechtigung bleibt erhalten');
    // Neue Ei-Bestellung: Breeder wird benachrichtigt, Crafter nicht.
    const breederId = (await app.db.get("SELECT id FROM users WHERE username='OaO Breeder'")).id;
    const count = async (uid) => Number((await app.db.get("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'order_created'", [uid])).c);
    const [crafterBefore, breederBefore] = [await count(memberId), await count(breederId)];
    const egg = (await admin.get('/api/items?productType=egg')).json.items[0];
    assert.equal((await admin.post('/api/orders', { items: [{ itemId: egg.id, quantity: 1 }] })).status, 201);
    assert.equal(await count(memberId), crafterBefore, 'Crafter bekommt keine Ei-Bestellung');
    assert.equal(await count(breederId), breederBefore + 1, 'Breeder bekommt die Ei-Bestellung');
    const breederRoles = (await admin.get('/api/admin/members')).json.members.find((m) => m.id === breederId).roles;
    assert.ok(breederRoles.includes('breeder') && !breederRoles.includes('crafter'));
    assert.equal((await admin.patch(`/api/admin/members/${memberId}/roles`, { crafter: false })).status, 200);
    const after = (await admin.get('/api/admin/members')).json.members.find((m) => m.id === memberId).roles;
    assert.ok(!after.includes('breeder_crafter'));
  });

  await t.test('Online-Status zählt nur den eigenen Tribe', async () => {
    const presence = await member.get('/api/presence');
    assert.equal(presence.status, 200);
    assert.ok(presence.json.onlineCount >= 1);
    assert.equal(presence.json.onlineCount + presence.json.offlineCount, presence.json.total);
  });

  await t.test('Nur Admins erstellen Aufgaben; Mitglieder übernehmen und schließen mit Tribe-Partnern ab', async () => {
    assert.equal((await member.post('/api/tasks', { title: 'Nicht erlaubt' })).status, 403);
    const created = await admin.post('/api/tasks', { title: 'Boss-Vorbereitung', description: 'Artefakte holen', priority: 'high' });
    assert.equal(created.status, 201);
    const taskId = created.json.task.id;
    assert.equal((await member.post(`/api/tasks/${taskId}/claim`)).status, 200);
    const breederId = (await app.db.get("SELECT id FROM users WHERE username='OaO Breeder'")).id;
    const completed = await member.post(`/api/tasks/${taskId}/complete`, { partnerIds: [breederId] });
    assert.equal(completed.status, 200);
    assert.equal(completed.json.task.status, 'done');
    assert.deepEqual(completed.json.task.partners.map((entry) => entry.id), [breederId]);

    const second = await admin.post('/api/tasks', { title: 'Fremd-Tribe-Prüfung' });
    const outsiderId = (await app.db.get("SELECT id FROM users WHERE username='BetaTribe Member'")).id;
    assert.equal((await member.post(`/api/tasks/${second.json.task.id}/claim`)).status, 200);
    assert.equal((await member.post(`/api/tasks/${second.json.task.id}/complete`, { partnerIds: [outsiderId] })).status, 400);
  });

  await t.test('Voice-Signale erreichen nur Teilnehmer desselben Tribe-Kanals', async () => {
    const voiceConfig = await admin.get('/api/voice/config');
    assert.equal(voiceConfig.status, 200);
    assert.equal(voiceConfig.json.turnConfigured, false);
    assert.match(voiceConfig.json.iceServers[0].urls[0], /^stun:/);
    const channels = await admin.get('/api/voice/channels');
    const channelId = channels.json.channels[0].id;
    assert.equal((await admin.post(`/api/voice/channels/${channelId}/join`)).status, 200);
    assert.equal((await member.post(`/api/voice/channels/${channelId}/join`)).status, 200);
    const memberId = (await app.db.get("SELECT id FROM users WHERE username='Blunt OaO'")).id;
    const sent = await admin.post(`/api/voice/channels/${channelId}/signals`, {
      recipientId: memberId,
      type: 'offer',
      payload: { type: 'offer', sdp: 'test-only' },
    });
    assert.equal(sent.status, 201);
    const received = await member.get(`/api/voice/channels/${channelId}/signals?after=0`);
    assert.equal(received.status, 200);
    assert.equal(received.json.signals[0].payload.sdp, 'test-only');
    assert.equal((await outsider.get(`/api/voice/channels/${channelId}/signals?after=0`)).status, 404);
    assert.equal((await member.delete(`/api/voice/channels/${channelId}`)).status, 403);

    const adminId = (await app.db.get("SELECT id FROM users WHERE username='OaO Admin'")).id;
    await app.db.run(
      'UPDATE voice_participants SET last_seen_at = ? WHERE channel_id = ? AND user_id = ?',
      ['2000-01-01T00:00:00.000Z', channelId, adminId]
    );
    const cleaned = await member.get('/api/voice/channels');
    const remainingIds = cleaned.json.channels.find((entry) => entry.id === channelId).participants.map((entry) => entry.user_id);
    assert.ok(!remainingIds.includes(adminId));
    assert.ok(remainingIds.includes(memberId));
  });

  await t.test('Zwei-Faktor-Anmeldung per Authenticator-App', async () => {
    const { totpCode } = await import('../src/lib/totp.js');
    const code = (secret, offset = 0) => totpCode(secret, Math.floor(Date.now() / 30000) + offset);
    const pw = { currentPassword: 'ChangeMe123!' };
    assert.equal((await admin.post('/api/users/me/2fa/setup', {})).status, 401, 'Einrichtung nur mit Passwort');
    const setup = await admin.post('/api/users/me/2fa/setup', pw);
    assert.equal(setup.status, 200);
    assert.match(setup.json.qrSvg, /^<svg/);
    assert.equal((await admin.post('/api/users/me/2fa/enable', { code: '000000' })).status, 400);
    assert.equal((await admin.post('/api/users/me/2fa/enable', { code: code(setup.json.secret) })).status, 200);
    const stored = await app.db.get("SELECT totp_secret_encrypted FROM users WHERE username='OaO Admin'");
    assert.doesNotMatch(stored.totp_secret_encrypted, new RegExp(setup.json.secret), 'Schlüssel liegt verschlüsselt vor');

    // Passwort allein reicht nicht mehr.
    const fresh = client(base);
    const first = await fresh.post('/api/auth/login', { identifier: 'OaO Admin', password: 'ChangeMe123!', tribeSlug: 'oao' });
    assert.equal(first.status, 200);
    assert.equal(first.json.mfaRequired, true);
    assert.equal(first.json.csrfToken, undefined);
    assert.equal((await fresh.get('/api/orders')).status, 401, 'ohne Code keine Sitzung');
    assert.equal((await fresh.post('/api/auth/login/2fa', { mfaToken: first.json.mfaToken, code: '123456' })).status, 401);
    assert.equal((await fresh.post('/api/auth/login/2fa', { mfaToken: first.json.mfaToken + 'x', code: code(setup.json.secret, 1) })).status, 401);
    const second = await fresh.post('/api/auth/login/2fa', { mfaToken: first.json.mfaToken, code: code(setup.json.secret, 1) });
    assert.equal(second.status, 200);
    assert.ok(second.json.csrfToken);
    // Derselbe Code gilt kein zweites Mal.
    const again = await client(base).post('/api/auth/login', { identifier: 'OaO Admin', password: 'ChangeMe123!', tribeSlug: 'oao' });
    assert.equal((await client(base).post('/api/auth/login/2fa', { mfaToken: again.json.mfaToken, code: code(setup.json.secret, 1) })).status, 401);

    // Developer kann 2FA zuruecksetzen (Handy verloren); Tribe-Admins nicht.
    const adminId = (await app.db.get("SELECT id FROM users WHERE username='OaO Admin'")).id;
    assert.equal((await admin.delete(`/api/developer/users/${adminId}/2fa`)).status, 403);
    assert.equal((await developer.delete(`/api/developer/users/${adminId}/2fa`)).status, 200);
    const plain = await client(base).post('/api/auth/login', { identifier: 'OaO Admin', password: 'ChangeMe123!', tribeSlug: 'oao' });
    assert.ok(plain.json.csrfToken, 'nach Zuruecksetzen wieder normale Anmeldung');
  });

  await t.test('Sitzungen enden serverseitig nach 30 Minuten Inaktivität', async () => {
    const idle = client(base);
    assert.equal((await idle.login('Blunt OaO', 'oao')).status, 200);
    assert.equal((await idle.get('/api/auth/me')).status, 200);
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const memberId = (await app.db.get("SELECT id FROM users WHERE username='Blunt OaO'")).id;
    await app.db.run('UPDATE sessions SET last_seen_at = ? WHERE user_id = ?', [old, memberId]);
    assert.equal((await idle.get('/api/auth/me')).status, 401);
  });

  await t.test('Passwörter brauchen mindestens 10 Zeichen', async () => {
    const r = await client(base).post('/api/auth/register', { tribeSlug: 'oao', username: 'Kurz', email: 'kurz@example.test', password: 'Kurz12345' });
    assert.equal(r.status, 400);
  });
});
