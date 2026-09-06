import { badRequest, notFound } from '../lib/http.js';
import { audit } from './auditService.js';
import { notify } from './notificationService.js';

export const TASK_PRIORITIES = ['normal', 'high', 'urgent'];
export const TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'];

async function scopedTask(db, id, tribeId) {
  const row = await db.get('SELECT * FROM tasks WHERE id = ? AND tribe_id = ?', [id, tribeId]);
  if (!row) throw notFound('Aufgabe nicht gefunden');
  return row;
}

export async function listTasks(db, tribeId, { status, assigneeId } = {}) {
  let sql = 'SELECT * FROM tasks WHERE tribe_id = ?';
  const params = [tribeId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (assigneeId) { sql += ' AND assignee_id = ?'; params.push(assigneeId); }
  sql += ' ORDER BY CASE priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 ELSE 2 END, due_date IS NULL, due_date, created_at DESC LIMIT 500';
  return db.all(sql, params);
}

export async function getTask(db, id, tribeId) {
  const task = await scopedTask(db, id, tribeId);
  const comments = await db.all(
    `SELECT c.*, COALESCE(u.username, '—') AS author_name FROM task_comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.created_at`,
    [id]
  );
  return { ...task, comments };
}

function validateInput(body) {
  const title = body.title?.trim();
  if (!title) throw badRequest('Titel fehlt');
  if (body.priority && !TASK_PRIORITIES.includes(body.priority)) throw badRequest('Ungültige Priorität');
  if (body.status && !TASK_STATUSES.includes(body.status)) throw badRequest('Ungültiger Status');
  return {
    title,
    description: body.description?.trim() || null,
    assigneeId: body.assigneeId || null,
    priority: body.priority || 'normal',
    status: body.status || 'open',
    dueDate: body.dueDate?.trim() || null,
  };
}

/**
 * Der Zustaendige muss ein AKTIVES Mitglied desselben Tribes sein. Ohne diese
 * Pruefung koennte ein Nutzer eine Benutzer-ID aus einem fremden Tribe eintragen -
 * die Aufgabe waere dann quer zugewiesen und die daraus erzeugte Benachrichtigung
 * ginge an einen tribefremden Empfaenger.
 */
async function assigneePruefen(db, tribeId, assigneeId) {
  if (!assigneeId) return;
  const user = await db.get(
    "SELECT id FROM users WHERE id = ? AND tribe_id = ? AND status = 'active'",
    [assigneeId, tribeId]
  );
  if (!user) throw badRequest('Zuständige Person gehört nicht zu diesem Tribe');
}

export async function createTask(db, tribeId, body, actorId) {
  const v = validateInput(body);
  return db.transaction(async (tx) => {
    await assigneePruefen(tx, tribeId, v.assigneeId);
    const inserted = await tx.get(
      'INSERT INTO tasks (tribe_id, title, description, assignee_id, priority, status, due_date, created_by) VALUES (?,?,?,?,?,?,?,?) RETURNING *',
      [tribeId, v.title, v.description, v.assigneeId, v.priority, v.status, v.dueDate, actorId]
    );
    await audit(tx, { tribeId, actorId, action: 'task_created', targetType: 'task', targetId: inserted.id, meta: { title: v.title } });
    if (v.assigneeId && v.assigneeId !== actorId) {
      await notify(tx, { userId: v.assigneeId, tribeId, type: 'task_assigned', payload: { taskId: inserted.id, title: v.title } });
    }
    return inserted;
  });
}

export async function updateTask(db, id, tribeId, body, actorId) {
  const v = validateInput(body);
  const nowIso = new Date().toISOString();
  return db.transaction(async (tx) => {
    const before = await scopedTask(tx, id, tribeId);
    await assigneePruefen(tx, tribeId, v.assigneeId);
    await tx.run(
      'UPDATE tasks SET title=?, description=?, assignee_id=?, priority=?, status=?, due_date=?, updated_at=? WHERE id = ?',
      [v.title, v.description, v.assigneeId, v.priority, v.status, v.dueDate, nowIso, id]
    );
    await audit(tx, { tribeId, actorId, action: 'task_updated', targetType: 'task', targetId: id });

    if (v.assigneeId && v.assigneeId !== before.assignee_id && v.assigneeId !== actorId) {
      await notify(tx, { userId: v.assigneeId, tribeId, type: 'task_assigned', payload: { taskId: id, title: v.title } });
    }
    if (v.status !== before.status && before.assignee_id && before.assignee_id !== actorId) {
      await notify(tx, { userId: before.assignee_id, tribeId, type: 'task_status_changed', payload: { taskId: id, title: v.title, status: v.status } });
    }
    return tx.get('SELECT * FROM tasks WHERE id = ?', [id]);
  });
}

export async function deleteTask(db, id, tribeId, actorId) {
  return db.transaction(async (tx) => {
    const row = await scopedTask(tx, id, tribeId);
    await tx.run('DELETE FROM tasks WHERE id = ?', [id]); // Kommentare fallen per ON DELETE CASCADE mit weg
    await audit(tx, { tribeId, actorId, action: 'task_deleted', targetType: 'task', targetId: id, meta: { title: row.title } });
  });
}

export async function addComment(db, taskId, tribeId, body, actorId) {
  const text = body.body?.trim();
  if (!text) throw badRequest('Kommentartext fehlt');
  return db.transaction(async (tx) => {
    const task = await scopedTask(tx, taskId, tribeId);
    const inserted = await tx.get(
      'INSERT INTO task_comments (task_id, author_id, body) VALUES (?,?,?) RETURNING *',
      [taskId, actorId, text]
    );
    if (task.assignee_id && task.assignee_id !== actorId) {
      await notify(tx, { userId: task.assignee_id, tribeId, type: 'task_comment', payload: { taskId, title: task.title } });
    }
    return inserted;
  });
}
