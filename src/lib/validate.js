import { badRequest } from './http.js';

export function requireString(value, fieldName, { min = 1, max = 500 } = {}) {
  if (typeof value !== 'string') throw badRequest(`Feld "${fieldName}" muss ein Text sein`, 'VALIDATION_ERROR');
  const trimmed = value.trim();
  if (trimmed.length < min) throw badRequest(`Feld "${fieldName}" ist zu kurz`, 'VALIDATION_ERROR');
  if (trimmed.length > max) throw badRequest(`Feld "${fieldName}" ist zu lang (max. ${max} Zeichen)`, 'VALIDATION_ERROR');
  return trimmed;
}

export function optionalString(value, fieldName, opts = {}) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, fieldName, opts);
}

export function requireOneOf(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw badRequest(`Feld "${fieldName}" muss einer von [${allowed.join(', ')}] sein`, 'VALIDATION_ERROR');
  }
  return value;
}

export function requirePositiveInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw badRequest(`Feld "${fieldName}" muss eine positive Ganzzahl sein`, 'VALIDATION_ERROR');
  }
  return n;
}

/** Wandelt einen URL-Parameter sicher in eine positive Ganzzahl-ID um (blockt manipulierte/nicht-numerische IDs). */
export function parseIdParam(raw, fieldName = 'id') {
  if (!/^\d+$/.test(String(raw))) {
    throw badRequest(`Ungültige ${fieldName}`, 'VALIDATION_ERROR');
  }
  return parseInt(raw, 10);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function requireEmail(value, fieldName = 'email') {
  const trimmed = requireString(value, fieldName, { min: 3, max: 254 });
  if (!EMAIL_RE.test(trimmed)) throw badRequest('Ungültige E-Mail-Adresse', 'VALIDATION_ERROR');
  return trimmed.toLowerCase();
}

export function requirePassword(value) {
  if (typeof value !== 'string' || value.length < 8) {
    throw badRequest('Passwort muss mindestens 8 Zeichen lang sein', 'VALIDATION_ERROR');
  }
  if (value.length > 200) {
    throw badRequest('Passwort ist zu lang', 'VALIDATION_ERROR');
  }
  return value;
}
