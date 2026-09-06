/**
 * Zentrale Aufbereitung von Benutzerdaten für API-Antworten.
 *
 * Grund: Mehrere Routen luden Benutzer mit "SELECT * FROM users" und gaben das
 * Ergebnis per { ...user } direkt aus. Damit landeten password_hash und
 * email_verify_token in den Antworten - ein Admin konnte die Passwort-Hashes
 * aller Tribe-Mitglieder auslesen und mit dem Verifizierungs-Token fremde
 * E-Mail-Adressen bestätigen.
 *
 * Bewusst als POSITIVLISTE ("allowlist") umgesetzt, nicht als Sperrliste:
 * Kommt später eine neue geheime Spalte in die users-Tabelle, ist sie damit
 * automatisch ausgeschlossen, statt erst nach einem Vorfall nachgetragen zu
 * werden. Das ist der entscheidende Unterschied - eine Sperrliste vergisst man.
 */

/** Felder, die jeder sehen darf, der den Benutzer überhaupt sehen darf. */
const OEFFENTLICH = ['id', 'username', 'tribe_id', 'avatar_path'];

/** Zusätzliche Felder für den Benutzer selbst bzw. für Verwaltungsansichten. */
const VERWALTUNG = [
  'email',
  'email_verified',
  'status',
  'server',
  'map',
  'vault',
  'created_at',
  'updated_at',
];

/** NIEMALS ausliefern - dient nur der Dokumentation und dem Test unten. */
export const GEHEIME_FELDER = [
  'password_hash',
  'email_verify_token',
  'email_verify_expires_at',
];

function auswaehlen(user, felder) {
  const out = {};
  for (const f of felder) {
    if (user && Object.prototype.hasOwnProperty.call(user, f)) out[f] = user[f];
  }
  return out;
}

/**
 * Minimale Darstellung - für Listen, in denen andere Benutzer nur benannt werden
 * (Kommentarautor, Zuständiger, Besitzer eines Dinos ...).
 */
export function serializeUserPublic(user, extra = {}) {
  if (!user) return null;
  return { ...auswaehlen(user, OEFFENTLICH), ...extra };
}

/**
 * Vollständige Darstellung für Verwaltungsansichten (Admin-Mitgliederliste,
 * Developer-Benutzerliste) und für den eigenen Profilabruf. Enthält bewusst
 * KEINE Authentifizierungsgeheimnisse.
 */
export function serializeUserAdmin(user, extra = {}) {
  if (!user) return null;
  return { ...auswaehlen(user, [...OEFFENTLICH, ...VERWALTUNG]), ...extra };
}
