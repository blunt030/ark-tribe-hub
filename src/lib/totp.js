// Zeitbasierte Einmal-Codes (TOTP, RFC 6238) fuer Authenticator-Apps.
// SHA-1, 6 Ziffern, 30-Sekunden-Schritt: der Standard, den alle gaengigen Apps
// (Google/Microsoft Authenticator, Authy, 1Password ...) unterstuetzen.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = h[h.length - 1] & 15;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * Prueft einen Code mit +/- einem Zeitschritt Toleranz (Uhrabweichung).
 * Liefert den verwendeten Zaehler zurueck (Schutz vor Wiederverwendung) oder null.
 */
export function verifyTotp(secret, code, { now = Date.now(), lastCounter = null } = {}) {
  const normalized = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const current = Math.floor(now / 30000);
  for (const delta of [0, -1, 1]) {
    const counter = current + delta;
    if (lastCounter != null && counter <= Number(lastCounter)) continue;
    const expected = Buffer.from(totpCode(secret, counter));
    if (timingSafeEqual(expected, Buffer.from(normalized))) return counter;
  }
  return null;
}

export function otpauthUrl({ secret, account, issuer = 'ARK Tribe Hub' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
