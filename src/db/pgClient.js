import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Wandelt "?"-Platzhalter (SQLite-Stil, wie im gesamten restlichen Code verwendet)
 * in Postgres-Stil ($1, $2, ...) um. So können Services/Routen exakt dieselben
 * SQL-Strings wie beim lokalen SQLite-Client verwenden - dieser Client ist der
 * EINZIGE Ort, der den Dialektunterschied kennen muss.
 *
 * Respektiert einfache Anführungszeichen, damit ein literales "?" innerhalb eines
 * String-Literals (kommt im aktuellen Code nicht vor, aber zur Sicherheit) nicht
 * versehentlich als Platzhalter gezählt wird.
 */
function toPgQuery(sql) {
  let out = '';
  let n = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") inString = !inString;
    if (ch === '?' && !inString) {
      n += 1;
      out += `$${n}`;
    } else {
      out += ch;
    }
  }
  return out;
}

async function loadPg() {
  try {
    return await import('pg');
  } catch (err) {
    throw new Error(
      'Das npm-Paket "pg" ist nicht installiert, wird aber für DATABASE_URL (Postgres) benötigt. ' +
        'Auf Render wird es beim Deploy automatisch über package.json installiert. ' +
        `Ursprünglicher Fehler: ${err.message}`
    );
  }
}

/**
 * Öffnet eine Postgres-Verbindung (Connection Pool) und wendet das Postgres-Schema an.
 * Wird nur aufgerufen, wenn DATABASE_URL gesetzt ist (siehe db/index.js) - lokal ohne
 * diese Umgebungsvariable wird "pg" nie importiert, das Zero-Dependency-Setup für die
 * lokale Entwicklung bleibt dadurch unangetastet.
 */
export async function openDatabase(connectionString) {
  const pgModule = await loadPg();
  const { Pool } = pgModule.default ?? pgModule;

  // Render (und die meisten gehosteten Postgres-Anbieter) verlangen SSL, stellen aber
  // kein Zertifikat aus einer öffentlich bekannten Root-CA aus, das Node ohne Weiteres
  // prüfen kann - rejectUnauthorized:false ist der übliche, von Render selbst so
  // dokumentierte Weg. Über PGSSL=disable lässt sich das für einen lokalen Postgres
  // ohne SSL (z.B. in Docker) explizit abschalten.
  const sslMode = process.env.PGSSL || 'require';
  const pool = new Pool({
    connectionString,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: false },
    max: 10,
  });

  // Verbindung sofort prüfen, damit ein falsch konfiguriertes DATABASE_URL beim
  // Start klar auffällt statt erst bei der ersten Anfrage eines Nutzers.
  await pool.query('SELECT 1');

  const schema = readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf8');
  await pool.query(schema);

  return new PgClient(pool);
}

class PgClient {
  constructor(pool) {
    this.pool = pool;
    this.kind = 'postgres';
  }

  async all(sql, params = []) {
    const result = await this.pool.query(toPgQuery(sql), params);
    return result.rows;
  }

  async get(sql, params = []) {
    const result = await this.pool.query(toPgQuery(sql), params);
    return result.rows[0];
  }

  async run(sql, params = []) {
    const result = await this.pool.query(toPgQuery(sql), params);
    return { changes: result.rowCount, lastInsertRowid: undefined };
  }

  /**
   * Führt fn(tx) in einer echten Postgres-Transaktion aus: EIN Client wird aus dem
   * Pool ausgecheckt, damit BEGIN/COMMIT/ROLLBACK und alle Zwischenschritte
   * garantiert auf derselben Verbindung laufen (bei einem Pool würden verschiedene
   * Statements sonst potenziell auf unterschiedlichen physischen Verbindungen
   * landen, was Transaktionen unmöglich machen würde).
   */
  async transaction(fn) {
    const client = await this.pool.connect();
    const tx = {
      kind: 'postgres',
      all: async (sql, params = []) => (await client.query(toPgQuery(sql), params)).rows,
      get: async (sql, params = []) => (await client.query(toPgQuery(sql), params)).rows[0],
      run: async (sql, params = []) => {
        const r = await client.query(toPgQuery(sql), params);
        return { changes: r.rowCount, lastInsertRowid: undefined };
      },
    };
    try {
      await client.query('BEGIN');
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* Rollback-Fehler ignorieren, der ursprüngliche Fehler ist wichtiger */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
