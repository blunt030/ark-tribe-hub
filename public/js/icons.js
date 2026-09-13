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
  'rex_saddle', 'argentavis_saddle', 'acrocanthosaurus_saddle', 'allosaurus_saddle',
  'triceratops_saddle', 'ankylosaurus_saddle', 'baryonyx_saddle',
  'brontosaurus_saddle', 'carcharodontosaurus_saddle',
  'metal_wall', 'stone_foundation', 'vault', 'smithy', 'industrial_forge', 'fabricator',
  'chemistry_bench', 'refrigerator', 'generator', 'auto_turret',
]);

export function mitgeliefertesBild(item) {
  const key = String(item.key || '');
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
  if (sources.length === 0) return null;

  const box = document.createElement('span');
  box.className = 'icon-box';
  box.style.cssText = `width:${groesse}px;height:${groesse}px;flex:0 0 ${groesse}px`;
  const next = () => {
    const src = sources.shift();
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
