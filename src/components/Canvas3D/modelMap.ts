/** Maps catalog item ids to a real 3D model (CC0 "Furniture Kit" by Kenney,
 * https://kenney.nl/assets/furniture-kit) instead of the procedural shapes
 * in Furniture3D.tsx. Anything not listed here falls back to the procedural
 * renderer. */
export const MODEL_MAP: Record<string, string> = {
  sofa: 'loungeSofa',
  loveseat: 'loungeDesignSofa',
  sectional: 'loungeSofaCorner',
  armchair: 'loungeChair',
  ottoman: 'loungeSofaOttoman',
  'coffee-table': 'tableCoffee',
  'side-table': 'sideTable',
  'tv-stand': 'cabinetTelevision',
  rug: 'rugRectangle',
  bookshelf: 'bookcaseOpen',
  'floor-lamp': 'lampRoundFloor',
  recliner: 'loungeChairRelax',
  'console-table': 'sideTableDrawers',
  'coat-rack': 'coatRackStanding',

  'bed-king': 'bedDouble',
  'bed-queen': 'bedDouble',
  'bed-twin': 'bedSingle',
  nightstand: 'cabinetBedDrawer',
  dresser: 'cabinetBedDrawerTable',
  wardrobe: 'bookcaseClosedWide',
  vanity: 'sideTableDrawers',
  crib: 'bedSingle',
  mirror: 'bathroomMirror',
  'floor-mirror': 'bathroomMirror',

  fridge: 'kitchenFridge',
  stove: 'kitchenStove',
  microwave: 'kitchenMicrowave',
  'sink-kitchen': 'kitchenSink',
  pantry: 'kitchenCabinetUpper',
  island: 'kitchenBar',
  'dining-table': 'table',
  'dining-chair': 'chairDesk',
  'bar-stool': 'stoolBar',
  'kitchen-cart': 'kitchenBar',

  toilet: 'toilet',
  bathtub: 'bathtub',
  shower: 'shower',
  'sink-bath': 'bathroomSink',
  'linen-cabinet': 'bathroomCabinet',
  'mirror-bath': 'bathroomMirror',

  washer: 'washer',
  dryer: 'dryer',
  'washer-dryer-stack': 'washerDryerStacked',
  'utility-sink': 'kitchenSink',
  'folding-table': 'table',
  'laundry-cabinet': 'kitchenCabinet',

  desk: 'desk',
  'office-chair': 'chairDesk',
  'filing-cabinet': 'cabinetBedDrawer',
  'meeting-table': 'tableCross',

  'patio-table': 'tableRound',
  'lounge-chair': 'loungeChairRelax',
  plant: 'pottedPlant',
  bench: 'bench',
};

export function modelPathFor(catalogId: string): string | undefined {
  const name = MODEL_MAP[catalogId];
  return name ? `${import.meta.env.BASE_URL}models/furniture/${name}.glb` : undefined;
}
