import { Router } from '../lib/router.js';
import { readJsonBody, sendJson, notFound, badRequest } from '../lib/http.js';
import { requireString, requireOneOf, parseIdParam } from '../lib/validate.js';
import { requireActive, requireRole, requireCsrf } from '../middleware/auth.js';
import { validateImage, saveImageToDisk } from '../lib/imageUpload.js';
import { audit } from '../services/auditService.js';
import { config } from '../config.js';

function langOf(req) {
  const q = req.query.lang;
  return config.supportedLangs.includes(q) ? q : config.defaultLang;
}

export function buildCatalogRouter(db) {
  const router = new Router();

  router.get('/api/categories', requireActive, async (req, res) => {
    const lang = langOf(req);
    const rows = await db.all(
      `SELECT c.id, c.key, c.is_active, c.sort_order,
              COALESCE(t.name, t_de.name, c.key) AS name
       FROM categories c
       LEFT JOIN category_translations t ON t.category_id = c.id AND t.lang = ?
       LEFT JOIN category_translations t_de ON t_de.category_id = c.id AND t_de.lang = 'de'
       WHERE c.is_active = 1
       ORDER BY c.sort_order`,
      [lang]
    );
    sendJson(res, 200, { categories: rows });
  });

  router.get('/api/items', requireActive, async (req, res) => {
    const lang = langOf(req);
    const search = (req.query.search || '').trim();
    const categoryId = req.query.categoryId ? parseIdParam(req.query.categoryId, 'categoryId') : null;
    const productType = req.query.productType || null;

    let sql = `SELECT i.id, i.key, i.product_type, i.category_id, i.emoji, i.image_path,
                      COALESCE(t.name, t_de.name, i.key) AS name
               FROM items i
               LEFT JOIN item_translations t ON t.item_id = i.id AND t.lang = ?
               LEFT JOIN item_translations t_de ON t_de.item_id = i.id AND t_de.lang = 'de'
               WHERE i.is_active = 1`;
    const params = [lang];
    if (categoryId) {
      sql += ' AND i.category_id = ?';
      params.push(categoryId);
    }
    if (productType) {
      // Mehrere Typen kommagetrennt erlauben (z.B. "egg,embryo" für eine kombinierte
      // Zucht-Ansicht), ohne die Parametrisierung aufzugeben.
      const types = productType.split(',').map((s) => s.trim()).filter(Boolean);
      if (types.length) {
        sql += ` AND i.product_type IN (${types.map(() => '?').join(',')})`;
        params.push(...types);
      }
    }
    if (search) {
      // Parametrisiert (kein String-Concat) -> sicher gegen SQL-Injection, auch bei
      // Suchbegriffen wie einem eingebetteten Anführungszeichen oder SQL-Schlüsselwort.
      sql += ' AND (COALESCE(t.name, t_de.name, i.key) LIKE ? OR i.key LIKE ?)';
      const pattern = `%${search.replace(/[%_]/g, '\\$&')}%`;
      params.push(pattern, pattern);
    }
    sql += ' ORDER BY name LIMIT 500';

    const rows = await db.all(sql, params);
    sendJson(res, 200, { items: rows });
  });

  router.get('/api/i18n/:lang', requireActive, async (req, res) => {
    const lang = config.supportedLangs.includes(req.params.lang) ? req.params.lang : config.defaultLang;
    const rows = await db.all('SELECT key, value FROM ui_strings WHERE lang = ?', [lang]);
    const dict = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    sendJson(res, 200, { lang, strings: dict });
  });

  // --- Developer-Verwaltung: Katalog ist plattformweit, nicht hart codiert ---

  router.post('/api/categories', requireRole('developer'), requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const key = requireString(body.key, 'key', { min: 2, max: 50 });
    const names = body.names || {};
    const result = await db.transaction(async (tx) => {
      const existing = await tx.get('SELECT id FROM categories WHERE key = ?', [key]);
      if (existing) throw badRequest('Kategorie-Key existiert bereits');
      const inserted = await tx.get('INSERT INTO categories (key, sort_order) VALUES (?,?) RETURNING id', [key, body.sortOrder || 0]);
      for (const [lang, name] of Object.entries(names)) {
        if (config.supportedLangs.includes(lang) && name) {
          await tx.run('INSERT INTO category_translations (category_id, lang, name) VALUES (?,?,?)', [inserted.id, lang, name]);
        }
      }
      await audit(tx, { actorId: req.user.id, action: 'category_created', targetType: 'category', targetId: inserted.id });
      return tx.get('SELECT * FROM categories WHERE id = ?', [inserted.id]);
    });
    sendJson(res, 201, { category: result });
  });

  router.patch('/api/categories/:id', requireRole('developer'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    const category = await db.get('SELECT * FROM categories WHERE id = ?', [id]);
    if (!category) throw notFound('Kategorie nicht gefunden');

    await db.transaction(async (tx) => {
      if (body.isActive !== undefined) {
        await tx.run('UPDATE categories SET is_active = ? WHERE id = ?', [body.isActive ? 1 : 0, id]);
      }
      if (body.sortOrder !== undefined) {
        await tx.run('UPDATE categories SET sort_order = ? WHERE id = ?', [body.sortOrder, id]);
      }
      if (body.names) {
        for (const [lang, name] of Object.entries(body.names)) {
          if (config.supportedLangs.includes(lang) && name) {
            await tx.run(
              `INSERT INTO category_translations (category_id, lang, name) VALUES (?,?,?)
               ON CONFLICT(category_id, lang) DO UPDATE SET name = excluded.name`,
              [id, lang, name]
            );
          }
        }
      }
      await audit(tx, { actorId: req.user.id, action: 'category_updated', targetType: 'category', targetId: id });
    });
    sendJson(res, 200, { category: await db.get('SELECT * FROM categories WHERE id = ?', [id]) });
  });

  router.post('/api/items', requireRole('developer'), requireCsrf, async (req, res) => {
    const body = await readJsonBody(req);
    const key = requireString(body.key, 'key', { min: 2, max: 60 });
    const categoryId = parseIdParam(body.categoryId, 'categoryId');
    const productType = requireOneOf(body.productType, ['creature', 'egg', 'embryo', 'saddle', 'structure', 'resource'], 'productType');
    const names = body.names || {};

    const result = await db.transaction(async (tx) => {
      const category = await tx.get('SELECT id FROM categories WHERE id = ?', [categoryId]);
      if (!category) throw badRequest('Unbekannte categoryId');
      const existing = await tx.get('SELECT id FROM items WHERE key = ?', [key]);
      if (existing) throw badRequest('Item-Key existiert bereits');
      const inserted = await tx.get(
        'INSERT INTO items (category_id, product_type, key, emoji, created_by) VALUES (?,?,?,?,?) RETURNING id',
        [categoryId, productType, key, body.emoji || null, req.user.id]
      );
      for (const [lang, name] of Object.entries(names)) {
        if (config.supportedLangs.includes(lang) && name) {
          await tx.run('INSERT INTO item_translations (item_id, lang, name) VALUES (?,?,?)', [inserted.id, lang, name]);
        }
      }
      await audit(tx, { actorId: req.user.id, action: 'item_created', targetType: 'item', targetId: inserted.id });
      return tx.get('SELECT * FROM items WHERE id = ?', [inserted.id]);
    });
    sendJson(res, 201, { item: result });
  });

  router.patch('/api/items/:id', requireRole('developer'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const body = await readJsonBody(req);
    const item = await db.get('SELECT * FROM items WHERE id = ?', [id]);
    if (!item) throw notFound('Item nicht gefunden');

    await db.transaction(async (tx) => {
      if (body.isActive !== undefined) await tx.run('UPDATE items SET is_active = ? WHERE id = ?', [body.isActive ? 1 : 0, id]);
      if (body.emoji !== undefined) await tx.run('UPDATE items SET emoji = ? WHERE id = ?', [body.emoji, id]);
      if (body.categoryId !== undefined) await tx.run('UPDATE items SET category_id = ? WHERE id = ?', [parseIdParam(body.categoryId, 'categoryId'), id]);
      if (body.names) {
        for (const [lang, name] of Object.entries(body.names)) {
          if (config.supportedLangs.includes(lang) && name) {
            await tx.run(
              `INSERT INTO item_translations (item_id, lang, name) VALUES (?,?,?)
               ON CONFLICT(item_id, lang) DO UPDATE SET name = excluded.name`,
              [id, lang, name]
            );
          }
        }
      }
      await audit(tx, { actorId: req.user.id, action: 'item_updated', targetType: 'item', targetId: id });
    });
    sendJson(res, 200, { item: await db.get('SELECT * FROM items WHERE id = ?', [id]) });
  });

  router.post('/api/items/:id/image', requireRole('developer'), requireCsrf, async (req, res) => {
    const id = parseIdParam(req.params.id);
    const item = await db.get('SELECT * FROM items WHERE id = ?', [id]);
    if (!item) throw notFound('Item nicht gefunden');
    const body = await readJsonBody(req);
    const { buffer, ext, mimeType } = validateImage({ base64: body.imageBase64, mimeType: body.mimeType });
    const relPath = `items/${id}.${ext}`;

    if (db.kind === 'postgres') {
      await db.run('UPDATE items SET image_data = ?, image_mime = ?, image_path = ? WHERE id = ?', [buffer, mimeType, relPath, id]);
    } else {
      saveImageToDisk({ buffer, ext, uploadDir: config.uploadDir, subdir: 'items', ownerId: id });
      await db.run('UPDATE items SET image_path = ? WHERE id = ?', [relPath, id]);
    }
    await audit(db, { actorId: req.user.id, action: 'item_image_updated', targetType: 'item', targetId: id });
    sendJson(res, 200, { imagePath: relPath });
  });

  return router;
}
