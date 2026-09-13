import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { badRequest } from './http.js';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MiB
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 20_000_000;
const ALLOWED = {
  'image/png': { ext: 'png', magic: (b) => b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', magic: (b) => b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b.at(-2) === 0xff && b.at(-1) === 0xd9 },
  'image/webp': {
    ext: 'webp',
    magic: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
};

function imageDimensions(buffer, mimeType) {
  if (mimeType === 'image/png') {
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (mimeType === 'image/jpeg') {
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      while (buffer[offset] === 0xff) offset++;
      const marker = buffer[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) return null;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) return null;
      if (sofMarkers.has(marker)) {
        if (length < 7) return null;
        return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
      }
      offset += length;
    }
    return null;
  }

  if (mimeType === 'image/webp') {
    if (buffer.length < 30 || buffer.readUInt32LE(4) + 8 !== buffer.length) return null;
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
    }
    if (chunk === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
      return {
        width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
        height: 1 + ((buffer[22] & 0xc0) >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10),
      };
    }
  }
  return null;
}

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

  const dataUrl = base64.match(/^data:([^;,]+);base64,(.*)$/s);
  if (base64.startsWith('data:') && !dataUrl) throw badRequest('Ungültige Bilddaten');
  if (dataUrl && dataUrl[1].toLowerCase() !== mimeType) throw badRequest('Bildinhalt passt nicht zum angegebenen Dateityp');
  const cleaned = (dataUrl ? dataUrl[2] : base64).replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) throw badRequest('Ungültige Bilddaten');
  if (cleaned.length > MAX_IMAGE_BYTES * 1.4) throw badRequest('Bild ist zu groß (max. 3 MB)');

  let buffer;
  try {
    buffer = Buffer.from(cleaned, 'base64');
  } catch {
    throw badRequest('Ungültige Bilddaten');
  }
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw badRequest('Bild ist zu groß oder leer (max. 3 MB)');

  const rule = ALLOWED[mimeType];
  if (!rule.magic(buffer)) {
    throw badRequest('Bildinhalt passt nicht zum angegebenen Dateityp');
  }

  const dimensions = imageDimensions(buffer, mimeType);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    throw badRequest('Bilddatei ist beschädigt oder unvollständig');
  }
  if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION || dimensions.width * dimensions.height > MAX_PIXELS) {
    throw badRequest('Bildabmessungen sind zu groß');
  }

  return { buffer, ext: rule.ext, mimeType, width: dimensions.width, height: dimensions.height };
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
