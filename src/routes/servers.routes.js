import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest, notFound } from '../lib/http.js';
import { parseIdParam } from '../lib/validate.js';
import { requireActive, requireRole, requireCsrf } from '../middleware/auth.js';
import * as svc from '../services/serverMapService.js';
import { validateImage, saveImageToDisk } from '../lib/imageUpload.js';
import { config } from '../config.js';

export function buildServerMapRouter(db) {
  const router = new Router();

  function tribeIdOf(req) {
    if (!req.user.tribe_id) throw badRequest('Kein Tribe-Kontext - Developer hat keine eigenen Server');
    return req.user.tribe_id;
  }

  router.get('/api/servers', requireActive, async (req, res) => {
    sendJson(res, 200, { servers: await svc.listServers(db, tribeIdOf(req)) });
  });

  router.get('/api/servers/:id', requireActive, async (req, res) => {
    const server = await svc.getServer(db, parseIdParam(req.params.id), tribeIdOf(req));
    sendJson(res, 200, { server });
  });

  router.post('/api/servers', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const server = await svc.createServer(db, tribeIdOf(req), body, req.user.id);
    sendJson(res, 201, { server });
  });

  router.patch('/api/servers/:id', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const server = await svc.updateServer(db, parseIdParam(req.params.id), tribeIdOf(req), body, req.user.id);
    sendJson(res, 200, { server });
  });

  router.delete('/api/servers/:id', requireRole('admin'), requireCsrf, async (req, res) => {
    await svc.deleteServer(db, parseIdParam(req.params.id), tribeIdOf(req), req.user.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/servers/:id/markers', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const marker = await svc.createMarker(db, parseIdParam(req.params.id), tribeIdOf(req), body, req.user.id);
    sendJson(res, 201, { marker });
  });

  router.patch('/api/markers/:id', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const marker = await svc.updateMarker(db, parseIdParam(req.params.id), tribeIdOf(req), body, req.user.id);
    sendJson(res, 200, { marker });
  });

  router.delete('/api/markers/:id', requireActive, requireCsrf, async (req, res) => {
    await svc.deleteMarker(db, parseIdParam(req.params.id), tribeIdOf(req), req.user.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/markers/:id/image', requireActive, requireCsrf, async (req, res) => {
    const tribeId = tribeIdOf(req);
    const id = parseIdParam(req.params.id);
    const existing = await db.get('SELECT id FROM map_markers WHERE id = ? AND tribe_id = ?', [id, tribeId]);
    if (!existing) throw notFound('Markierung nicht gefunden');
    const body = await readJsonBody(req);
    const { buffer, ext, mimeType } = validateImage({ base64: body.imageBase64, mimeType: body.mimeType });
    const relPath = `markers/${id}.${ext}`;
    if (db.kind === 'postgres') {
      await db.run('UPDATE map_markers SET image_data = ?, image_mime = ?, image_path = ? WHERE id = ?', [buffer, mimeType, relPath, id]);
    } else {
      saveImageToDisk({ buffer, ext, uploadDir: config.uploadDir, subdir: 'markers', ownerId: id });
      await db.run('UPDATE map_markers SET image_path = ? WHERE id = ?', [relPath, id]);
    }
    sendJson(res, 200, { imagePath: relPath });
  });

  return router;
}
