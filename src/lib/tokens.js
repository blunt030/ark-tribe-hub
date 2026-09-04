import { randomBytes, createHash, createHmac, randomUUID } from 'node:crypto';

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function hmac(secret, input) {
  return createHmac('sha256', secret).update(input).digest('hex');
}

export { randomUUID };
