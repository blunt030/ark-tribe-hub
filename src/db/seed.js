import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './index.js';
import { hashPassword } from '../lib/password.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_FILE = path.resolve(__dirname, '../../data/catalog/creatures.json');
const CATEGORY_CODE_MAP = { L: 'land_creatures', W: 'water_creatures', F: 'flying_creatures', M: 'misc' };

const ROLE_KEYS = ['developer', 'admin', 'breeder_crafter', 'member'];

const NOTIFICATION_TYPES = [
  'order_created',
  'order_claimed',
  'order_assigned',
  'item_not_available',
  'item_available_again',
  'order_partially_prepared',
  'order_partially_issued',
  'order_completed',
  'order_cancelled',
  'member_registered',
  'member_accepted',
  'member_rejected',
  'new_comment',
];

const CATEGORIES = [
  { key: 'land_creatures', sort: 1, de: 'Landtiere', en: 'Land Creatures', fr: 'Créatures terrestres', es: 'Criaturas terrestres' },
  { key: 'water_creatures', sort: 2, de: 'Wassertiere', en: 'Water Creatures', fr: 'Créatures aquatiques', es: 'Criaturas acuáticas' },
  { key: 'flying_creatures', sort: 3, de: 'Fliegende Tiere', en: 'Flying Creatures', fr: 'Créatures volantes', es: 'Criaturas voladoras' },
  { key: 'misc', sort: 4, de: 'Sonstiges', en: 'Miscellaneous', fr: 'Divers', es: 'Varios' },
  { key: 'structures', sort: 5, de: 'Strukturen', en: 'Structures', fr: 'Structures', es: 'Estructuras' },
];
const STRUCTURES_FILE = path.resolve(__dirname, '../../data/catalog/structures.json');

function loadStructureCatalog() {
  const raw = JSON.parse(readFileSync(STRUCTURES_FILE, 'utf8'));
  const items = [];
  for (const tier of raw.tiers) {
    for (const piece of raw.pieces) {
      items.push({
        key: `${tier.key}_${piece.key}`,
        name: { de: `${piece.de} (${tier.de})`, en: `${tier.en} ${piece.en}` },
      });
    }
  }
  for (const [key, name] of raw.extra) {
    items.push({ key, name: { de: name, en: name } });
  }
  return items;
}

// Hinweis zu Bildern: Es werden bewusst KEINE echten ARK-Spielgrafiken eingebettet
// (Copyright von Studio Wildcard / Instinct Games). image_path bleibt leer;
// Admin/Developer laden über den Katalog-Endpunkt eigene bzw. rechtmäßig
// nutzbare Bilder hoch (siehe Abschnitt 27 der Spezifikation).
//
// Der eigentliche Katalog kommt NICHT aus einem Code-Array, sondern aus
// data/catalog/creatures.json (eigenständig recherchierte, aktuelle
// ARK:-Survival-Ascended-Kreaturenliste, ~217 Kreaturen). Für jede Kreatur
// wird automatisch die Basis-Kreatur plus – wo mit ausreichender Sicherheit
// bekannt – Ei/Embryo und Sattel als eigene Katalog-Items angelegt.
// Erweitern/Korrigieren: JSON-Datei bearbeiten und `npm run seed` erneut
// ausführen (bestehende Einträge werden per Key übersprungen, nichts geht
// verloren) – oder direkt über die Developer-Katalog-API, ganz ohne Code-Änderung.
function loadCreatureCatalog() {
  const raw = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
  const items = [];
  for (const [key, name, categoryCode, reproduction, hasSaddle] of raw.creatures) {
    const category = CATEGORY_CODE_MAP[categoryCode];
    items.push({ key, category, type: 'creature', name });
    if (reproduction === 'egg') {
      items.push({ key: `${key}_egg`, category, type: 'egg', name: `${name} Egg` });
    } else if (reproduction === 'embryo') {
      items.push({ key: `${key}_embryo`, category, type: 'embryo', name: `${name} Embryo` });
    }
    if (hasSaddle) {
      items.push({ key: `${key}_saddle`, category, type: 'saddle', name: `${name} Saddle` });
    }
  }
  return items;
}

