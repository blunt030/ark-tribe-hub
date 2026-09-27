import { catalogRegion } from './catalog-regions.js';
/**
 * Mitgelieferte, rechtmäßig neu erstellte Katalogbilder.
 *
 * Ein Bild wird nur dann angezeigt, wenn es wirklich zum Artikel passt. Damit
 * erscheint bei einem Sattel oder Ei nicht mehr fälschlich das Tierbild. Fehlende
 * Motive bleiben bis zur nächsten Bildrunde ohne Symbol, statt einen irreführenden
 * Platzhalter zu zeigen.
 */
const EXAKTE_BILDER = new Set([
  'rex', 'argentavis', 'giganotosaurus', 'brontosaurus', 'direwolf',
  'managarmr', 'ankylosaurus', 'dimorphodon', 'doedicurus', 'baryonyx',
  'kaprosuchus', 'basilosaurus',
  'spinosaurus', 'triceratops',
  'acrocanthosaurus', 'allosaurus', 'carnotaurus', 'pteranodon',
  'therizinosaurus', 'carcharodontosaurus',
  'daeodon', 'yutyrannus', 'megatherium', 'quetzal',
  'mosasaurus', 'megalodon', 'mosasaurus_saddle', 'metal_foundation',
  'rex_saddle', 'argentavis_saddle', 'acrocanthosaurus_saddle', 'allosaurus_saddle',
  'triceratops_saddle', 'ankylosaurus_saddle', 'baryonyx_saddle',
  'brontosaurus_saddle', 'carcharodontosaurus_saddle',
  'metal_wall', 'stone_foundation', 'vault', 'smithy', 'industrial_forge', 'fabricator',
  'chemistry_bench', 'refrigerator', 'generator', 'auto_turret',
]);

/** Bild des Eis/Embryos selbst (fuer das kleine Abzeichen oder Kategorie-Kacheln). */
export function eggImage(item) {
  const key = String(item.key || item.item_key || '');
  const type = String(item.product_type || item.productType || '');
  if (type === 'egg') return key === 'rex_egg' ? '/assets/rex_egg_dashboard.webp' : '/assets/items/cut/egg.webp';
  if (type === 'embryo') return '/assets/items/cut/embryo.webp';
  return null;
}

/** Zu Ei/Embryo gehoerende Kreatur, sofern dafuer ein passendes Bild existiert. */
export function creatureOf(item) {
  const key = String(item.key || item.item_key || '');
  const type = String(item.product_type || item.productType || '');
  if (type !== 'egg' && type !== 'embryo') return null;
  const creatureKey = key.endsWith('_' + type) ? key.slice(0, -type.length - 1) : '';
  return EXAKTE_BILDER.has(creatureKey) ? `/assets/items/cut/${creatureKey}.webp` : null;
}

export function mitgeliefertesBild(item) {
  const key = String(item.key || item.item_key || '');
  if (key === 'tek_generator') return '/assets/tek_generator.webp';
  if (key === 'attack_drone') return '/assets/attack_drone.webp';
  // Zugeschnittene, verkleinerte Fassung; das Original-PNG bleibt Rueckfallebene.
  if (EXAKTE_BILDER.has(key)) return `/assets/items/cut/${key}.webp`;

  // Ei und Embryo: das Tier gross, das Ei bzw. der Embryo erscheint als kleines
  // Abzeichen (itemArt). Ohne Tierbild wird das Ei/der Embryo selbst gezeigt.
  const type = String(item.product_type || item.productType || '');
  if (type === 'egg' || type === 'embryo') return creatureOf(item) || eggImage(item);

  return null;
}

// Fotoartige Motive fuellen die Bildflaeche; freigestellte PNGs stehen auf einer
// atmosphaerischen, unscharfen Buehne und werden nie beschnitten.
const SZENISCH = new Set(['/assets/tek_generator.webp', '/assets/attack_drone.webp', '/assets/rex_egg_dashboard.webp']);

/**
 * Grosse Bildflaeche fuer Karten und Details. Reihenfolge: Upload > passendes
 * mitgeliefertes Motiv > Ausschnitt aus einem Bildatlas > gestalteter
 * Platzhalter mit Typsymbol (kein fremdes oder falsches Bild).
 */
