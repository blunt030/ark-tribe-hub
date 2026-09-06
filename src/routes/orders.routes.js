import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, badRequest } from '../lib/http.js';
import { parseIdParam, requireOneOf, requirePositiveInt, optionalString } from '../lib/validate.js';
import { requireActive, requireCsrf } from '../middleware/auth.js';
import * as orderService from '../services/orderService.js';
import { ORDER_PRIORITIES } from '../services/orderService.js';
import { config } from '../config.js';

function langOf(req) {
  return config.supportedLangs.includes(req.query.lang) ? req.query.lang : config.defaultLang;
}

export function buildOrdersRouter(db) {
  const router = new Router();

  router.post('/api/orders', requireActive, requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const priority = body.priority ? requireOneOf(body.priority, ORDER_PRIORITIES, 'priority') : 'normal';
    const note = optionalString(body.note, 'note', { max: 300 });
    if (!Array.isArray(body.items)) throw badRequest('items[] fehlt');
    const items = body.items.map((it) => ({
      itemId: requirePositiveInt(it.itemId, 'itemId'),
      quantity: requirePositiveInt(it.quantity, 'quantity'),
    }));

    const order = await orderService.createOrder(db, {
      tribeId: req.user.tribe_id,
      memberId: req.user.id,
      priority,
      note,
      items,
    });
    sendJson(res, 201, { order });
  });

  router.get('/api/orders', requireActive, async (req, res) => {
    const scope = req.query.scope || undefined; // 'own' | 'open' | 'history'
    const tribeId = req.query.tribeId ? parseIdParam(req.query.tribeId, 'tribeId') : undefined;
    const orders = await orderService.listOrders(db, req.user, { scope, tribeId, lang: langOf(req) });
    sendJson(res, 200, { orders });
  });

  router.get('/api/orders/:id', requireActive, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const order = await orderService.getOrderDetail(db, id, req.user, langOf(req));
    sendJson(res, 200, { order });
  });

  router.post('/api/orders/:id/claim', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const order = await orderService.claimOrder(db, id, req.user);
    sendJson(res, 200, { order });
  });

  router.post('/api/orders/:id/release', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const order = await orderService.releaseOrder(db, id, req.user);
    sendJson(res, 200, { order });
  });

  router.post('/api/orders/:id/assign', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    const targetUserId = requirePositiveInt(body.userId, 'userId');
    const order = await orderService.assignOrder(db, id, targetUserId, req.user);
    sendJson(res, 200, { order });
  });

  router.patch('/api/orders/:id/items/:itemId', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const itemId = parseIdParam(req.params.itemId, 'itemId');
    const body = await readJsonBody(req);
    const status = requireOneOf(body.status, orderService.ORDER_ITEM_STATUSES, 'status');
    const order = await orderService.updateItemStatus(db, id, itemId, status, req.user);
    sendJson(res, 200, { order });
  });

  router.post('/api/orders/:id/cancel', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const order = await orderService.cancelOrder(db, id, req.user);
    sendJson(res, 200, { order });
  });

  // Endgültiges Löschen. Berechtigung wird im Service geprüft (Ersteller oder
  // Admin des eigenen Tribes) - bewusst NICHT nur über einen versteckten Button.
  router.delete('/api/orders/:id', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    await orderService.deleteOrder(db, id, req.user);
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/orders/:id/comments', requireActive, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const comments = await orderService.listComments(db, id, req.user);
    sendJson(res, 200, { comments });
  });

  router.post('/api/orders/:id/comments', requireActive, requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    const text = optionalString(body.body, 'body', { max: 1000 });
    if (!text) throw badRequest('Kommentartext fehlt');
    const comment = await orderService.addComment(db, id, req.user, text);
    sendJson(res, 201, { comment });
  });

  return router;
}
