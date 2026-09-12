import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import { config } from '../config.js';
import { badRequest } from '../lib/http.js';

const key = createHash('sha256').update(config.sessionSecret).digest();

export function generateAccessPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function validateAccessPin(pin) {
  const normalized = String(pin ?? '').trim();
  if (!/^\d{6}$/.test(normalized)) throw badRequest('Der Personal-PIN muss genau 6 Ziffern haben');
  return normalized;
}

export function encryptAccessPin(pin) {
  const normalized = validateAccessPin(pin);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptAccessPin(value) {
  if (!value) return null;
  try {
    const [version, iv, tag, encrypted] = String(value).split(':');
    if (version !== 'v1' || !iv || !tag || !encrypted) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
