import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest } from '../lib/http.js';
import { parseIdParam } from '../lib/validate.js';
import { requireActive, requireCsrf } from '../middleware/auth.js';
import * as voiceService from '../services/voiceService.js';

export function buildVoiceRouter(db) {
  const router = new Router();

  function tribeIdOf(req) {
    if (!req.user.tribe_id) throw badRequest('Kein Tribe-Kontext - Developer hat keine eigenen Voice-Kanäle');
    return req.user.tribe_id;
  }

  router.get('/api/voice/channels', requireActive, async (req, res) => {
    sendJson(res, 200, { channels: await voiceService.listChannels(db, tribeIdOf(req)) });
  });

  router.post('/api/voice/channels', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const channel = await voiceService.createChannel(db, tribeIdOf(req), body, req.user.id);
    sendJson(res, 201, { channel });
  });

  router.delete('/api/voice/channels/:id', requireActive, requireCsrf, async (req, res) => {
    await voiceService.deleteChannel(db, parseIdParam(req.params.id), tribeIdOf(req), req.user.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/voice/channels/:id/join', requireActive, requireCsrf, async (req, res) => {
    await voiceService.joinChannel(db, parseIdParam(req.params.id), tribeIdOf(req), req.user.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/voice/channels/:id/leave', requireActive, requireCsrf, async (req, res) => {
    await voiceService.leaveChannel(db, parseIdParam(req.params.id), tribeIdOf(req), req.user.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/voice/channels/:id/mute', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    await voiceService.setMuted(db, parseIdParam(req.params.id), tribeIdOf(req), req.user.id, !!body.muted);
    sendJson(res, 200, { ok: true });
  });

  return router;
}
