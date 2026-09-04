import { scrypt, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

// Format: "<salt-hex>:<derivedkey-hex>". Niemals das Klartextpasswort speichern.

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, KEY_LEN);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const derivedKey = await scryptAsync(password, salt, KEY_LEN);
  const storedBuf = Buffer.from(hashHex, 'hex');
  if (storedBuf.length !== derivedKey.length) return false;
  return timingSafeEqual(storedBuf, derivedKey);
}

/** Synchrone Variante – ausschließlich für den Seed-Vorgang beim Serverstart (einmalig, unkritisch). */
export function hashPasswordSync(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, KEY_LEN);
  return `${salt}:${derivedKey.toString('hex')}`;
}
