import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, notFound, badRequest } from '../lib/http.js';
import { validateWebhook, sealWebhook, webhookInfo, sendTest, publicTribe } from '../services/discordService.js';
import { requireString } from '../lib/validate.js';
import { requireActive, requireRole, requireCsrf } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';

export function buildTribesRouter(db) {
  const router = new Router();

  router.get('/api/tribes/me', requireActive, async (req, res) => {
    if (!req.user.tribe_id) throw notFound('Kein Tribe zugeordnet (Plattform-Account)');
    const tribe = await db.get('SELECT * FROM tribes WHERE id = ?', [req.user.tribe_id]);
    if (!tribe) throw notFound('Tribe nicht gefunden');
    sendJson(res, 200, { tribe: publicTribe(tribe) });
  });

  // Admins dürfen den Namen ihres EIGENEN Tribes pflegen. Anlegen/Deaktivieren
  // ganzer Tribes bleibt Blunt (Developer) vorbehalten, siehe developer.routes.js.
  router.patch('/api/tribes/me', requireRole('admin'), requireCsrf, async (req, res) => {
    if (!req.user.tribe_id) throw notFound('Kein Tribe zugeordnet');
    const body = await readJsonBody(req);
    const name = requireString(body.name, 'name', { min: 2, max: 60 });
    await db.run(`UPDATE tribes SET name = ?, updated_at = ? WHERE id = ?`, [name, new Date().toISOString(), req.user.tribe_id]);
    await audit(db, { tribeId: req.user.tribe_id, actorId: req.user.id, action: 'tribe_updated', targetType: 'tribe', targetId: req.user.tribe_id });
    const tribe = await db.get('SELECT * FROM tribes WHERE id = ?', [req.user.tribe_id]);
    sendJson(res, 200, { tribe: publicTribe(tribe) });
  });

  /* -------------------------------------------- Discord-Benachrichtigungen */
  router.get('/api/tribes/me/discord', requireRole('admin'), async (req, res) => {
    if (!req.user.tribe_id) throw notFound('Kein Tribe zugeordnet');
    const tribe = await db.get('SELECT discord_breeder_webhook, discord_crafter_webhook FROM tribes WHERE id = ?', [req.user.tribe_id]);
    sendJson(res, 200, { breeder: webhookInfo(tribe?.discord_breeder_webhook), crafter: webhookInfo(tribe?.discord_crafter_webhook) });
  });

  // Feld weglassen = unveraendert, leerer Text = entfernen.
  router.put('/api/tribes/me/discord', requireRole('admin'), requireCsrf, async (req, res) => {
    if (!req.user.tribe_id) throw notFound('Kein Tribe zugeordnet');
    const body = await readJsonBody(req);
    const updates = [];
    const values = [];
    for (const [field, column] of [['breederWebhook', 'discord_breeder_webhook'], ['crafterWebhook', 'discord_crafter_webhook']]) {
      if (body[field] === undefined) continue;
      updates.push(`${column} = ?`);
      values.push(sealWebhook(validateWebhook(body[field])));
    }
    if (!updates.length) throw badRequest('Keine Änderung angegeben');
    await db.run(`UPDATE tribes SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, [...values, new Date().toISOString(), req.user.tribe_id]);
    await audit(db, { tribeId: req.user.tribe_id, actorId: req.user.id, action: 'discord_updated', targetType: 'tribe', targetId: req.user.tribe_id });
    const tribe = await db.get('SELECT discord_breeder_webhook, discord_crafter_webhook FROM tribes WHERE id = ?', [req.user.tribe_id]);
    sendJson(res, 200, { breeder: webhookInfo(tribe.discord_breeder_webhook), crafter: webhookInfo(tribe.discord_crafter_webhook) });
  });

  router.post('/api/tribes/me/discord/test', requireRole('admin'), requireCsrf, async (req, res) => {
    if (!req.user.tribe_id) throw notFound('Kein Tribe zugeordnet');
    const body = await readJsonBody(req);
    const target = body.target === 'crafter' ? 'crafter' : 'breeder';
    const ok = await sendTest(db, req.user.tribe_id, target);
    sendJson(res, 200, { ok });
  });

  return router;
}
