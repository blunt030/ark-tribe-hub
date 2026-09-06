import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, notFound, conflict, badRequest } from '../lib/http.js';
import { requireString, requireOneOf, parseIdParam } from '../lib/validate.js';
import { requireRole, requireCsrf } from '../middleware/auth.js';
import { getUserRoles } from '../services/authService.js';
import { audit, listAuditLogs } from '../services/auditService.js';
import { sendMail } from '../services/mailService.js';
import { config } from '../config.js';

const ALL_ROLES = ['member', 'breeder_crafter', 'admin', 'developer'];

export function buildDeveloperRouter(db) {
  const router = new Router();

  router.get('/api/developer/tribes', requireRole('developer'), async (req, res) => {
    sendJson(res, 200, { tribes: await db.all('SELECT * FROM tribes ORDER BY name') });
  });

  router.post('/api/developer/tribes', requireRole('developer'), requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const slug = requireString(body.slug, 'slug', { min: 2, max: 50 }).toLowerCase();
    const name = requireString(body.name, 'name', { min: 2, max: 60 });
    if (!/^[a-z0-9-]+$/.test(slug)) throw badRequest('slug darf nur Kleinbuchstaben, Ziffern und "-" enthalten');

    const result = await db.transaction(async (tx) => {
      const existing = await tx.get('SELECT id FROM tribes WHERE slug = ?', [slug]);
      if (existing) throw conflict('Tribe-Slug existiert bereits');
      const inserted = await tx.get('INSERT INTO tribes (slug, name) VALUES (?,?) RETURNING id', [slug, name]);
      await audit(tx, { actorId: req.user.id, action: 'tribe_created', targetType: 'tribe', targetId: inserted.id });
      return tx.get('SELECT * FROM tribes WHERE id = ?', [inserted.id]);
    });
    sendJson(res, 201, { tribe: result });
  });

  router.patch('/api/developer/tribes/:id', requireRole('developer'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    const tribe = await db.get('SELECT * FROM tribes WHERE id = ?', [id]);
    if (!tribe) throw notFound('Tribe nicht gefunden');

    await db.transaction(async (tx) => {
      if (body.name !== undefined) {
        await tx.run('UPDATE tribes SET name = ? WHERE id = ?', [requireString(body.name, 'name', { min: 2, max: 60 }), id]);
      }
      if (body.isActive !== undefined) {
        await tx.run('UPDATE tribes SET is_active = ? WHERE id = ?', [body.isActive ? 1 : 0, id]);
      }
      await tx.run(`UPDATE tribes SET updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
      await audit(tx, { actorId: req.user.id, action: 'tribe_updated', targetType: 'tribe', targetId: id, meta: body });
    });
    sendJson(res, 200, { tribe: await db.get('SELECT * FROM tribes WHERE id = ?', [id]) });
  });

  router.get('/api/developer/users', requireRole('developer'), async (req, res) => {
    const tribeId = req.query.tribeId ? parseIdParam(req.query.tribeId, 'tribeId') : null;
    const rows = tribeId
      ? await db.all('SELECT * FROM users WHERE tribe_id = ? ORDER BY username', [tribeId])
      : await db.all('SELECT * FROM users ORDER BY tribe_id, username');
    const users = [];
    for (const u of rows) users.push({ ...u, roles: await getUserRoles(db, u.id) });
    sendJson(res, 200, { users });
  });

  // Einzige Stelle, an der Admin- oder Developer-Rechte vergeben werden können.
  // Ersetzt die komplette Rollenliste eines Benutzers (bewusst explizit, damit nie
  // "versehentlich" nur eine Rolle hinzugefügt statt ersetzt wird).
  router.patch('/api/developer/users/:id/roles', requireRole('developer'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    if (!Array.isArray(body.roles) || body.roles.length === 0) throw badRequest('roles[] fehlt');
    for (const r of body.roles) requireOneOf(r, ALL_ROLES, 'roles[]');

    await db.transaction(async (tx) => {
      const user = await tx.get('SELECT * FROM users WHERE id = ?', [id]);
      if (!user) throw notFound('Benutzer nicht gefunden');
      await tx.run('DELETE FROM user_roles WHERE user_id = ?', [id]);
      for (const r of new Set(body.roles)) {
        const role = await tx.get('SELECT id FROM roles WHERE key = ?', [r]);
        await tx.run('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)', [id, role.id]);
      }
      await audit(tx, {
        tribeId: user.tribe_id,
        actorId: req.user.id,
        action: 'roles_replaced',
        targetType: 'user',
        targetId: id,
        meta: { roles: body.roles },
      });
    });
    sendJson(res, 200, { roles: await getUserRoles(db, id) });
  });

  router.get('/api/developer/audit-logs', requireRole('developer'), async (req, res) => {
    const tribeId = req.query.tribeId ? parseIdParam(req.query.tribeId, 'tribeId') : undefined;
    sendJson(res, 200, { logs: await listAuditLogs(db, { tribeId, limit: 300 }) });
  });

  // Echtes Löschen (nicht nur Deaktivieren) - nur für Developer, mit Schutz gegen
  // versehentlichen Datenverlust: ein Benutzer mit echten Bestellungen, Kommentaren,
  // hochgeladenen Katalog-Bildern oder News bleibt erhalten (Fehlermeldung statt
  // stillem Datenverlust). Zuweisungen und Audit-Einträge werden dagegen nur
  // "entkoppelt" (auf NULL gesetzt), da sie reine Nebenreferenzen sind, kein
  // eigentlicher Inhalt des Nutzers.
  router.delete('/api/developer/users/:id', requireRole('developer'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    if (id === req.user.id) throw badRequest('Du kannst dich nicht selbst löschen');

    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) throw notFound('Benutzer nicht gefunden');

    const roles = await getUserRoles(db, id);
    if (roles.includes('developer')) {
      const otherDevs = await db.get(
        `SELECT COUNT(*) AS c FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.key = 'developer' AND ur.user_id != ?`,
        [id]
      );
      if (Number(otherDevs.c) === 0) throw badRequest('Letzter Developer-Account kann nicht gelöscht werden');
    }

    const [orders, comments, items, news] = await Promise.all([
      db.get('SELECT COUNT(*) AS c FROM orders WHERE member_id = ?', [id]),
      db.get('SELECT COUNT(*) AS c FROM order_comments WHERE author_id = ?', [id]),
      db.get('SELECT COUNT(*) AS c FROM items WHERE created_by = ?', [id]),
      db.get('SELECT COUNT(*) AS c FROM news WHERE created_by = ?', [id]),
    ]);
    const blockers = [];
    if (Number(orders.c) > 0) blockers.push(`${orders.c} Bestellung(en)`);
    if (Number(comments.c) > 0) blockers.push(`${comments.c} Kommentar(e)`);
    if (Number(items.c) > 0) blockers.push(`${items.c} Katalog-Eintrag/Einträge`);
    if (Number(news.c) > 0) blockers.push(`${news.c} News-Eintrag/Einträge`);
    if (blockers.length) {
      throw conflict(`Kann nicht gelöscht werden - dieser Benutzer hat noch: ${blockers.join(', ')}. Stattdessen deaktivieren.`);
    }

    await db.transaction(async (tx) => {
      await tx.run('UPDATE orders SET assigned_to = NULL WHERE assigned_to = ?', [id]);
      await tx.run('UPDATE audit_logs SET actor_id = NULL WHERE actor_id = ?', [id]);
      await tx.run('DELETE FROM user_roles WHERE user_id = ?', [id]);
      await tx.run('DELETE FROM sessions WHERE user_id = ?', [id]);
      await tx.run('DELETE FROM notifications WHERE user_id = ?', [id]);
      await tx.run('DELETE FROM notification_preferences WHERE user_id = ?', [id]);
      await tx.run('DELETE FROM users WHERE id = ?', [id]);
      await audit(tx, {
        tribeId: user.tribe_id,
        actorId: req.user.id,
        action: 'user_deleted',
        targetType: 'user',
        targetId: id,
        meta: { username: user.username },
      });
    });
    sendJson(res, 200, { ok: true });
  });

  // Unabhängiger Diagnose-Endpunkt: schickt eine Test-Mail, KOMPLETT losgelöst von der
  // Registrierung. Damit lässt sich eindeutig trennen, ob (A) SMTP/Gmail grundsätzlich
  // nicht funktioniert, oder (B) die Registrierung den Mailversand nicht korrekt
  // aufruft. Nur für Developer sichtbar, loggt niemals Zugangsdaten.
  router.post('/api/developer/test-mail', requireRole('developer'), requireCsrf, async (req, res) => {
    const configured = {
      smtpHost: config.smtp.host || null,
      smtpPort: config.smtp.port,
      smtpUser: config.smtp.user || null,
      adminNotificationEmail: config.adminNotificationEmail || null,
      versandweg: config.brevoApiKey ? 'HTTPS-API' : 'SMTP',
      hinweis: config.brevoApiKey
        ? null
        : 'SMTP wird in gehosteten Gratis-Tarifen häufig blockiert (Timeout). Bei Problemen BREVO_API_KEY setzen.',
    };
    const startedAt = Date.now();
    const result = await sendMail({
      to: config.adminNotificationEmail || config.smtp.user,
      subject: 'ARK Tribe Hub – Test-Mail (Developer-Diagnose)',
      text: `Dies ist eine Test-Mail, ausgelöst von ${req.user.username} über den Developer-Diagnosebereich, um den Mailversand unabhängig von einer Registrierung zu prüfen.\n\nZeitpunkt: ${new Date().toISOString()}`,
    });
    sendJson(res, 200, { result, configured, durationMs: Date.now() - startedAt });
  });

  return router;
}
