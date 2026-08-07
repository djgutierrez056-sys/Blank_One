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
  'Laundry',
  'Office',
  'Outdoor',
  'Doors & Windows',
] as const;

export const CATALOG: CatalogEntry[] = [
  // Living Room
  { id: 'sofa', name: 'Sofa', category: 'Living Room', width: 6.5, height: 3, color: '#8fb4d9' },
  { id: 'loveseat', name: 'Loveseat', category: 'Living Room', width: 4.5, height: 3, color: '#8fb4d9' },
  { id: 'sectional', name: 'Sectional', category: 'Living Room', width: 8, height: 6, color: '#8fb4d9' },
  { id: 'armchair', name: 'Armchair', category: 'Living Room', width: 2.8, height: 2.8, color: '#a7c4e0' },
  { id: 'ottoman', name: 'Ottoman', category: 'Living Room', width: 2.3, height: 2.3, color: '#a7c4e0' },
  { id: 'coffee-table', name: 'Coffee Table', category: 'Living Room', width: 4, height: 2, color: '#c9a876' },
  { id: 'side-table', name: 'Side Table', category: 'Living Room', width: 1.6, height: 1.6, color: '#c9a876' },
  { id: 'tv-stand', name: 'TV Stand', category: 'Living Room', width: 5, height: 1.3, color: '#6b6b6b' },
  { id: 'rug', name: 'Rug', category: 'Living Room', width: 6, height: 4, color: '#e2c9a0' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'Living Room', width: 3, height: 1, color: '#a9835a' },
  { id: 'floor-lamp', name: 'Floor Lamp', category: 'Living Room', width: 1.3, height: 1.3, color: '#e8d9a0' },
  { id: 'recliner', name: 'Recliner', category: 'Living Room', width: 3, height: 3.3, color: '#a7c4e0' },
  { id: 'console-table', name: 'Console Table', category: 'Living Room', width: 4, height: 1.3, color: '#c9a876' },
  { id: 'coat-rack', name: 'Coat Rack', category: 'Living Room', width: 1.3, height: 1.3, color: '#8a6a45' },

  // Bedroom
  { id: 'bed-king', name: 'King Bed', category: 'Bedroom', width: 6.3, height: 6.6, color: '#c98fa6' },
  { id: 'bed-queen', name: 'Queen Bed', category: 'Bedroom', width: 5, height: 6.6, color: '#c98fa6' },
  { id: 'bed-twin', name: 'Twin Bed', category: 'Bedroom', width: 3.3, height: 6.3, color: '#c98fa6' },
  { id: 'nightstand', name: 'Nightstand', category: 'Bedroom', width: 1.6, height: 1.6, color: '#a9835a' },
  { id: 'dresser', name: 'Dresser', category: 'Bedroom', width: 4, height: 1.6, color: '#a9835a' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'Bedroom', width: 4, height: 2, color: '#8a6a45' },
  { id: 'vanity', name: 'Vanity', category: 'Bedroom', width: 3.3, height: 1.6, color: '#a9835a' },
  { id: 'crib', name: 'Crib', category: 'Bedroom', width: 3, height: 4.3, color: '#c98fa6' },
  { id: 'mirror', name: 'Wall Mirror', category: 'Bedroom', width: 2.3, height: 0.3, color: '#cfe0e8' },
  { id: 'floor-mirror', name: 'Floor Mirror', category: 'Bedroom', width: 1.6, height: 0.5, color: '#cfe0e8' },

  // Kitchen
  { id: 'fridge', name: 'Refrigerator', category: 'Kitchen', width: 3, height: 2.8, color: '#b8c4c9' },
  { id: 'stove', name: 'Stove', category: 'Kitchen', width: 2.5, height: 2, color: '#8f8f8f' },
  { id: 'microwave', name: 'Microwave', category: 'Kitchen', width: 2, height: 1.3, color: '#8f8f8f' },
  { id: 'dishwasher', name: 'Dishwasher', category: 'Kitchen', width: 2, height: 2, color: '#b8c4c9' },
  { id: 'sink-kitchen', name: 'Sink', category: 'Kitchen', width: 2.5, height: 2, color: '#b8c4c9' },
  { id: 'pantry', name: 'Pantry', category: 'Kitchen', width: 3, height: 2, color: '#8a6a45' },
  { id: 'island', name: 'Kitchen Island', category: 'Kitchen', width: 5, height: 3, color: '#c9a876' },
  { id: 'dining-table', name: 'Dining Table', category: 'Kitchen', width: 5, height: 3.3, color: '#c9a876' },
  { id: 'dining-chair', name: 'Dining Chair', category: 'Kitchen', width: 1.6, height: 1.6, color: '#a9835a' },
  { id: 'bar-stool', name: 'Bar Stool', category: 'Kitchen', width: 1.3, height: 1.3, color: '#5c5c5c' },
  { id: 'wine-rack', name: 'Wine Rack', category: 'Kitchen', width: 1.6, height: 1, color: '#8a6a45' },
  { id: 'kitchen-cart', name: 'Kitchen Cart', category: 'Kitchen', width: 3, height: 1.8, color: '#c9a876' },

  // Bathroom
  { id: 'toilet', name: 'Toilet', category: 'Bathroom', width: 1.6, height: 2.3, color: '#dfe6e8' },
  { id: 'bathtub', name: 'Bathtub', category: 'Bathroom', width: 5, height: 2.6, color: '#dfe6e8' },
  { id: 'shower', name: 'Shower', category: 'Bathroom', width: 3, height: 3, color: '#cdd8db' },
  { id: 'sink-bath', name: 'Bathroom Sink', category: 'Bathroom', width: 2, height: 1.6, color: '#dfe6e8' },
  { id: 'linen-cabinet', name: 'Linen Cabinet', category: 'Bathroom', width: 2, height: 1.3, color: '#a9835a' },
  { id: 'mirror-bath', name: 'Bathroom Mirror', category: 'Bathroom', width: 2, height: 0.3, color: '#cfe0e8' },
  { id: 'toilet-paper-holder', name: 'Toilet Paper Holder', category: 'Bathroom', width: 0.6, height: 0.6, color: '#f5f5f0' },

  // Laundry
  { id: 'washer', name: 'Washer', category: 'Laundry', width: 2.5, height: 2.5, color: '#c5ccd1' },
  { id: 'dryer', name: 'Dryer', category: 'Laundry', width: 2.5, height: 2.5, color: '#c5ccd1' },
  { id: 'washer-dryer-stack', name: 'Stacked Washer/Dryer', category: 'Laundry', width: 2.5, height: 2.8, color: '#c5ccd1' },
  { id: 'utility-sink', name: 'Utility Sink', category: 'Laundry', width: 2, height: 1.6, color: '#b8c4c9' },
  { id: 'laundry-basket', name: 'Laundry Basket', category: 'Laundry', width: 1.3, height: 1.3, color: '#e2c9a0' },
  { id: 'ironing-board', name: 'Ironing Board', category: 'Laundry', width: 1.3, height: 4, color: '#8a6a45' },
  { id: 'folding-table', name: 'Folding Table', category: 'Laundry', width: 3, height: 2, color: '#c9a876' },
  { id: 'laundry-cabinet', name: 'Laundry Cabinet', category: 'Laundry', width: 3, height: 1.6, color: '#a9835a' },

  // Office
  { id: 'desk', name: 'Desk', category: 'Office', width: 4.5, height: 2.3, color: '#a9835a' },
  { id: 'office-chair', name: 'Office Chair', category: 'Office', width: 2, height: 2, color: '#5c5c5c' },
  { id: 'filing-cabinet', name: 'Filing Cabinet', category: 'Office', width: 1.6, height: 1.6, color: '#6b6b6b' },
  { id: 'meeting-table', name: 'Meeting Table', category: 'Office', width: 6, height: 3, color: '#c9a876' },
  { id: 'whiteboard', name: 'Whiteboard', category: 'Office', width: 4, height: 0.3, color: '#f5f5f0' },
  { id: 'printer', name: 'Printer', category: 'Office', width: 1.6, height: 1.3, color: '#8f8f8f' },
  { id: 'safe', name: 'Safe', category: 'Office', width: 1.6, height: 1.6, color: '#5c5c5c' },

  // Outdoor
  { id: 'patio-table', name: 'Patio Table', category: 'Outdoor', width: 3.5, height: 3.5, color: '#7a9e7e' },
  { id: 'lounge-chair', name: 'Lounge Chair', category: 'Outdoor', width: 2.3, height: 5, color: '#7a9e7e' },
  { id: 'umbrella', name: 'Umbrella', category: 'Outdoor', width: 3, height: 3, color: '#d97e6b' },
  { id: 'hammock', name: 'Hammock', category: 'Outdoor', width: 6, height: 2.5, color: '#e2c9a0' },
  { id: 'grill', name: 'Grill', category: 'Outdoor', width: 2.3, height: 2, color: '#4a4a4a' },
  { id: 'plant', name: 'Plant', category: 'Outdoor', width: 1.6, height: 1.6, color: '#5f8f5a' },
  { id: 'bench', name: 'Bench', category: 'Outdoor', width: 4.5, height: 1.5, color: '#8a6a45' },
  { id: 'fence', name: 'Fence', category: 'Outdoor', width: 8, height: 0.4, color: '#9c8462' },
  { id: 'pool', name: 'Pool', category: 'Outdoor', width: 10, height: 6, color: '#5eb0c9' },
  { id: 'trampoline', name: 'Trampoline', category: 'Outdoor', width: 5, height: 5, color: '#4a4a4a' },
  { id: 'shed', name: 'Shed', category: 'Outdoor', width: 6, height: 5, color: '#8a6a45' },

  // Doors & Windows
  { id: 'door', name: 'Door', category: 'Doors & Windows', width: 3, height: 0.5, color: '#8a6a45' },
  { id: 'sliding-door', name: 'Sliding Door', category: 'Doors & Windows', width: 5, height: 0.5, color: '#8fc7e0' },
  { id: 'window', name: 'Window', category: 'Doors & Windows', width: 3.3, height: 0.4, color: '#8fc7e0' },
  { id: 'large-window', name: 'Large Window', category: 'Doors & Windows', width: 6, height: 0.4, color: '#8fc7e0' },
];

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.id === id);
}
