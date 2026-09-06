import { badRequest, forbidden, notFound, conflict } from '../lib/http.js';
import { notify } from './notificationService.js';
import { audit } from './auditService.js';
import { getUserRoles } from './authService.js';

export const ORDER_PRIORITIES = ['normal', 'high', 'urgent'];
export const ORDER_ITEM_STATUSES = ['open', 'not_available', 'prepared', 'issued'];

/** Lädt eine Bestellung UND erzwingt Mandantentrennung (404 statt 403 bei fremdem Tribe). */
export async function getScopedOrder(db, orderId, user) {
  const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) throw notFound('Bestellung nicht gefunden');
  if (!user.roles.includes('developer') && order.tribe_id !== user.tribe_id) {
    // Bewusst 404 (nicht 403): Existenz einer fremden Tribe-Bestellung wird nicht bestätigt.
    throw notFound('Bestellung nicht gefunden');
  }
  return order;
}

export function canViewOrder(order, user) {
  if (user.roles.includes('developer')) return true;
  if (order.tribe_id !== user.tribe_id) return false;
  if (user.roles.includes('admin')) return true;
  if (order.member_id === user.id) return true;
  if (order.assigned_to === user.id) return true;
  if (user.roles.includes('breeder_crafter') && order.assigned_to === null && !['completed', 'cancelled'].includes(order.status)) return true;
  return false;
}

export function canManageOrder(order, user) {
  if (user.roles.includes('developer')) return true;
  if (order.tribe_id !== user.tribe_id) return false;
  if (user.roles.includes('admin')) return true;
  return order.assigned_to === user.id;
}

export function canAccessComments(order, user) {
  if (user.roles.includes('developer')) return true;
  if (order.tribe_id !== user.tribe_id) return false;
  if (user.roles.includes('admin')) return true;
  if (order.member_id === user.id) return true;
  return order.assigned_to === user.id;
}

export async function getOrderWithItems(db, orderId, lang = 'de') {
  // Der Kopf der Bestellung zeigt laut Spezifikation Benutzer + Tribe ("Blunt OaO"),
  // keine Bestellnummer - deshalb werden die Namen gleich mitgeladen.
  const order = await db.get(
    `SELECT o.*, m.username AS member_username, a.username AS assigned_username, tr.name AS tribe_name
     FROM orders o
     JOIN users m ON m.id = o.member_id
     LEFT JOIN users a ON a.id = o.assigned_to
     JOIN tribes tr ON tr.id = o.tribe_id
     WHERE o.id = ?`,
    [orderId]
  );
  if (!order) return null;
  const items = await db.all(
    `SELECT oi.id, oi.item_id, oi.quantity, oi.status, oi.updated_at,
            i.key AS item_key, i.emoji, i.product_type, i.image_path,
            COALESCE(t.name, t_de.name, i.key) AS item_name
     FROM order_items oi
     JOIN items i ON i.id = oi.item_id
     LEFT JOIN item_translations t ON t.item_id = i.id AND t.lang = ?
     LEFT JOIN item_translations t_de ON t_de.item_id = i.id AND t_de.lang = 'de'
     WHERE oi.order_id = ?
     ORDER BY oi.id`,
    [lang, orderId]
  );
  return { ...order, items };
}

function computeStatus(itemStatuses) {
  if (itemStatuses.length > 0 && itemStatuses.every((s) => s === 'issued')) return 'completed';
  if (itemStatuses.some((s) => s === 'issued')) return 'partially_issued';
  if (itemStatuses.some((s) => s === 'prepared')) return 'partially_prepared';
  return 'open';
}

