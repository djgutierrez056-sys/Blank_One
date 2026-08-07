export interface Room {
  id: string;
  kind: 'room';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  labelX: number; // local, unrotated offset from the room's x/y
  labelY: number;
  fill: string;
  wallThickness: number;
}

export interface FurnitureItem {
  id: string;
  kind: 'item';
  catalogId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  label: string;
  flipped?: boolean; // for doors: which side of the wall it swings into
}

export interface Wall {
  id: string;
  kind: 'wall';
  x: number;
  y: number;
  width: number; // length of the wall segment
  height: number; // thickness
  rotation: number;
  color: string;
  label: string;
}

export interface TextLabel {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  width: number; // wrap width; also used as the resize handle bounding box
  height: number;
  rotation: number;
  text: string;
  fontSize: number;
  color: string;
  label: string; // unused for text, kept so it satisfies the shared Entity fields
}

export type Entity = Room | FurnitureItem | Wall | TextLabel;

export interface Page {
  id: string;
  name: string;
  rooms: Room[];
  items: FurnitureItem[];
  walls: Wall[];
  texts: TextLabel[];
}

export interface Project {
  name: string;
  pages: Page[];
  activePageId: string;
  scale: number; // px per foot
  gridSnap: number; // feet
  showLabels: boolean;
}

export type ToolMode = 'select' | 'draw-room' | 'draw-wall' | 'place-text';
