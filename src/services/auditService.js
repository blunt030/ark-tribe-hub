export async function audit(db, { tribeId = null, actorId = null, action, targetType = null, targetId = null, meta = null }) {
  await db.run(
    `INSERT INTO audit_logs (tribe_id, actor_id, action, target_type, target_id, meta) VALUES (?,?,?,?,?,?)`,
    [tribeId, actorId, action, targetType, targetId, meta ? JSON.stringify(meta) : null]
  );
}

export async function listAuditLogs(db, { tribeId, limit = 100 } = {}) {
  const rows = tribeId
    ? await db.all('SELECT * FROM audit_logs WHERE tribe_id = ? ORDER BY created_at DESC LIMIT ?', [tribeId, limit])
    : await db.all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?', [limit]);
  return rows.map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
}
