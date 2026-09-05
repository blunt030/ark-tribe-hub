import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest, notFound } from '../lib/http.js';
import { parseIdParam } from '../lib/validate.js';
import { requireActive, requireRole, requireCsrf } from '../middleware/auth.js';
import * as dinoService from '../services/dinoService.js';
import { validateImage, saveImageToDisk } from '../lib/imageUpload.js';
import { config } from '../config.js';

export function buildDinoRouter(db) {
  const router = new Router();

  function tribeIdOf(req) {
    if (!req.user.tribe_id) throw badRequest('Kein Tribe-Kontext - Developer hat keine eigene Dino-Datenbank');
    return req.user.tribe_id;
  }

  router.get('/api/dinos', requireActive, async (req, res) => {
    const tribeId = tribeIdOf(req);
    const dinos = await dinoService.listDinos(db, tribeId, {
      search: req.query.search,
      species: req.query.species,
      status: req.query.status,
      ownerId: req.query.ownerId ? parseIdParam(req.query.ownerId, 'ownerId') : undefined,
    });
    sendJson(res, 200, { dinos });
  });

  router.get('/api/dinos/:id', requireActive, async (req, res) => {
    const tribeId = tribeIdOf(req);
    const id = parseIdParam(req.params.id);
    const dino = await dinoService.getDino(db, id, tribeId);
    sendJson(res, 200, { dino });
  });

  router.post('/api/dinos', requireActive, requireCsrf, async (req, res) => {
    const tribeId = tribeIdOf(req);
    const body = await readJsonBody(req);
    const dino = await dinoService.createDino(db, tribeId, body, req.user.id);
    sendJson(res, 201, { dino });
  });

  router.patch('/api/dinos/:id', requireActive, requireCsrf, async (req, res) => {
    const tribeId = tribeIdOf(req);
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    const dino = await dinoService.updateDino(db, id, tribeId, body, req.user.id);
    sendJson(res, 200, { dino });
  });

  // Loeschen bewusst nur Admin - schuetzt vor versehentlichem Datenverlust eines
  // geteilten Tribe-Bestands; jedes Mitglied darf weiterhin bearbeiten/anlegen.
  router.delete('/api/dinos/:id', requireRole('admin'), requireCsrf, async (req, res) => {
    const tribeId = tribeIdOf(req);
    const id = parseIdParam(req.params.id);
    await dinoService.deleteDino(db, id, tribeId, req.user.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/dinos/:id/image', requireActive, requireCsrf, async (req, res) => {
    const tribeId = tribeIdOf(req);
    const id = parseIdParam(req.params.id);
    const existing = await db.get('SELECT id FROM dinos WHERE id = ? AND tribe_id = ?', [id, tribeId]);
    if (!existing) throw notFound('Dino nicht gefunden');
    const body = await readJsonBody(req);
    const { buffer, ext, mimeType } = validateImage({ base64: body.imageBase64, mimeType: body.mimeType });
    const relPath = `dinos/${id}.${ext}`;

    if (db.kind === 'postgres') {
      await db.run('UPDATE dinos SET image_data = ?, image_mime = ?, image_path = ? WHERE id = ?', [buffer, mimeType, relPath, id]);
    } else {
      saveImageToDisk({ buffer, ext, uploadDir: config.uploadDir, subdir: 'dinos', ownerId: id });
      await db.run('UPDATE dinos SET image_path = ? WHERE id = ?', [relPath, id]);
    }
    sendJson(res, 200, { imagePath: relPath });
  });

  return router;
}
