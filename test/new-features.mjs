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

  await t.test('Benutzername braucht Tribe-Kürzel; E-Mail bleibt eindeutig', async () => {
    assert.equal((await anonymous.post('/api/auth/login', { identifier: 'OaO Admin', password: 'ChangeMe123!' })).status, 400);
    assert.equal((await admin.login('OaO Admin', 'oao')).status, 200);
    assert.equal((await member.login('Blunt OaO', 'oao')).status, 200);
    assert.equal((await breeder.login('OaO Breeder', 'oao')).status, 200);
    assert.equal((await outsider.login('BetaTribe Member', 'betatribe')).status, 200);
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

  await t.test('PIN liegt verschlüsselt vor und PIN/Vault bleiben adminverwaltet', async () => {
    const memberId = (await app.db.get("SELECT id FROM users WHERE username='Blunt OaO'")).id;
    const generated = await member.post('/api/users/me/access-pin/generate');
    assert.equal(generated.status, 200);
    const stored = await app.db.get('SELECT personal_pin_encrypted FROM users WHERE id = ?', [memberId]);
    assert.match(stored.personal_pin_encrypted, /^v1:/);
    assert.doesNotMatch(stored.personal_pin_encrypted, /^\d{6}$/);

    assert.equal((await member.patch(`/api/admin/members/${memberId}/access`, { personalPin: '654321', vaultNumber: 'V-42' })).status, 403);
    assert.equal((await admin.patch(`/api/admin/members/${memberId}/access`, { personalPin: '654321', vaultNumber: 'V-42' })).status, 200);
    const adminList = await admin.get('/api/admin/members');
    const changed = adminList.json.members.find((entry) => entry.id === memberId);
    assert.equal(changed.personalPin, '654321');
    assert.equal(changed.personal_vault_number, 'V-42');
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
  });
});
