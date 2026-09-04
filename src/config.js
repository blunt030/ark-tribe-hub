import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

// Sehr kleiner .env-Parser (keine externe Abhängigkeit nötig).
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  const content = readFileSync(file, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

loadDotEnv(path.join(rootDir, '.env'));

/**
 * Server-Secret für abgeleitete Tokens (CSRF). Reihenfolge:
 * 1. Umgebungsvariable SESSION_SECRET (so gehört es in Produktion)
 * 2. Datei data/.session-secret – wird beim ersten Start automatisch erzeugt,
 *    damit Sessions einen Neustart überleben und die Entwicklung ohne Setup läuft.
 * Das Secret gehört NICHT ins Repository (steht in .gitignore).
 *
 * WICHTIG für Hosting ohne persistente Festplatte (z.B. Render Free Tier): Dort
 * überlebt Variante 2 einen Neustart NICHT (jeder Neustart würde ein neues
 * Secret erzeugen). Das ist mehr als nur eine Unbequemlichkeit: Der CSRF-Hash
 * einer bestehenden Session wird beim Login einmalig gespeichert, aber
 * GET /auth/me leitet das CSRF-Token bei jedem Aufruf frisch aus dem aktuell
 * gültigen Secret ab (siehe authService.csrfTokenFor) - ändert sich das Secret,
 * passt das neu ausgelieferte Token nicht mehr zum gespeicherten Hash, und
 * bereits angemeldete Nutzer würden nach einem Neustart bei der nächsten
 * Aktion ein falsches CSRF-Token erhalten. Deshalb setzt render.yaml
 * SESSION_SECRET explizit und dauerhaft (generateValue: true).
 */
function resolveSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secretFile = path.join(rootDir, 'data', '.session-secret');
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim();
  const generated = randomBytes(32).toString('hex');
  mkdirSync(path.dirname(secretFile), { recursive: true });
  writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

export const config = {
  rootDir,
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  dbPath: path.resolve(rootDir, process.env.DB_PATH || './data/ark-tribe-hub.db'),
  uploadDir: path.resolve(rootDir, process.env.UPLOAD_DIR || './data/uploads'),
  // Gesetzt = Postgres (gehostet, z.B. Render). Ungesetzt = lokale SQLite-Datei.
  // Render setzt diese Variable automatisch, sobald eine Postgres-Datenbank mit
  // dem Web Service verbunden ist - keine manuelle Konfiguration nötig.
  databaseUrl: process.env.DATABASE_URL || null,
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS || '30', 10),
  sessionSecret: resolveSessionSecret(),
  // Rate-Limits pro Minute und IP. Konfigurierbar, damit Tests/Lasttests nicht
  // an den Produktionswerten scheitern (der Brute-Force-Schutz beim Login ist
  // davon unabhängig und greift immer).
  rateLimitGlobalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '120', 10),
  rateLimitAuthMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '10', 10),
  supportedLangs: ['de', 'en', 'fr', 'es'],
  defaultLang: 'de',
};