const UI_STRINGS = {
  'app.name': { de: 'ARK Tribe Hub', en: 'ARK Tribe Hub' },
  'order.status.open': { de: 'Offen', en: 'Open' },
  'order.status.partially_prepared': { de: 'Teilweise vorbereitet', en: 'Partially prepared' },
  'order.status.partially_issued': { de: 'Teilweise ausgegeben', en: 'Partially issued' },
  'order.status.completed': { de: 'Abgeschlossen', en: 'Completed' },
  'order.status.cancelled': { de: 'Storniert', en: 'Cancelled' },
  'order.item_status.open': { de: 'Offen', en: 'Open' },
  'order.item_status.not_available': { de: 'Nicht verfügbar', en: 'Not available' },
  'order.item_status.prepared': { de: 'Vorbereitet', en: 'Prepared' },
  'order.item_status.issued': { de: 'Ausgegeben', en: 'Issued' },
  'order.priority.normal': { de: 'Normal', en: 'Normal' },
  'order.priority.high': { de: 'Hoch', en: 'High' },
  'order.priority.urgent': { de: 'Dringend', en: 'Urgent' },
  'order.new_button': { de: 'Neue Bestellung', en: 'New Order' },
  'order.claim_button': { de: 'Übernehmen', en: 'Claim' },
  'order.release_button': { de: 'Freigeben', en: 'Release' },
  'notification.order_created': { de: 'Neue Bestellung eingegangen', en: 'New order received' },
  'notification.item_not_available': { de: 'Item ist momentan nicht verfügbar', en: 'Item is currently not available' },
  'auth.pending_approval': { de: 'Dein Konto wartet auf Freischaltung durch einen Admin.', en: 'Your account is awaiting admin approval.' },
  'error.forbidden': { de: 'Du hast keine Berechtigung für diese Aktion.', en: 'You do not have permission for this action.' },
};

