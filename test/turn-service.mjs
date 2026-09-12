import assert from 'node:assert/strict';
import test from 'node:test';
import { clearTurnCredentialCache, resolveVoiceIceConfig } from '../src/services/turnService.js';

test('Cloudflare TURN erzeugt kurzlebige, browsergeeignete Credentials pro Benutzer', async () => {
  clearTurnCredentialCache();
  let requests = 0;
  const fakeFetch = async (url, options) => {
    requests += 1;
    assert.match(url, /\/turn\/keys\/turn-key-id\/credentials\/generate-ice-servers$/);
    assert.equal(options.headers.Authorization, 'Bearer server-only-secret');
    assert.deepEqual(JSON.parse(options.body), { ttl: 3600 });
    return new Response(JSON.stringify({
      iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        {
          urls: [
            'turn:turn.cloudflare.com:53?transport=udp',
            'turn:turn.cloudflare.com:3478?transport=udp',
            'turns:turn.cloudflare.com:443?transport=tcp',
          ],
          username: 'temporary-user',
          credential: 'temporary-password',
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const settings = {
    rtcIceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
    cloudflareTurn: { keyId: 'turn-key-id', keySecret: 'server-only-secret', ttlSeconds: 3600 },
  };
  const first = await resolveVoiceIceConfig(settings, 42, fakeFetch);
  const cached = await resolveVoiceIceConfig(settings, 42, fakeFetch);

  assert.equal(first.turnConfigured, true);
  assert.equal(requests, 1);
  assert.deepEqual(cached, first);
  assert.equal(first.refreshAfterSeconds, 3300);
  assert.ok(first.credentialExpiresAt);
  assert.equal(first.iceServers[1].username, 'temporary-user');
  assert.equal(first.iceServers[1].credential, 'temporary-password');
  assert.ok(first.iceServers[1].urls.every((url) => !url.includes(':53')));
  assert.ok(first.iceServers[1].urls.some((url) => url.startsWith('turns:')));
});

test('Voice fällt bei fehlendem TURN-Key sicher auf STUN zurück', async () => {
  clearTurnCredentialCache();
  const result = await resolveVoiceIceConfig({
    rtcIceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
    cloudflareTurn: { keyId: null, keySecret: null, ttlSeconds: 3600 },
  }, 7, async () => { throw new Error('darf nicht aufgerufen werden'); });

  assert.equal(result.turnConfigured, false);
  assert.deepEqual(result.iceServers, [{ urls: ['stun:stun.cloudflare.com:3478'] }]);
  assert.equal(result.credentialExpiresAt, undefined);
});
