import { liveStreak } from './petService.js';
import { speciesName } from './petConfigService.js';
import { rankOf } from '../../public/js/tamagotchi/progress.js';

/**
 * Auswertungen für die Tamagotchi-Verwaltung: Kennzahlen, Spielerliste,
 * Freischaltungen, Geschenke und der letzte Stripe-Webhook.
 */

const nowIso = () => new Date().toISOString();
const DAY = 86_400_000;
const n = (v) => Number(v) || 0;

function parse(state) {
  try { return JSON.parse(state); } catch { return null; }
}

export async function writeStripeState(db, state) {
  await db.run(
    `INSERT INTO pet_settings (key, value, updated_by, updated_at) VALUES ('stripe', ?, NULL, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [JSON.stringify(state), nowIso()]
  );
}

export async function readStripeState(db) {
  const row = await db.get("SELECT value FROM pet_settings WHERE key = 'stripe'");
  return row ? parse(row.value) : null;
}

/** Kennzahlen für die Übersicht. */
export async function overview(db) {
  const rows = await db.all("SELECT p.state, p.updated_at FROM pets p JOIN users u ON u.id = p.user_id WHERE u.status = 'active'");
  const now = Date.now();
  const out = { players: 0, active1: 0, active7: 0, alive: 0, eggs: 0, raised: 0, bySpecies: {} };
  for (const r of rows) {
    out.players += 1;
    const age = now - Date.parse(r.updated_at);
    if (age < DAY) out.active1 += 1;
    if (age < 7 * DAY) out.active7 += 1;
    const doc = parse(r.state);
    const p = doc?.pet;
    if (p && !p.end) {
      if (p.stage === 'egg') out.eggs += 1;
      else out.alive += 1;
      out.bySpecies[p.species] = (out.bySpecies[p.species] || 0) + 1;
    }
    for (const e of Object.values(doc?.dex || {})) out.raised += n(e?.a);
  }
  const since = new Date(now - 30 * DAY).toISOString();
  const paid = await db.get("SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents), 0) AS s FROM pet_purchases WHERE status = 'paid'");
  const month = await db.get("SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents), 0) AS s FROM pet_purchases WHERE status = 'paid' AND paid_at >= ?", [since]);
  const refunds = await db.get("SELECT COUNT(*) AS c FROM pet_purchases WHERE status IN ('refunded', 'revoked')");
  const unlocks = await db.get('SELECT COUNT(*) AS c FROM pet_unlocks');
  const gifts = await db.get('SELECT COUNT(*) AS c FROM pet_gift_claims');
  const top = Object.entries(out.bySpecies).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([species, count]) => ({ species, name: speciesName(species), count }));
  return {
    players: out.players, active1: out.active1, active7: out.active7, alive: out.alive, eggs: out.eggs, raised: out.raised, top,
    sales: { count: n(paid.c), cents: n(paid.s), month: n(month.c), monthCents: n(month.s), refunds: n(refunds.c) },
    unlocks: n(unlocks.c), giftsClaimed: n(gifts.c),
  };
}

/** Spielerliste (aktive Konten, zuletzt aktive zuerst). */
export async function players(db, { search = '' } = {}) {
  const params = [];
  let where = "u.status = 'active'";
  if (search) {
    where += ' AND LOWER(u.username) LIKE ?';
    params.push('%' + search.toLowerCase().replace(/[%_]/g, '') + '%');
  }
  const rows = await db.all(
    `SELECT u.id, u.username, t.name AS tribe, p.state, p.updated_at
       FROM users u LEFT JOIN tribes t ON t.id = u.tribe_id LEFT JOIN pets p ON p.user_id = u.id
      WHERE ${where}
      ORDER BY CASE WHEN p.updated_at IS NULL THEN 1 ELSE 0 END, p.updated_at DESC, u.username
      LIMIT 300`,
    params
  );
  const unlocks = await db.all('SELECT user_id, species, source FROM pet_unlocks');
  const byUser = new Map();
  for (const u of unlocks) {
    if (!byUser.has(u.user_id)) byUser.set(u.user_id, []);
    byUser.get(u.user_id).push({ species: u.species, source: u.source });
  }
  return rows.map((r) => {
    const doc = r.state ? parse(r.state) : null;
    const p = doc?.pet;
    const pl = doc?.player;
    return {
      id: r.id,
      username: r.username,
      tribe: r.tribe || null,
      playing: Boolean(r.state),
      pet: p ? { name: p.name, species: p.species, stage: p.stage, end: Boolean(p.end) } : null,
      rank: rankOf(n(pl?.xp)).level,
      xp: n(pl?.xp),
      shards: n(pl?.shards),
      streak: liveStreak(pl),
      raised: Object.values(doc?.dex || {}).filter((e) => e?.a > 0).length,
      lastActive: r.updated_at || null,
      unlocks: byUser.get(r.id) || [],
    };
  });
}

export async function resetPlayer(db, userId) {
  const res = await db.run('DELETE FROM pets WHERE user_id = ?', [userId]);
  return res.changes > 0;
}

export async function listUnlocks(db) {
  return db.all(
    `SELECT x.user_id, u.username, x.species, x.source, x.ref, x.created_at, cb.username AS created_by
       FROM pet_unlocks x JOIN users u ON u.id = x.user_id LEFT JOIN users cb ON cb.id = x.created_by
      ORDER BY x.created_at DESC LIMIT 300`
  );
}

export async function listGifts(db) {
  const rows = await db.all(
    `SELECT g.id, g.user_id, u.username, g.shards, g.items, g.message, g.created_at, g.expires_at,
            (SELECT COUNT(*) FROM pet_gift_claims c WHERE c.gift_id = g.id) AS claims
       FROM pet_gifts g LEFT JOIN users u ON u.id = g.user_id
      ORDER BY g.id DESC LIMIT 100`
  );
  return rows.map((g) => ({ ...g, items: parse(g.items) || {}, claims: n(g.claims) }));
}

export async function deleteGift(db, id) {
  const res = await db.run('DELETE FROM pet_gifts WHERE id = ?', [id]);
  return res.changes > 0;
}
