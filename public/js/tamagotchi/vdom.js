/**
 * Winziger virtueller SVG-Baum. Die Grafik entsteht als reine Daten, damit sie
 * im Browser als DOM (ohne innerHTML) und in Node-Tests bzw. für das
 * Minispiel-Canvas als Text erzeugt werden kann.
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...children) {
  return { tag, attrs: attrs || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
}

export function toDom(node) {
  if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node));
  const el = document.createElementNS(SVG_NS, node.tag);
  for (const [k, v] of Object.entries(node.attrs)) {
    if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  }
  for (const c of node.children) el.append(toDom(c));
  return el;
}

const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export function toSvgString(node) {
  if (typeof node === 'string' || typeof node === 'number') return escapeXml(node);
  const attrs = Object.entries(node.attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
  const inner = node.children.map(toSvgString).join('');
  const xmlns = node.tag === 'svg' && !node.attrs.xmlns ? ` xmlns="${SVG_NS}"` : '';
  return `<${node.tag}${xmlns}${attrs}>${inner}</${node.tag}>`;
}

/** Data-URL eines SVG-Baums, z. B. für drawImage() im Minispiel (CSP erlaubt data:-Bilder). */
export function toDataUrl(node) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSvgString(node));
}

/**
 * Lange Schnauzen (Baryonyx, Deinosuchus …) und große Babyköpfe ragen über die
 * Standard-viewBox hinaus. Auf dem Bildschirm ist das egal (overflow: visible),
 * in einem <img> oder Canvas würde es abgeschnitten – dort wird die viewBox auf
 * die gemessene Größe erweitert. Quadratisch, der Boden bleibt unten.
 */
export function fitViewBox(node, [bx, by, bw] = [-8, -8, 216]) {
  if (typeof document === 'undefined' || !document.body) return node;
  const probe = toDom(node);
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden';
  holder.append(probe);
  document.body.append(holder);
  let b = null;
  try { b = probe.getBBox(); } catch { /* ohne Layout keine Messung */ }
  holder.remove();
  if (!b || !b.width) return node;
  const pad = 4;
  let x0 = Math.min(bx, b.x - pad), y0 = Math.min(by, b.y - pad);
  const x1 = Math.max(bx + bw, b.x + b.width + pad), y1 = Math.max(by + bw, b.y + b.height + pad);
  const size = Math.max(x1 - x0, y1 - y0);
  x0 -= (size - (x1 - x0)) / 2;
  y0 -= size - (y1 - y0);
  node.attrs.viewBox = [x0, y0, size, size].map((v) => Math.round(v * 10) / 10).join(' ');
  return node;
}
