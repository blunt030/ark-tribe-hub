
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
  'rex_saddle', 'argentavis_saddle',
  'metal_wall', 'vault',
]);

const TYPBILDER = {
  egg: 'egg',
  embryo: 'embryo',
};

export function mitgeliefertesBild(item) {
  const key = String(item.key || '');
  if (EXAKTE_BILDER.has(key)) return `/assets/${key}.png`;
  const type = String(item.product_type || item.productType || '');
  return TYPBILDER[type] ? `/assets/${TYPBILDER[type]}.png` : null;
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
