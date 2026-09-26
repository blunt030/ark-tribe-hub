import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';

test('Public artwork cannot consume the API budget; API limits remain enforced', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ath-assets-'));
  const app = await startServer(path.join(dir, 'test.db'), 0, { rateLimits: { globalMax: 3, authMax: 2 } });
  t.after(async () => { await new Promise(r => app.server.close(r)); await app.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://localhost:${app.port}`;
  for (let i = 0; i < 130; i++) {
    const response = await fetch(base + '/assets/ui/house.svg');
    assert.equal(response.status, 200, `asset ${i} must not spend API budget`);
    assert.match(response.headers.get('content-type'), /image\/svg/);
    await response.arrayBuffer();
  }
  for (let i = 0; i < 3; i++) assert.equal((await fetch(base + '/api/health')).status, 200);
  const blocked = await fetch(base + '/api/health');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await fetch(base + '/assets/ui/house.svg')).status, 200);
  // Encoded API paths must not escape the limit through static routing.
  assert.equal((await fetch(base + '/%61pi/health')).status, 429);
});
