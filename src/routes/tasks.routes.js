import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest } from '../lib/http.js';
import { parseIdParam } from '../lib/validate.js';
import { requireActive, requireCsrf } from '../middleware/auth.js';
import * as taskService from '../services/taskService.js';

export function buildTaskRouter(db) {
  const router = new Router();

  function tribeIdOf(req) {
    if (!req.user.tribe_id) throw badRequest('Kein Tribe-Kontext - Developer hat keine eigenen Tasks');
    return req.user.tribe_id;
  }

  router.get('/api/tasks', requireActive, async (req, res) => {
    const tasks = await taskService.listTasks(db, tribeIdOf(req), {
      status: req.query.status,
      assigneeId: req.query.assigneeId ? parseIdParam(req.query.assigneeId, 'assigneeId') : undefined,
    });
    sendJson(res, 200, { tasks });
  });

  router.get('/api/tasks/:id', requireActive, async (req, res) => {
    const task = await taskService.getTask(db, parseIdParam(req.params.id), tribeIdOf(req));
    sendJson(res, 200, { task });
  });

  router.post('/api/tasks', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const task = await taskService.createTask(db, tribeIdOf(req), body, req.user.id);
    sendJson(res, 201, { task });
  });

  router.patch('/api/tasks/:id', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const task = await taskService.updateTask(db, parseIdParam(req.params.id), tribeIdOf(req), body, req.user.id);
    sendJson(res, 200, { task });
  });

  router.delete('/api/tasks/:id', requireActive, requireCsrf, async (req, res) => {
    await taskService.deleteTask(db, parseIdParam(req.params.id), tribeIdOf(req), req.user.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/tasks/:id/comments', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const comment = await taskService.addComment(db, parseIdParam(req.params.id), tribeIdOf(req), body, req.user.id);
    sendJson(res, 201, { comment });
  });

  return router;
}