async function recomputeOrderStatus(db, orderId) {
  const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (order.status === 'cancelled') return { order, justCompleted: false, previousStatus: order.status };
  const items = await db.all('SELECT status FROM order_items WHERE order_id = ?', [orderId]);
  const newStatus = computeStatus(items.map((i) => i.status));
  const previousStatus = order.status;
  const justCompleted = newStatus === 'completed' && previousStatus !== 'completed';
  const nowIso = new Date().toISOString();
  if (newStatus !== previousStatus) {
    if (justCompleted) {
      await db.run(`UPDATE orders SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`, [newStatus, nowIso, nowIso, orderId]);
    } else {
      await db.run(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`, [newStatus, nowIso, orderId]);
    }
  }
  return { order: await db.get('SELECT * FROM orders WHERE id = ?', [orderId]), justCompleted, previousStatus };
}

export async function createOrder(db, { tribeId, memberId, priority = 'normal', note, items }) {
  if (!Array.isArray(items) || items.length === 0) throw badRequest('Bestellung benötigt mindestens ein Item');
  if (items.length > 50) throw badRequest('Zu viele Positionen in einer Bestellung');

  return db.transaction(async (tx) => {
    const inserted = await tx.get(`INSERT INTO orders (tribe_id, member_id, priority, note) VALUES (?,?,?,?) RETURNING id`, [
      tribeId,
      memberId,
      priority,
      note || null,
    ]);
    const orderId = inserted.id;

    for (const it of items) {
      const item = await tx.get('SELECT id FROM items WHERE id = ? AND is_active = 1', [it.itemId]);
      if (!item) throw badRequest(`Unbekanntes oder inaktives Item (id ${it.itemId})`);
      await tx.run('INSERT INTO order_items (order_id, item_id, quantity) VALUES (?,?,?)', [orderId, it.itemId, it.quantity]);
    }

    await audit(tx, { tribeId, actorId: memberId, action: 'order_created', targetType: 'order', targetId: orderId });

    const staff = await tx.all(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       WHERE u.tribe_id = ? AND r.key IN ('breeder_crafter','admin') AND u.status = 'active' AND u.id != ?`,
      [tribeId, memberId]
    );
    for (const s of staff) await notify(tx, { userId: s.id, tribeId, type: 'order_created', payload: { orderId } });

    return getOrderWithItems(tx, orderId);
  });
}

export async function listOrders(db, user, { scope, tribeId: queryTribeId, lang = 'de' } = {}) {
  const isDeveloper = user.roles.includes('developer');
  const isAdmin = user.roles.includes('admin');
  const tribeId = isDeveloper ? queryTribeId || null : user.tribe_id;

  let sql = 'SELECT id FROM orders WHERE 1=1';
  const params = [];
  if (tribeId) {
    sql += ' AND tribe_id = ?';
    params.push(tribeId);
  }

  if (!isDeveloper && !isAdmin) {
    if (user.roles.includes('breeder_crafter') && scope !== 'own') {
      sql += " AND (member_id = ? OR assigned_to = ? OR (assigned_to IS NULL AND status NOT IN ('completed','cancelled')))";
      params.push(user.id, user.id);
    } else {
      sql += ' AND member_id = ?';
      params.push(user.id);
    }
  }

  if (scope === 'history') sql += " AND status IN ('completed','cancelled')";
  else if (scope === 'open') sql += " AND status NOT IN ('completed','cancelled')";

  sql += " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, created_at DESC";

  const ids = await db.all(sql, params);
  const orders = [];
  for (const row of ids) orders.push(await getOrderWithItems(db, row.id, lang));
  return orders;
}

export async function getOrderDetail(db, orderId, user, lang = 'de') {
  const order = await getScopedOrder(db, orderId, user);
  if (!canViewOrder(order, user)) throw forbidden('Du darfst diese Bestellung nicht einsehen');
  return getOrderWithItems(db, orderId, lang);
}

/**
 * Übernimmt eine offene Bestellung. Race-sicher durch ein einziges bedingtes UPDATE
 * (WHERE assigned_to IS NULL): Selbst wenn zwei Breeder gleichzeitig klicken, gewinnt
 * genau einer. Diese Atomarität kommt vom Datenbank-Engine (ein einzelnes UPDATE ist
 * immer atomar, sowohl in SQLite als auch in Postgres) - nicht von Node's
 * Ausführungsreihenfolge, und funktioniert deshalb unabhängig vom DB-Backend.
 */
export async function claimOrder(db, orderId, user) {
  return db.transaction(async (tx) => {
    const order = await getScopedOrder(tx, orderId, user);
    if (!user.roles.includes('breeder_crafter') && !user.roles.includes('admin') && !user.roles.includes('developer')) {
      throw forbidden('Nur Breeder/Crafter oder Admins können Bestellungen übernehmen');
    }
    if (['completed', 'cancelled'].includes(order.status)) {
      throw conflict('Bestellung ist bereits abgeschlossen oder storniert');
    }
    const nowIso = new Date().toISOString();
    const result = await tx.run(
      `UPDATE orders SET assigned_to = ?, updated_at = ?
       WHERE id = ? AND assigned_to IS NULL AND status NOT IN ('completed','cancelled')`,
      [user.id, nowIso, orderId]
    );
    if (result.changes === 0) {
      throw conflict('Diese Bestellung wurde soeben bereits von jemand anderem übernommen');
    }
    await audit(tx, { tribeId: order.tribe_id, actorId: user.id, action: 'order_claimed', targetType: 'order', targetId: orderId });
    await notify(tx, { userId: order.member_id, tribeId: order.tribe_id, type: 'order_claimed', payload: { orderId, by: user.username } });
    return getOrderWithItems(tx, orderId);
  });
}

