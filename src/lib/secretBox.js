// Verschluesselung fuer gespeicherte Geheimnisse (2FA-Schluessel, Webhooks).
// Gleiches Verfahren wie beim Vault-PIN (AES-256-GCM, Schluessel aus SESSION_SECRET).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const key = createHash('sha256').update(config.sessionSecret).digest();

export function sealSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function openSecret(value) {
  if (!value) return null;
  try {
    const [version, iv, tag, encrypted] = String(value).split(':');
    if (version !== 'v1') return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
