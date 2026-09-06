import { badRequest, notFound } from '../lib/http.js';
import { audit } from './auditService.js';

async function scopedChannel(db, id, tribeId) {
  const row = await db.get('SELECT * FROM voice_channels WHERE id = ? AND tribe_id = ?', [id, tribeId]);
  if (!row) throw notFound('Kanal nicht gefunden');
  return row;
}

export async function listChannels(db, tribeId) {
  const channels = await db.all('SELECT * FROM voice_channels WHERE tribe_id = ? ORDER BY name', [tribeId]);
  const withParticipants = [];
  for (const ch of channels) {
    const participants = await db.all(
      `SELECT vp.user_id, vp.is_muted, vp.joined_at, u.username
       FROM voice_participants vp JOIN users u ON u.id = vp.user_id
       WHERE vp.channel_id = ? ORDER BY vp.joined_at`,
      [ch.id]
    );
    withParticipants.push({ ...ch, participants });
  }
  return withParticipants;
}

export async function createChannel(db, tribeId, body, actorId) {
  const name = body.name?.trim();
  if (!name) throw badRequest('Kanalname fehlt');
  return db.transaction(async (tx) => {
    const inserted = await tx.get(
      'INSERT INTO voice_channels (tribe_id, name, created_by) VALUES (?,?,?) RETURNING *',
      [tribeId, name, actorId]
    );
    await audit(tx, { tribeId, actorId, action: 'voice_channel_created', targetType: 'voice_channel', targetId: inserted.id, meta: { name } });
    return { ...inserted, participants: [] };
  });
}

export async function deleteChannel(db, id, tribeId, actorId) {
  return db.transaction(async (tx) => {
    const row = await scopedChannel(tx, id, tribeId);
    await tx.run('DELETE FROM voice_channels WHERE id = ?', [id]); // Teilnehmer fallen per ON DELETE CASCADE mit weg
    await audit(tx, { tribeId, actorId, action: 'voice_channel_deleted', targetType: 'voice_channel', targetId: id, meta: { name: row.name } });
  });
}

/** Ein Nutzer ist immer nur in höchstens einem Kanal gleichzeitig "drin" - Beitritt
 *  zu einem neuen Kanal verlässt automatisch einen etwaigen vorherigen, genau wie
 *  man es aus echten Voice-Chat-Programmen kennt. */
export async function joinChannel(db, channelId, tribeId, userId) {
  await scopedChannel(db, channelId, tribeId);
  return db.transaction(async (tx) => {
    await tx.run('DELETE FROM voice_participants WHERE tribe_id = ? AND user_id = ?', [tribeId, userId]);
    await tx.run(
      'INSERT INTO voice_participants (channel_id, tribe_id, user_id, is_muted) VALUES (?,?,?,0)',
      [channelId, tribeId, userId]
    );
  });
}

export async function leaveChannel(db, channelId, tribeId, userId) {
  await scopedChannel(db, channelId, tribeId);
  await db.run('DELETE FROM voice_participants WHERE channel_id = ? AND user_id = ?', [channelId, userId]);
}

export async function setMuted(db, channelId, tribeId, userId, muted) {
  await scopedChannel(db, channelId, tribeId);
  const result = await db.run(
    'UPDATE voice_participants SET is_muted = ? WHERE channel_id = ? AND user_id = ?',
    [muted ? 1 : 0, channelId, userId]
  );
  if (result.changes === 0) throw badRequest('Du bist nicht in diesem Kanal');
}