export async function releaseOrder(db, orderId, user) {
  return db.transaction(async (tx) => {
    const order = await getScopedOrder(tx, orderId, user);
    if (!canManageOrder(order, user)) throw forbidden('Nur der zuständige Breeder/Crafter oder ein Admin darf freigeben');
    if (order.assigned_to === null) throw conflict('Bestellung ist aktuell niemandem zugewiesen');
    const nowIso = new Date().toISOString();
    await tx.run(`UPDATE orders SET assigned_to = NULL, updated_at = ? WHERE id = ?`, [nowIso, orderId]);
    await audit(tx, { tribeId: order.tribe_id, actorId: user.id, action: 'order_released', targetType: 'order', targetId: orderId });
    return getOrderWithItems(tx, orderId);
  });
}

export async function assignOrder(db, orderId, targetUserId, actingUser) {
  return db.transaction(async (tx) => {
    const order = await getScopedOrder(tx, orderId, actingUser);
    if (!actingUser.roles.includes('admin') && !actingUser.roles.includes('developer')) {
      throw forbidden('Nur Admins können Bestellungen manuell zuweisen');
    }
    if (['completed', 'cancelled'].includes(order.status)) throw conflict('Bestellung ist bereits abgeschlossen oder storniert');
    const target = await tx.get(`SELECT * FROM users WHERE id = ? AND tribe_id = ? AND status = 'active'`, [targetUserId, order.tribe_id]);
    if (!target) throw badRequest('Zielbenutzer nicht gefunden oder nicht aktiv in diesem Tribe');
    const targetRoles = await getUserRoles(tx, target.id);
    if (!targetRoles.includes('breeder_crafter') && !targetRoles.includes('admin')) {
      throw badRequest('Zielbenutzer ist weder Breeder/Crafter noch Admin');
    }
    const nowIso = new Date().toISOString();
    await tx.run(`UPDATE orders SET assigned_to = ?, updated_at = ? WHERE id = ?`, [target.id, nowIso, orderId]);
    await audit(tx, { tribeId: order.tribe_id, actorId: actingUser.id, action: 'order_assigned', targetType: 'order', targetId: orderId, meta: { to: target.id } });
    await notify(tx, { userId: target.id, tribeId: order.tribe_id, type: 'order_assigned', payload: { orderId } });
    return getOrderWithItems(tx, orderId);
  });
}

export async function updateItemStatus(db, orderId, orderItemId, newStatus, user) {
  if (!ORDER_ITEM_STATUSES.includes(newStatus)) throw badRequest('Ungültiger Item-Status');

  return db.transaction(async (tx) => {
    const order = await getScopedOrder(tx, orderId, user);
    if (!canManageOrder(order, user)) throw forbidden('Nur der zuständige Breeder/Crafter oder ein Admin darf den Status ändern');
    if (['completed', 'cancelled'].includes(order.status)) throw conflict('Bestellung ist bereits abgeschlossen oder storniert');

    const orderItem = await tx.get('SELECT * FROM order_items WHERE id = ? AND order_id = ?', [orderItemId, orderId]);
    if (!orderItem) throw notFound('Position nicht gefunden');

    const previousItemStatus = orderItem.status;
    const nowIso = new Date().toISOString();
    await tx.run(`UPDATE order_items SET status = ?, updated_at = ? WHERE id = ?`, [newStatus, nowIso, orderItemId]);

    if (newStatus === 'not_available') {
      await notify(tx, { userId: order.member_id, tribeId: order.tribe_id, type: 'item_not_available', payload: { orderId, orderItemId } });
    } else if (previousItemStatus === 'not_available') {
      await notify(tx, { userId: order.member_id, tribeId: order.tribe_id, type: 'item_available_again', payload: { orderId, orderItemId } });
    }

    const { order: updatedOrder, justCompleted, previousStatus } = await recomputeOrderStatus(tx, orderId);

    if (justCompleted) {
      await notify(tx, { userId: order.member_id, tribeId: order.tribe_id, type: 'order_completed', payload: { orderId } });
      if (order.assigned_to) await notify(tx, { userId: order.assigned_to, tribeId: order.tribe_id, type: 'order_completed', payload: { orderId } });
      await audit(tx, { tribeId: order.tribe_id, actorId: user.id, action: 'order_completed', targetType: 'order', targetId: orderId });
    } else if (updatedOrder.status === 'partially_prepared' && previousStatus !== 'partially_prepared') {
      await notify(tx, { userId: order.member_id, tribeId: order.tribe_id, type: 'order_partially_prepared', payload: { orderId } });
    } else if (updatedOrder.status === 'partially_issued' && previousStatus !== 'partially_issued') {
      await notify(tx, { userId: order.member_id, tribeId: order.tribe_id, type: 'order_partially_issued', payload: { orderId } });
    }

    await audit(tx, {
      tribeId: order.tribe_id,
      actorId: user.id,
      action: 'order_item_status_changed',
      targetType: 'order_item',
      targetId: orderItemId,
      meta: { status: newStatus },
    });

    return getOrderWithItems(tx, orderId);
  });
}

