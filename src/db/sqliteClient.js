import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Öffnet (oder erstellt) die lokale SQLite-Datenbank und wendet das Schema an.
 * Nutzt Node's eingebautes node:sqlite - keine externe Abhängigkeit nötig.
 *
 * Die öffentliche Schnittstelle (get/all/run/transaction) ist ASYNC (liefert
 * Promises), obwohl node:sqlite selbst synchron arbeitet. Das ist bewusst so:
 * Für den Hosting-Betrieb kommt daneben ein Postgres-Client (pgClient.js) mit
 * exakt derselben Schnittstelle zum Einsatz, der zwingend asynchron ist (echte
 * Netzwerk-Anfragen). Die gesamte Anwendung (Services/Routen) ruft db.get/all/run
 * deshalb einheitlich mit await auf - lokal bei der Entwicklung genau wie in
 * Produktion, ohne zwei verschiedene Programmiermodelle pflegen zu müssen.
 */
export async function openDatabase(dbPath) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  const client = new SqliteClient(db);
  await runMigrations(client);
  return client;
}

class SqliteClient {
  constructor(raw) {
    this.raw = raw;
    this.kind = 'sqlite';
    this._queue = Promise.resolve();
  }

  async all(sql, params = []) {
    return this.raw.prepare(sql).all(...params);
  }

  async get(sql, params = []) {
    return this.raw.prepare(sql).get(...params);
  }

  async run(sql, params = []) {
    const result = this.raw.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  /**
   * Führt fn(tx) in einer Transaktion aus (Commit bei Erfolg, Rollback bei Fehler).
   * fn darf async sein und muss mit await auf tx.get/all/run zugreifen.
   *
   * WICHTIG: Transaktionen werden auf dieser gemeinsam genutzten Verbindung explizit
   * seriell in eine Warteschlange gestellt (this._queue). Vorher garantierte Node's
   * rein synchrone Ausführung automatisch, dass zwei Request-Handler nie mitten in
   * einer Transaktion verschachtelt laufen konnten. Durch async/await (nötig, damit
   * dieselbe Schnittstelle auch für den Postgres-Client gilt) ist das nicht mehr
   * automatisch garantiert - eine zweite Transaktion auf derselben Verbindung könnte
   * sonst mit "cannot start a transaction within a transaction" fehlschlagen, statt
   * sauber auf den ersten Abschluss zu warten. Die Warteschlange macht genau das
   * explizit, was vorher implizit durch Single-Threading galt.
   */
  transaction(fn) {
    const run = async () => {
      this.raw.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(this);
        this.raw.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          this.raw.exec('ROLLBACK');
        } catch {
          /* Rollback-Fehler ignorieren, der ursprüngliche Fehler ist wichtiger */
        }
        throw err;
      }
    };
    const result = this._queue.then(run, run);
    // Folgefehler dürfen die Warteschlange nicht dauerhaft blockieren.
    this._queue = result.catch(() => {});
    return result;
  }

  async close() {
    this.raw.close();
  }
}
