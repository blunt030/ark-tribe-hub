import { catalogRegion } from '../public/js/catalog-regions.js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mitgeliefertesBild } from '../public/js/icons.js';
import { STANDARD_MAPS } from '../public/js/map-images.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(readFileSync(path.join(root, 'data/catalog', file), 'utf8'));
const creatures = read('creatures.json').creatures;
const structures = read('structures.json');
const rows = [];
for (const [key, , , reproduction, hasSaddle] of creatures) {
  rows.push({ key, product_type: 'creature' });
  if (reproduction === 'egg' || reproduction === 'embryo') rows.push({ key: `${key}_${reproduction}`, product_type: reproduction });
  if (hasSaddle) rows.push({ key: `${key}_saddle`, product_type: 'saddle' });
}
for (const tier of structures.tiers) {
  for (const piece of structures.pieces) rows.push({ key: `${tier.key}_${piece.key}`, product_type: 'structure' });
}
for (const extra of structures.extra) rows.push({ key: extra.key, product_type: 'structure' });

for (const type of ['creature', 'egg', 'embryo', 'saddle', 'structure']) {
  const subset = rows.filter((item) => item.product_type === type);
  const missing = subset.filter((item) => {
    const image = mitgeliefertesBild(item) || catalogRegion(item)?.source;
    return !image || !existsSync(path.join(root, 'public', image.slice(1)));
  });
  console.log(`${type}: ${subset.length - missing.length}/${subset.length} mit Bild; ${missing.length} fehlen`);
  if (process.argv.includes('--missing')) console.log(missing.map((item) => item.key).join(', '));
}
const missingMaps = STANDARD_MAPS.filter((map) => !existsSync(path.join(root, 'public/assets/maps', `${map.file}.jpg`)));
console.log(`maps: ${STANDARD_MAPS.length - missingMaps.length}/${STANDARD_MAPS.length} mit Bild`);
if (missingMaps.length) console.log('Fehlende Maps:', missingMaps.map((map) => map.name).join(', '));
console.log('Produktions-Uploads sind in dieser lokalen Zählung nicht enthalten.');