/**
 * Löscht eine Bestellung endgültig (inkl. Positionen und Kommentaren).
 *
 * Abgrenzung zum Stornieren: Stornieren behält die Bestellung als Beleg im
 * System, Löschen entfernt sie ganz - gedacht für Fehleingaben und Aufräumen.
 * Rechte bewusst wie beim Stornieren: der Ersteller darf seine eigene Bestellung
 * löschen, ein Admin alle innerhalb SEINES Tribes (getScopedOrder erzwingt das
 * serverseitig), ein Developer plattformweit gemäß bestehendem Rollenmodell.
 */
export async function deleteOrder(db, orderId, user) {
  return db.transaction(async (tx) => {
    const order = await getScopedOrder(tx, orderId, user);
    const isOwner = order.member_id === user.id;
    const isStaff = user.roles.includes('admin') || user.roles.includes('developer');
    if (!isOwner && !isStaff) throw forbidden('Nur der Ersteller oder ein Admin kann diese Bestellung löschen');

    // Abhängige Daten zuerst entfernen: order_items und Kommentare hängen per
    // Fremdschlüssel an der Bestellung.
    await tx.run('DELETE FROM order_comments WHERE order_id = ?', [orderId]);
    await tx.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await tx.run('DELETE FROM orders WHERE id = ?', [orderId]);
    await audit(tx, { tribeId: order.tribe_id, actorId: user.id, action: 'order_deleted', targetType: 'order', targetId: orderId });
  });
}

export async function cancelOrder(db, orderId, user) {
  return db.transaction(async (tx) => {
    const order = await getScopedOrder(tx, orderId, user);
    const isOwner = order.member_id === user.id;
    const isStaff = user.roles.includes('admin') || user.roles.includes('developer');
    if (!isOwner && !isStaff) throw forbidden('Nur der Ersteller oder ein Admin kann diese Bestellung stornieren');
    if (order.status === 'completed') throw conflict('Abgeschlossene Bestellungen können nicht mehr storniert werden');
    if (order.status === 'cancelled') throw conflict('Bestellung ist bereits storniert');

    const nowIso = new Date().toISOString();
    await tx.run(`UPDATE orders SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?`, [nowIso, nowIso, orderId]);
    await audit(tx, { tribeId: order.tribe_id, actorId: user.id, action: 'order_cancelled', targetType: 'order', targetId: orderId });

    if (order.assigned_to && order.assigned_to !== user.id) {
      await notify(tx, { userId: order.assigned_to, tribeId: order.tribe_id, type: 'order_cancelled', payload: { orderId } });
    }
    const admins = await tx.all(
      `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       WHERE u.tribe_id = ? AND r.key = 'admin' AND u.id != ?`,
      [order.tribe_id, user.id]
    );
    for (const a of admins) await notify(tx, { userId: a.id, tribeId: order.tribe_id, type: 'order_cancelled', payload: { orderId } });

    return getOrderWithItems(tx, orderId);
  });
}

export async function addComment(db, orderId, user, body) {
  return db.transaction(async (tx) => {
    const order = await getScopedOrder(tx, orderId, user);
    if (!canAccessComments(order, user)) throw forbidden('Du hast keinen Zugriff auf diese Bestellung');

    const inserted = await tx.get('INSERT INTO order_comments (order_id, author_id, body) VALUES (?,?,?) RETURNING *', [orderId, user.id, body]);
    await audit(tx, { tribeId: order.tribe_id, actorId: user.id, action: 'comment_created', targetType: 'order', targetId: orderId });

    const recipients = new Set();
    if (order.member_id !== user.id) recipients.add(order.member_id);
    if (order.assigned_to && order.assigned_to !== user.id) recipients.add(order.assigned_to);
    for (const uid of recipients) await notify(tx, { userId: uid, tribeId: order.tribe_id, type: 'new_comment', payload: { orderId } });

    return inserted;
  });
}

export async function listComments(db, orderId, user) {
  const order = await getScopedOrder(db, orderId, user);
  if (!canAccessComments(order, user)) throw forbidden('Du hast keinen Zugriff auf diese Bestellung');
  return db.all(
    `SELECT oc.id, oc.body, oc.created_at, oc.author_id, u.username AS author_username
     FROM order_comments oc JOIN users u ON u.id = oc.author_id
     WHERE oc.order_id = ? ORDER BY oc.created_at ASC`,
    [orderId]
  );
}
