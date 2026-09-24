// User-supplied handbook, displayed through precisely scoped CSS viewports.
// Coordinates exclude labels/borders. No unrelated material is substituted.
export const STRUCTURE_ATLAS = '/assets/structure-atlas.png';
const regions = new Map();
const upper = ['foundation', 'wall', 'doorframe', 'door', 'windowframe', 'triangle_foundation', 'triangle_ceiling', 'pillar'];
const lower = ['ceiling', 'ramp', 'sloped_wall', null, null, 'railing', 'staircase', 'ladder'];
for (const [tier, top, bottom] of [['stone', 68, 149], ['wood', 276, 356], ['metal', 481, 562], ['tek', 681, 758]]) {
  for (const [row, y] of [[upper, top], [lower, bottom]]) {
    row.forEach((piece, col) => {
      if (piece) regions.set(`${tier}_${piece}`, [12 + col * 106, y, 98, 54]);
    });
  }
}
regions.set('greenhouse_wall', [882, 510, 129, 88]);
regions.set('greenhouse_ceiling', [1025, 510, 128, 88]);
regions.set('refining_forge', [1100, 674, 85, 70]);
regions.set('preserving_bin', [1210, 777, 88, 75]);
regions.set('storage_box', [1195, 926, 106, 84]);
regions.set('wood_hatchframe', [881, 78, 126, 73]);
regions.set('dinosaur_gateway', [1030, 77, 128, 77]);
regions.set('dinosaur_gate', [1190, 75, 96, 81]);
regions.set('behemoth_dinosaur_gateway', [881, 187, 126, 85]);
regions.set('behemoth_dinosaur_gate', [1035, 185, 123, 87]);
export function structureRegion(item) {
  return regions.get(String(item.key || item.item_key || '')) || null;
}