export async function seed(db) {
  await db.transaction(async (tx) => {
    for (const key of ROLE_KEYS) {
      await tx.run('INSERT INTO roles (key) VALUES (?) ON CONFLICT(key) DO NOTHING', [key]);
    }
    for (const type of NOTIFICATION_TYPES) {
      await tx.run('INSERT INTO notification_types (key) VALUES (?) ON CONFLICT(key) DO NOTHING', [type]);
    }
    for (const [key, langs] of Object.entries(UI_STRINGS)) {
      for (const [lang, value] of Object.entries(langs)) {
        await tx.run('INSERT INTO ui_strings (key, lang, value) VALUES (?,?,?) ON CONFLICT(key, lang) DO NOTHING', [key, lang, value]);
      }
    }

    async function roleId(key) {
      const row = await tx.get('SELECT id FROM roles WHERE key = ?', [key]);
      return row.id;
    }

    // Tribe OaO
    await tx.run('INSERT INTO tribes (slug, name) VALUES (?,?) ON CONFLICT(slug) DO NOTHING', ['oao', 'OaO']);
    const oao = await tx.get('SELECT id FROM tribes WHERE slug = ?', ['oao']);
    const oaoId = oao.id;

    // Katalog (global, plattformweit)
    for (const cat of CATEGORIES) {
      await tx.run('INSERT INTO categories (key, sort_order) VALUES (?,?) ON CONFLICT(key) DO NOTHING', [cat.key, cat.sort]);
      const catRow = await tx.get('SELECT id FROM categories WHERE key = ?', [cat.key]);
      for (const lang of config.supportedLangs) {
        if (cat[lang]) {
          await tx.run(
            'INSERT INTO category_translations (category_id, lang, name) VALUES (?,?,?) ON CONFLICT(category_id, lang) DO NOTHING',
            [catRow.id, lang, cat[lang]]
          );
        }
      }
    }
    // Vollständiger Kreaturenkatalog aus data/catalog/creatures.json (~217 Kreaturen
    // -> ~380+ Katalog-Items inkl. Eier/Embryos/Sättel). DE/EN werden mit dem
    // recherchierten Namen befüllt (bei ARK meist ohnehin identisch/Eigenname);
    // FR/ES fallen über COALESCE in der Order-Abfrage sauber auf DE zurück, bis
    // sie im Adminbereich gezielt ergänzt werden.
    const catalogItems = loadCreatureCatalog();
    const categoryIdCache = new Map();
    for (const item of catalogItems) {
      if (!categoryIdCache.has(item.category)) {
        const catRow = await tx.get('SELECT id FROM categories WHERE key = ?', [item.category]);
        categoryIdCache.set(item.category, catRow.id);
      }
      const catId = categoryIdCache.get(item.category);
      await tx.run('INSERT INTO items (category_id, product_type, key) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING', [catId, item.type, item.key]);
      const itemRow = await tx.get('SELECT id FROM items WHERE key = ?', [item.key]);
      await tx.run('INSERT INTO item_translations (item_id, lang, name) VALUES (?,?,?) ON CONFLICT(item_id, lang) DO NOTHING', [itemRow.id, 'de', item.name]);
      await tx.run('INSERT INTO item_translations (item_id, lang, name) VALUES (?,?,?) ON CONFLICT(item_id, lang) DO NOTHING', [itemRow.id, 'en', item.name]);
    }

    // Strukturen: eigene, recherchierte Liste (data/catalog/structures.json) - eigene
    // Kategorie "structures", product_type "structure". Dieselbe generische
    // Item-/Bestell-Logik wie bei allem anderen, kein Sonderweg.
    const structuresCat = await tx.get('SELECT id FROM categories WHERE key = ?', ['structures']);
    for (const item of loadStructureCatalog()) {
      await tx.run('INSERT INTO items (category_id, product_type, key) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING', [structuresCat.id, 'structure', item.key]);
      const itemRow = await tx.get('SELECT id FROM items WHERE key = ?', [item.key]);
      await tx.run('INSERT INTO item_translations (item_id, lang, name) VALUES (?,?,?) ON CONFLICT(item_id, lang) DO NOTHING', [itemRow.id, 'de', item.name.de]);
      await tx.run('INSERT INTO item_translations (item_id, lang, name) VALUES (?,?,?) ON CONFLICT(item_id, lang) DO NOTHING', [itemRow.id, 'en', item.name.en]);
    }

    // Demo-Benutzer. WICHTIG: Nur für Entwicklung/Test – Passwort vor echtem
    // Einsatz ändern bzw. Demo-Accounts deaktivieren (siehe README "Sicherheit").
    const demoPasswordHash = await hashPassword('ChangeMe123!');

    async function ensureUser({ tribeId, username, email, roles, server, map, vault }) {
      let user = tribeId
        ? await tx.get('SELECT * FROM users WHERE tribe_id = ? AND username = ?', [tribeId, username])
        : await tx.get('SELECT * FROM users WHERE tribe_id IS NULL AND username = ?', [username]);
      if (!user) {
        user = await tx.get(
          `INSERT INTO users (tribe_id, username, email, password_hash, status, server, map, personal_vault_number)
           VALUES (?,?,?,?,?,?,?,?) RETURNING *`,
          [tribeId, username, email, demoPasswordHash, 'active', server || null, map || null, vault || null]
        );
      }
      for (const r of roles) {
        const rid = await roleId(r);
        await tx.run('INSERT INTO user_roles (user_id, role_id) VALUES (?,?) ON CONFLICT(user_id, role_id) DO NOTHING', [user.id, rid]);
      }
      return user;
    }

    await ensureUser({ tribeId: null, username: 'Blunt', email: 'blunt@ark-tribe-hub.dev', roles: ['developer'] });
    await ensureUser({ tribeId: oaoId, username: 'OaO Admin', email: 'admin@oao.dev', roles: ['member', 'admin'], server: 'Official PvP 1234', map: 'The Island' });
    await ensureUser({ tribeId: oaoId, username: 'OaO Breeder', email: 'breeder@oao.dev', roles: ['member', 'breeder_crafter'], server: 'Official PvP 1234', map: 'The Island' });
    await ensureUser({ tribeId: oaoId, username: 'Blunt OaO', email: 'blunt.oao@oao.dev', roles: ['member'], server: 'Official PvP 1234', map: 'The Island', vault: 'PV-014' });

    // Zweiter Test-Tribe, ausschließlich zum Nachweis der Mandantentrennung
    // (Phase 18: "mindestens zwei Test-Tribes"). Klar als Test gekennzeichnet,
    // damit er nicht mit einem echten zweiten Kunden verwechselt wird.
    await tx.run('INSERT INTO tribes (slug, name) VALUES (?,?) ON CONFLICT(slug) DO NOTHING', ['betatribe', 'BetaTribe (Test-Tribe)']);
    const beta = await tx.get('SELECT id FROM tribes WHERE slug = ?', ['betatribe']);
    await ensureUser({ tribeId: beta.id, username: 'BetaTribe Admin', email: 'admin@betatribe.dev', roles: ['member', 'admin'] });
    await ensureUser({ tribeId: beta.id, username: 'BetaTribe Member', email: 'member@betatribe.dev', roles: ['member'] });
  });
}

/** Seedet nur, wenn die Datenbank noch komplett leer ist (kein Tribe vorhanden). */
export async function seedIfEmpty(db) {
  const existing = await db.get('SELECT COUNT(*) AS c FROM tribes');
  if (Number(existing.c) === 0) {
    await seed(db);
    return true;
  }
  return false;
}

// Direkter CLI-Aufruf: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = await openDatabase();
  await seed(db);
  console.log('✅ Demo-Daten eingespielt (Tribe "OaO" + Test-Tribe "BetaTribe").');
  console.log('   Demo-Login (nur Entwicklung!): Benutzername siehe oben, Passwort: ChangeMe123!');
  await db.close();
}
