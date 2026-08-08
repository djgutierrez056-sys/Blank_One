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
  wallColor?: string; // 3D-only; undefined = the default wall color
  wallTexture?: string; // 3D-only texture id (see textures.ts), undefined = plain color
  locked?: boolean;
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
  flippedX?: boolean; // for doors: which side of the opening the hinge is on
  texture?: string; // for doors, 3D-only finish texture id (see textures.ts)
  elevation?: number; // 3D-only: height of the item's base above the floor, same units as x/y
  heightScale?: number; // 3D-only: vertical scale multiplier for the 3D model, default 1
  locked?: boolean;
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
  locked?: boolean;
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
  locked?: boolean;
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

export interface ChatMessage {
  id: string;
  clientId: string;
  name: string;
  color: string;
  text: string;
  ts: number;
}
