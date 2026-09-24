import { scrypt, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const OPTIONS = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const PREFIX = 'scrypt-v2';
const validPassword = value => typeof value === 'string' && value.length > 0 && value.length <= 200;

// OWASP scrypt profile: 16 MiB, p=5. Explicit version allows safe legacy upgrades.
export async function hashPassword(password) {
  if (!validPassword(password)) throw new TypeError('Invalid password');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, OPTIONS);
  return `${PREFIX}:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (!validPassword(password) || typeof stored !== 'string') return false;
  const modern = stored.startsWith(`${PREFIX}:`);
  const parts = stored.split(':');
  if (parts.length !== (modern ? 3 : 2)) return false;
  const [salt, hash] = modern ? parts.slice(1) : parts;
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const key = await derive(password, salt, 64, modern ? OPTIONS : {});
  return timingSafeEqual(Buffer.from(hash, 'hex'), key);
}
export const needsPasswordRehash = stored => !stored.startsWith(`${PREFIX}:`);
export function hashPasswordSync(password) {
  if (!validPassword(password)) throw new TypeError('Invalid password');
  const salt = randomBytes(16).toString('hex');
  return `${PREFIX}:${salt}:${scryptSync(password, salt, 64, OPTIONS).toString('hex')}`;
}
