import { structureRegion, STRUCTURE_ATLAS } from './structure-images.js';

const CREATURE_ATLAS = '/assets/creature-atlas.png';
// Only the illustration, excluding the poster's labels and comparison symbols.
const creatures = new Map([
  ['beelzebufo', [1326, 548, 184, 128]],
  ['otter', [118, 778, 164, 120]],
]);
export function catalogRegion(item) {
  const structure = structureRegion(item);
  if (structure) return { source: STRUCTURE_ATLAS, region: structure, width: 1536, height: 1024 };
  let key = String(item.key || item.item_key || '');
  const type = String(item.product_type || item.productType || '');
  if ((type === 'egg' || type === 'embryo') && key.endsWith(`_${type}`)) key = key.slice(0, -type.length - 1);
  const region = creatures.get(key);
  return region ? { source: CREATURE_ATLAS, region, width: 1536, height: 1024 } : null;
}
