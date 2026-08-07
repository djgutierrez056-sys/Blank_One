export interface CatalogEntry {
  id: string;
  name: string;
  category: string;
  width: number; // feet
  height: number; // feet
  color: string;
}

export const CATEGORIES = [
  'Living Room',
  'Bedroom',
  'Kitchen',
  'Bathroom',
  'Office',
  'Outdoor',
  'Doors & Windows',
] as const;

export const CATALOG: CatalogEntry[] = [
  // Living Room
  { id: 'sofa', name: 'Sofa', category: 'Living Room', width: 6.5, height: 3, color: '#8fb4d9' },
  { id: 'loveseat', name: 'Loveseat', category: 'Living Room', width: 4.5, height: 3, color: '#8fb4d9' },
  { id: 'armchair', name: 'Armchair', category: 'Living Room', width: 2.8, height: 2.8, color: '#a7c4e0' },
  { id: 'coffee-table', name: 'Coffee Table', category: 'Living Room', width: 4, height: 2, color: '#c9a876' },
  { id: 'tv-stand', name: 'TV Stand', category: 'Living Room', width: 5, height: 1.3, color: '#6b6b6b' },
  { id: 'rug', name: 'Rug', category: 'Living Room', width: 6, height: 4, color: '#e2c9a0' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'Living Room', width: 3, height: 1, color: '#a9835a' },

  // Bedroom
  { id: 'bed-queen', name: 'Queen Bed', category: 'Bedroom', width: 5, height: 6.6, color: '#c98fa6' },
  { id: 'bed-twin', name: 'Twin Bed', category: 'Bedroom', width: 3.3, height: 6.3, color: '#c98fa6' },
  { id: 'nightstand', name: 'Nightstand', category: 'Bedroom', width: 1.6, height: 1.6, color: '#a9835a' },
  { id: 'dresser', name: 'Dresser', category: 'Bedroom', width: 4, height: 1.6, color: '#a9835a' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'Bedroom', width: 4, height: 2, color: '#8a6a45' },

  // Kitchen
  { id: 'fridge', name: 'Refrigerator', category: 'Kitchen', width: 3, height: 2.8, color: '#b8c4c9' },
  { id: 'stove', name: 'Stove', category: 'Kitchen', width: 2.5, height: 2, color: '#8f8f8f' },
  { id: 'sink-kitchen', name: 'Sink', category: 'Kitchen', width: 2.5, height: 2, color: '#b8c4c9' },
  { id: 'island', name: 'Kitchen Island', category: 'Kitchen', width: 5, height: 3, color: '#c9a876' },
  { id: 'dining-table', name: 'Dining Table', category: 'Kitchen', width: 5, height: 3.3, color: '#c9a876' },
  { id: 'dining-chair', name: 'Dining Chair', category: 'Kitchen', width: 1.6, height: 1.6, color: '#a9835a' },

  // Bathroom
  { id: 'toilet', name: 'Toilet', category: 'Bathroom', width: 1.6, height: 2.3, color: '#dfe6e8' },
  { id: 'bathtub', name: 'Bathtub', category: 'Bathroom', width: 5, height: 2.6, color: '#dfe6e8' },
  { id: 'shower', name: 'Shower', category: 'Bathroom', width: 3, height: 3, color: '#cdd8db' },
  { id: 'sink-bath', name: 'Bathroom Sink', category: 'Bathroom', width: 2, height: 1.6, color: '#dfe6e8' },

  // Office
  { id: 'desk', name: 'Desk', category: 'Office', width: 4.5, height: 2.3, color: '#a9835a' },
  { id: 'office-chair', name: 'Office Chair', category: 'Office', width: 2, height: 2, color: '#5c5c5c' },
  { id: 'filing-cabinet', name: 'Filing Cabinet', category: 'Office', width: 1.6, height: 1.6, color: '#6b6b6b' },

  // Outdoor
  { id: 'patio-table', name: 'Patio Table', category: 'Outdoor', width: 3.5, height: 3.5, color: '#7a9e7e' },
  { id: 'grill', name: 'Grill', category: 'Outdoor', width: 2.3, height: 2, color: '#4a4a4a' },
  { id: 'plant', name: 'Plant', category: 'Outdoor', width: 1.6, height: 1.6, color: '#5f8f5a' },
  { id: 'bench', name: 'Bench', category: 'Outdoor', width: 4.5, height: 1.5, color: '#8a6a45' },
  { id: 'fence', name: 'Fence', category: 'Outdoor', width: 8, height: 0.4, color: '#9c8462' },

  // Doors & Windows
  { id: 'door', name: 'Door', category: 'Doors & Windows', width: 3, height: 0.5, color: '#8a6a45' },
  { id: 'window', name: 'Window', category: 'Doors & Windows', width: 3.3, height: 0.4, color: '#8fc7e0' },
];

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.id === id);
}
