/**
 * Gezeichnete SVG-Silhouetten für den Katalog.
 *
 * Ersetzen die bisherigen Aufzählungspunkte ("•"), die überall dort standen, wo
 * ein Eintrag noch kein hochgeladenes Bild hat. Bewusst als selbst gezeichnete
 * Vektorgrafik statt Bilddatei:
 *   - keine fremden Spiel-Assets (urheberrechtlich sauber)
 *   - skaliert scharf auf jedem Display, ohne Ladezeit
 *   - nimmt automatisch die Akzentfarbe der Oberfläche an (currentColor)
 *
 * Sobald für einen Eintrag ein echtes Bild hochgeladen wurde, hat dieses Vorrang;
 * die Silhouette ist nur der Platzhalter.
 */

const PFADE = {
  // Vierbeiner mit Schwanz und Kopf - steht für Landtiere/Kreaturen allgemein.
  creature:
    'M4 15c0-1.2.8-2.2 2-2.5l2.5-.6 1.6-2.2c.5-.7 1.3-1.1 2.2-1.1h2.9c.7 0 1.4.3 1.9.9l1.3 1.6 2.4.5c1 .2 1.7 1.1 1.7 2.1 0 .5-.4.9-.9.9h-1.6l-.7 2.6c-.1.5-.6.8-1.1.8s-.9-.4-.9-.9l.2-2.5h-6.4l.2 2.5c0 .5-.4.9-.9.9s-1-.3-1.1-.8L9 15.1H6.6c-.4 1-.9 1.6-1.5 1.6-.7 0-1.1-.6-1.1-1.7zm14.3-4.6 1.9-2.4c.3-.4.9-.5 1.3-.2.4.3.5.9.2 1.3l-1.5 1.9z',
  // Ovale Eiform mit Naht.
  egg:
    'M12 3c3.3 0 6 4.3 6 8.6 0 4-2.6 6.9-6 6.9s-6-2.9-6-6.9C6 7.3 8.7 3 12 3zm0 2.1c-2 0-4 3.4-4 6.5 0 2.9 1.7 4.8 4 4.8s4-1.9 4-4.8c0-3.1-2-6.5-4-6.5z',
  // Ei mit angedeutetem Embryo im Inneren.
  embryo:
    'M12 3c3.3 0 6 4.3 6 8.6 0 4-2.6 6.9-6 6.9s-6-2.9-6-6.9C6 7.3 8.7 3 12 3zm0 2.1c-2 0-4 3.4-4 6.5 0 2.9 1.7 4.8 4 4.8s4-1.9 4-4.8c0-3.1-2-6.5-4-6.5zm.4 2.6c1.3 0 2.3 1 2.3 2.3 0 .8-.4 1.5-1 1.9.3.5.4 1 .4 1.6 0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3c0-.4.1-.8.3-1.2-.6-.4-1-1.1-1-1.9 0-1.3 1-2.3 2.3-2.3z',
  // ECHTER Reitsattel: hoher Sattelknauf vorn, Sitzmulde, Hinterzwiesel,
  // Steigbügelriemen. Vorher wurde hier ein Stuhl-Symbol verwendet.
  saddle:
    'M6.2 8.5c.6-1.6 2-2.6 3.8-2.6h4c1.8 0 3.2 1 3.8 2.6l.6 1.7c.2.6.3 1.2.3 1.8 0 1.9-1.1 3.4-2.8 4l-.3 2.4c-.1.5-.5.9-1 .9s-.9-.4-.9-.9v-2h-3.4v2c0 .5-.4.9-.9.9s-.9-.4-1-.9L8.1 16c-1.7-.6-2.8-2.1-2.8-4 0-.6.1-1.2.3-1.8zm3.8-.8c-1 0-1.8.6-2.1 1.5l-.6 1.7c-.1.4-.2.8-.2 1.1 0 1.3.9 2.3 2.2 2.5h5.4c1.3-.2 2.2-1.2 2.2-2.5 0-.3-.1-.7-.2-1.1l-.6-1.7c-.3-.9-1.1-1.5-2.1-1.5z',
  // Mauerwerk/Baustein - steht für Strukturen.
  structure:
    'M3 5h8v5H3zm10 0h8v5h-8zM3 12h5v5H3zm7 0h8v5h-8zm10 0h1v5h-1z',
  // Fliegende Kreatur: ausgebreitete Schwingen.
  flying:
    'M12 9.5c1 0 1.8.8 1.8 1.8 0 .6-.3 1.1-.7 1.4l.4 4.3c0 .5-.4.9-.9.9h-1.2c-.5 0-.9-.4-.9-.9l.4-4.3c-.4-.3-.7-.8-.7-1.4 0-1 .8-1.8 1.8-1.8zM2.5 7.2c2.6-.4 5.4.6 7.3 2.6l-.9.9C7.3 9.1 5 8.3 2.9 8.6c-.3 0-.5-.2-.6-.5s.1-.6.2-.9zm19 0c.1.3.3.6.2.9s-.3.5-.6.5c-2.1-.3-4.4.5-6 2.1l-.9-.9c1.9-2 4.7-3 7.3-2.6z',
  // Wassertier: Fischsilhouette mit Schwanzflosse.
  water:
    'M13 7.5c3 0 5.6 1.6 7 4-1.4 2.4-4 4-7 4-2.4 0-4.6-1-6-2.7l-2.6 2c-.3.2-.7.2-1-.1s-.3-.7-.1-1l1.6-2.2-1.6-2.2c-.2-.3-.2-.7.1-1s.7-.3 1-.1l2.6 2c1.4-1.7 3.6-2.7 6-2.7zm2.5 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
};

/** Fällt auf die Kreatur-Silhouette zurück, wenn eine Art unbekannt ist. */
export function iconPfad(art) {
  return PFADE[art] || PFADE.creature;
}

/**
 * Baut ein <svg>-Element. Größe in Pixeln, Farbe kommt über CSS (currentColor),
 * damit die Silhouette sich an Akzent- und Themenfarben anpasst.
 */
export function itemIcon(art, groesse = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(groesse));
  svg.setAttribute('height', String(groesse));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('item-icon', 'ic-' + art);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', iconPfad(art));
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

/**
 * Wählt die passende Silhouette für einen Katalogeintrag: primär nach Artikelart
 * (Ei/Embryo/Sattel/Struktur), bei Kreaturen zusätzlich nach Lebensraum, damit
 * ein Wal nicht wie ein Landtier aussieht.
 */
export function iconFuerItem(item) {
  const art = item.product_type || item.productType;
  if (art && art !== 'creature') return itemIcon(art);
  const kat = String(item.category_key || item.categoryKey || '').toLowerCase();
  if (kat.includes('flying')) return itemIcon('flying');
  if (kat.includes('water')) return itemIcon('water');
  return itemIcon('creature');
}
