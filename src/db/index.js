/**
 * Einziger Einstiegspunkt für die Datenbankverbindung.
 *
 * - Lokale Entwicklung (kein DATABASE_URL): SQLite-Datei, node:sqlite, keine
 *   externe Abhängigkeit. Genau das Setup, das schon die ganze Zeit läuft.
 * - Gehostet mit gesetztem DATABASE_URL (z.B. Render Postgres): echte,
 *   dauerhafte Datenbank. Wird erst HIER und NUR dann aktiv - das "pg"-Paket
 *   wird nie geladen, wenn DATABASE_URL fehlt, damit die lokale Entwicklung
 *   weiterhin ohne npm install auskommt.
 *
 * Beide Implementierungen (sqliteClient.js / pgClient.js) erfüllen exakt
 * dieselbe async Schnittstelle (get/all/run/transaction/close/kind), Services
 * und Routen kennen den Unterschied nicht.
 */
import { config } from '../config.js';

export async function openDatabase(overrides = {}) {
  const databaseUrl = overrides.databaseUrl ?? config.databaseUrl;
  if (databaseUrl) {
    const { openDatabase: openPg } = await import('./pgClient.js');
    return openPg(databaseUrl);
  }
  const { openDatabase: openSqlite } = await import('./sqliteClient.js');
  return openSqlite(overrides.dbPath ?? config.dbPath);
}
