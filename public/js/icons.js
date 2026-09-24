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

export function mitgeliefertesBild(item) {
  const key = String(item.key || item.item_key || '');
  if (EXAKTE_BILDER.has(key)) return `/assets/${key}.png`;

  // Ei und Embryo gehören im Katalog zu einer konkreten Kreatur. Ihre Schlüssel
  // lauten z. B. "rex_egg" bzw. "direwolf_embryo". In der Bestellung soll daher
  // das wirklich passende Tier erscheinen und nicht bei allen Einträgen dasselbe
  // allgemeine Ei-/Embryo-Symbol. Ist das Tierbild noch nicht vorhanden, bleibt
  // der Bildplatz leer, bis die entsprechende Grafik ergänzt wurde.
  const type = String(item.product_type || item.productType || '');
  if (type === 'egg' || type === 'embryo') {
    const suffix = `_${type}`;
    const creatureKey = key.endsWith(suffix) ? key.slice(0, -suffix.length) : '';
    if (EXAKTE_BILDER.has(creatureKey)) return `/assets/${creatureKey}.png`;
  }

  return null;
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
