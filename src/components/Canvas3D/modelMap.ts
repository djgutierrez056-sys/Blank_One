/** Maps catalog item ids to a real 3D model instead of the procedural shapes
 * in Furniture3D.tsx. Anything not listed here falls back to the procedural
 * renderer. Paths are relative to public/models/ (no .glb extension). See
 * CREDITS.md for the source/license of each model. */
export const MODEL_MAP: Record<string, string> = {
  sofa: 'furniture/loungeSofa',
  loveseat: 'furniture/loungeDesignSofa',
  sectional: 'furniture/loungeSofaCorner',
  armchair: 'furniture/loungeChair',
  ottoman: 'furniture/loungeSofaOttoman',
  'coffee-table': 'furniture/tableCoffee',
  'side-table': 'furniture/sideTable',
  'tv-stand': 'furniture/cabinetTelevision',
  rug: 'furniture/rugRectangle',
  bookshelf: 'furniture/bookcaseOpen',
  'floor-lamp': 'furniture/lampRoundFloor',
  recliner: 'furniture/loungeChairRelax',
  'console-table': 'furniture/sideTableDrawers',
  'coat-rack': 'furniture/coatRackStanding',

  'bed-king': 'furniture/bedDouble',
  'bed-queen': 'furniture/bedDouble',
  'bed-twin': 'furniture/bedSingle',
  nightstand: 'furniture/cabinetBedDrawer',
  dresser: 'furniture/cabinetBedDrawerTable',
  wardrobe: 'furniture/bookcaseClosedWide',
  vanity: 'furniture/sideTableDrawers',
  crib: 'furniture/bedSingle',
  mirror: 'furniture/bathroomMirror',
  'floor-mirror': 'furniture/bathroomMirror',

  fridge: 'furniture/kitchenFridge',
  stove: 'furniture/kitchenStove',
  microwave: 'furniture/kitchenMicrowave',
  'sink-kitchen': 'furniture/kitchenSink',
  pantry: 'furniture/kitchenCabinetUpper',
  island: 'furniture/kitchenBar',
  'dining-table': 'furniture/table',
  'dining-chair': 'furniture/chairDesk',
  'bar-stool': 'furniture/stoolBar',
  'kitchen-cart': 'furniture/kitchenBar',

  toilet: 'furniture/toilet',
  bathtub: 'furniture/bathtub',
  shower: 'furniture/shower',
  'sink-bath': 'furniture/bathroomSink',
  'linen-cabinet': 'furniture/bathroomCabinet',
  'mirror-bath': 'furniture/bathroomMirror',

  washer: 'furniture/washer',
  dryer: 'furniture/dryer',
  'washer-dryer-stack': 'furniture/washerDryerStacked',
  'utility-sink': 'furniture/kitchenSink',
  'folding-table': 'furniture/table',
  'laundry-cabinet': 'furniture/kitchenCabinet',

  desk: 'furniture/desk',
  'office-chair': 'furniture/chairDesk',
  'filing-cabinet': 'furniture/cabinetBedDrawer',
  'meeting-table': 'furniture/tableCross',

  'patio-table': 'furniture/tableRound',
  'lounge-chair': 'furniture/loungeChairRelax',
  plant: 'furniture/pottedPlant',
  bench: 'furniture/bench',

  car: 'vehicles/car',
  suv: 'vehicles/suv',
  motorcycle: 'vehicles/motorcycle',
  'dirt-bike': 'vehicles/dirt-bike',
  scooter: 'vehicles/scooter',
  bicycle: 'vehicles/bicycle',
};

export function modelPathFor(catalogId: string): string | undefined {
  const path = MODEL_MAP[catalogId];
  return path ? `${import.meta.env.BASE_URL}models/${path}.glb` : undefined;
}
