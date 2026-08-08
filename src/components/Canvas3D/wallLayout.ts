import type { FurnitureItem, Room } from '../../state/types';
import { rectCenter } from '../../utils/wallSnap';

const DOOR_KINDS = new Set(['door', 'sliding-door']);
const WINDOW_KINDS = new Set(['window', 'large-window']);

interface Side {
  origin: [number, number];
  dirU: [number, number];
  dirV: [number, number];
  length: number;
}

export function sidePoint(side: Side, u: number, v: number): [number, number] {
  return [side.origin[0] + side.dirU[0] * u + side.dirV[0] * v, side.origin[1] + side.dirU[1] * u + side.dirV[1] * v];
}

interface GapInterval {
  start: number;
  end: number;
  kind: 'door' | 'window';
}

function buildTimeline(length: number, gapsIn: GapInterval[]) {
  const gaps = gapsIn
    .map((g) => ({ start: Math.max(0, g.start), end: Math.min(length, g.end), kind: g.kind }))
    .filter((g) => g.end - g.start > 0.05)
    .sort((a, b) => a.start - b.start);
  const merged: GapInterval[] = [];
  for (const g of gaps) {
    const last = merged[merged.length - 1];
    if (last && g.start <= last.end + 0.05) {
      last.end = Math.max(last.end, g.end);
    } else {
      merged.push({ ...g });
    }
  }
  const segments: { from: number; to: number; kind: 'solid' | 'door' | 'window' }[] = [];
  let cursor = 0;
  for (const g of merged) {
    if (g.start - cursor > 0.05) segments.push({ from: cursor, to: g.start, kind: 'solid' });
    segments.push({ from: g.start, to: g.end, kind: g.kind });
    cursor = g.end;
  }
  if (length - cursor > 0.05) segments.push({ from: cursor, to: length, kind: 'solid' });
  return segments;
}

/** A wall chunk in room-local feet space (pre room transform), always
 * axis-aligned relative to the room — `w`/`d` already encode which way the
 * run goes (top/bottom sides put the long dimension in `w`, left/right put
 * it in `d`), so no local rotation is needed on top of the room's own. */
export interface WallSegment {
  kind: 'solid' | 'door' | 'window';
  x: number;
  z: number;
  w: number;
  d: number;
  extendStart: number;
  extendEnd: number;
}

/** Builds the four wall runs for a room, split into solid/door/window
 * chunks by projecting each door/window item onto the nearest side. Shared
 * by the 3D renderer (Scene3D) and the walkthrough collision builder so the
 * two can never disagree about where a wall actually is. */
export function computeRoomWallSegments(room: Room, doorWindowItems: FurnitureItem[], scale: number): WallSegment[] {
  const wFt = room.width / scale;
  const hFt = room.height / scale;
  const t = room.wallThickness / scale;
  const rad = (room.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const sides: Record<'top' | 'bottom' | 'left' | 'right', Side> = {
    top: { origin: [0, 0], dirU: [1, 0], dirV: [0, 1], length: wFt },
    bottom: { origin: [0, hFt], dirU: [1, 0], dirV: [0, -1], length: wFt },
    left: { origin: [0, 0], dirU: [0, 1], dirV: [1, 0], length: hFt },
    right: { origin: [wFt, 0], dirU: [0, 1], dirV: [-1, 0], length: hFt },
  };
  const gapLists: Record<'top' | 'bottom' | 'left' | 'right', GapInterval[]> = { top: [], bottom: [], left: [], right: [] };

  for (const item of doorWindowItems) {
    const isDoor = DOOR_KINDS.has(item.catalogId);
    const kind: 'door' | 'window' = isDoor ? 'door' : 'window';
    const center = rectCenter(item.x, item.y, item.width, item.height, item.rotation);
    const dx = center.x - room.x;
    const dy = center.y - room.y;
    const lx = (dx * cos + dy * sin) / scale;
    const ly = (-dx * sin + dy * cos) / scale;
    const lenFt = item.width / scale;
    const half = lenFt / 2;
    const angleDiff = (((item.rotation - room.rotation) % 360) + 360) % 360;
    const nearHoriz = angleDiff < 12 || Math.abs(angleDiff - 180) < 12;
    const nearVert = Math.abs(angleDiff - 90) < 12 || Math.abs(angleDiff - 270) < 12;
    const thresh = t / 2 + 0.4;

    if (nearHoriz) {
      if (Math.abs(ly) < thresh && lx >= -0.5 && lx <= wFt + 0.5) {
        gapLists.top.push({ start: lx - half, end: lx + half, kind });
      } else if (Math.abs(ly - hFt) < thresh && lx >= -0.5 && lx <= wFt + 0.5) {
        gapLists.bottom.push({ start: lx - half, end: lx + half, kind });
      }
    } else if (nearVert) {
      if (Math.abs(lx) < thresh && ly >= -0.5 && ly <= hFt + 0.5) {
        gapLists.left.push({ start: ly - half, end: ly + half, kind });
      } else if (Math.abs(lx - wFt) < thresh && ly >= -0.5 && ly <= hFt + 0.5) {
        gapLists.right.push({ start: ly - half, end: ly + half, kind });
      }
    }
  }

  const out: WallSegment[] = [];
  for (const key of ['top', 'bottom', 'left', 'right'] as const) {
    const side = sides[key];
    const rotY = side.dirU[0] !== 0 ? 0 : Math.PI / 2;
    const segments = buildTimeline(side.length, gapLists[key]);
    for (const seg of segments) {
      const mid = (seg.from + seg.to) / 2;
      const segLen = seg.to - seg.from;
      if (seg.kind === 'solid') {
        const extendStart = seg.from <= 0.05 ? t / 2 : 0;
        const extendEnd = seg.to >= side.length - 0.05 ? t / 2 : 0;
        const effLen = segLen + extendStart + extendEnd;
        const midAdj = mid + (extendEnd - extendStart) / 2;
        const [x, z] = sidePoint(side, midAdj, 0);
        const w = rotY === 0 ? effLen : t;
        const d = rotY === 0 ? t : effLen;
        out.push({ kind: 'solid', x, z, w, d, extendStart, extendEnd });
      } else {
        const [x, z] = sidePoint(side, mid, 0);
        const w = rotY === 0 ? segLen : t;
        const d = rotY === 0 ? t : segLen;
        out.push({ kind: seg.kind, x, z, w, d, extendStart: 0, extendEnd: 0 });
      }
    }
  }
  return out;
}

export { DOOR_KINDS, WINDOW_KINDS };