export function itemArt(item, { className = '', eggFirst = false } = {}) {
  const type = String(item.product_type || item.productType || '');
  const upload = item.image_path ? '/uploads/' + item.image_path : null;
  const bundled = eggFirst ? (eggImage(item) || mitgeliefertesBild(item)) : mitgeliefertesBild(item);
  const stage = document.createElement('span');
  stage.className = 'item-art' + (className ? ' ' + className : '') + ' type-' + (type || 'other');
  const showPlaceholder = () => {
    stage.classList.add('is-placeholder');
    const atlas = catalogRegion(item);
    if (atlas) {
      const [x, y, width, height] = atlas.region;
      const tile = document.createElement('span');
      tile.className = 'item-art-atlas';
      tile.setAttribute('aria-hidden', 'true');
      tile.style.cssText = `aspect-ratio:${width}/${height};background-image:url(${atlas.source});background-size:${atlas.width / width * 100}% ${atlas.height / height * 100}%;background-position:${x / (atlas.width - width) * 100}% ${y / (atlas.height - height) * 100}%`;
      stage.classList.remove('is-placeholder');
      stage.classList.add('is-cutout');
      stage.replaceChildren(tile);
      return;
    }
    const glyph = document.createElement('span');
    glyph.className = 'item-art-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    stage.replaceChildren(glyph);
  };
  const original = bundled && bundled.startsWith('/assets/items/cut/') ? bundled.replace('/assets/items/cut/', '/assets/').replace('.webp', '.png') : null;
  const sources = [upload, bundled, original].filter(Boolean);
  const next = () => {
    const src = sources.shift();
    if (!src) { showPlaceholder(); return; }
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.className = 'item-art-img';
    stage.classList.toggle('is-scenic', SZENISCH.has(src) || src === upload);
    stage.classList.toggle('is-cutout', !(SZENISCH.has(src) || src === upload));
    img.addEventListener('error', next, { once: true });
    img.src = src;
    stage.classList.remove('has-badge');
    stage.replaceChildren(img);
    // Kleines Abzeichen: beim Tierbild das Ei/den Embryo, bei eggFirst das Tier.
    const creature = creatureOf(item);
    const badgeSrc = !creature || src === upload ? null : eggFirst ? creature : src === creature ? eggImage(item).replace('/assets/rex_egg_dashboard.webp', '/assets/items/cut/egg.webp') : null;
    if (badgeSrc) {
      const badge = document.createElement('img');
      badge.className = 'item-art-badge';
      badge.alt = '';
      badge.loading = 'lazy';
      badge.addEventListener('error', () => badge.remove(), { once: true });
      badge.src = badgeSrc;
      stage.classList.add('has-badge');
      stage.append(badge);
    }
  };
  next();
  return stage;
}

/**
 * Zentrale Bildanzeige im Bestellablauf. Ein individuell hochgeladenes Bild hat
 * Vorrang, danach folgt ein passendes mitgeliefertes Motiv. Schlägt beides fehl,
 * wird der Bildplatz vollständig entfernt; der Artikelname bleibt bedienbar.
 */
export function itemBild(item, groesse = 32) {
  const sources = [
    item.image_path ? '/uploads/' + item.image_path : null,
    mitgeliefertesBild(item),
  ].filter(Boolean);
  const atlas = catalogRegion(item);
  const region = atlas?.region;
  if (sources.length === 0 && !region) return null;

  const box = document.createElement('span');
  box.className = 'icon-box';
  box.style.cssText = `width:${groesse}px;height:${groesse}px;flex:0 0 ${groesse}px`;
  const next = () => {
    const src = sources.shift();
    if (!src && region) {
      const [x, y, width, height] = region;
      const scale = groesse / Math.max(width, height);
      const tile = document.createElement('span');
      tile.setAttribute('aria-hidden', 'true');
      tile.style.cssText = `display:block;flex:none;width:${width * scale}px;height:${height * scale}px;background-image:url(${atlas.source});background-size:${atlas.width * scale}px ${atlas.height * scale}px;background-position:${-x * scale}px ${-y * scale}px;background-repeat:no-repeat`;
      // CSS backgrounds have no error event. Verify the shared sheet before
      // displaying it so missing assets do not leave a blank reserved space.
      const probe = document.createElement('img');
      probe.addEventListener('load', () => box.replaceChildren(tile), { once: true });
      probe.addEventListener('error', () => box.remove(), { once: true });
      probe.src = atlas.source;
      return;
    }
    if (!src) {
      box.remove();
      return;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.className = 'catalog-image';
    img.addEventListener('error', next, { once: true });
    img.src = src;
    box.replaceChildren(img);
  };
  next();
  return box;
}
