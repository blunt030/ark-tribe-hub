import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { badRequest } from './http.js';

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED = {
  'image/png': { ext: 'png', magic: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/jpeg': { ext: 'jpg', magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': {
    ext: 'webp',
    magic: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
};

/**
 * Validiert ein Base64-kodiertes Bild und liefert die rohen Bytes zurück - schreibt
 * NICHTS auf die Platte. Das Speichern selbst ist absichtlich getrennt (siehe
 * saveImageToDisk / DB-Blob in den Routen), weil WO ein Bild landet vom
 * DB-Backend abhängt: lokal auf der Festplatte (SQLite-Entwicklung), oder als
 * Blob in der Datenbank (Postgres-Hosting ohne persistente Festplatte, z.B. Render
 * Free Tier - dort würde eine Datei auf der Platte den nächsten Neustart nicht
 * überleben, ein DB-Blob schon).
 *
 * - Größe wird VOR dem Decodieren grob geprüft, danach exakt.
 * - Der behauptete MIME-Type wird gegen die tatsächlichen Magic Bytes der Datei geprüft
 *   (verhindert z.B. eine als "image/png" deklarierte ausführbare Datei).
 */
export function validateImage({ base64, mimeType }) {
  if (typeof base64 !== 'string' || !base64) throw badRequest('Kein Bild übermittelt');
  if (!ALLOWED[mimeType]) throw badRequest('Nicht erlaubter Bildtyp (erlaubt: PNG, JPEG, WEBP)');

  const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
  if (cleaned.length > MAX_BYTES * 1.4) throw badRequest('Bild ist zu groß (max. 3 MB)');

  let buffer;
  try {
    buffer = Buffer.from(cleaned, 'base64');
  } catch {
    throw badRequest('Ungültige Bilddaten');
  }
  if (buffer.length === 0 || buffer.length > MAX_BYTES) throw badRequest('Bild ist zu groß oder leer (max. 3 MB)');

  const rule = ALLOWED[mimeType];
  if (!rule.magic(buffer)) {
    throw badRequest('Bildinhalt passt nicht zum angegebenen Dateityp');
  }

  return { buffer, ext: rule.ext, mimeType };
}

/**
 * Schreibt validierte Bild-Bytes auf die lokale Festplatte (SQLite-Betrieb).
 * Dateiname ist bewusst <ownerId>.<ext> statt einer zufälligen UUID: ein neuer
 * Upload ersetzt so automatisch den alten statt eine verwaiste Datei zu
 * hinterlassen, und der Pfad bleibt über einen erneuten Upload hinweg stabil.
 * Path Traversal ist trotzdem ausgeschlossen, weil ownerId immer eine geprüfte
 * Ganzzahl ist (siehe parseIdParam/req.user.id) und isSafeUploadFilename beim
 * Ausliefern zusätzlich validiert.
 */
export function saveImageToDisk({ buffer, ext, uploadDir, subdir, ownerId }) {
  const dir = path.join(uploadDir, subdir);
  mkdirSync(dir, { recursive: true });
  const filename = `${ownerId}.${ext}`;
  writeFileSync(path.join(dir, filename), buffer);
  return `${subdir}/${filename}`;
}

/** Validiert, dass ein angeforderter Dateiname innerhalb des Upload-Ordners bleibt (kein "../"). */
export function isSafeUploadFilename(name) {
  return /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(name);
}
