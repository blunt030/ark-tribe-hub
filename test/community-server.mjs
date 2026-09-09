// Isolated browser-test fixture. Never point this fixture at a hosted database.
if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') throw new Error('Local test database required');
const { startServer } = await import('../src/server.js');
const app = await startServer(process.env.DB_PATH, Number(process.env.PORT), { rateLimits: { globalMax: 100000, authMax: 100000 } });
const user = await app.db.get("SELECT id,tribe_id FROM users WHERE username='OaO Admin'");
for (let i=0;i<55;i++) await app.db.run('INSERT INTO tribe_messages (tribe_id,author_id,body,created_at) VALUES (?,?,?,?)',[user.tribe_id,user.id,'History '+i,'2026-01-01T10:00:00.000Z']);
console.log('FIXTURE_READY');
