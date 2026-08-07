import type { Room, Wall } from '../state/types';

interface WallSnapSource {
  rooms: Room[];
  walls: Wall[];
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function rotatePoint(x: number, y: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) };
}

function roomEdges(room: Room): Segment[] {
  const corners = [
    { x: 0, y: 0 },
    { x: room.width, y: 0 },
    { x: room.width, y: room.height },
    { x: 0, y: room.height },
  ].map((c) => {
    const r = rotatePoint(c.x, c.y, room.rotation);
    return { x: r.x + room.x, y: r.y + room.y };
  });
  return [
    { x1: corners[0].x, y1: corners[0].y, x2: corners[1].x, y2: corners[1].y },
    { x1: corners[1].x, y1: corners[1].y, x2: corners[2].x, y2: corners[2].y },
    { x1: corners[2].x, y1: corners[2].y, x2: corners[3].x, y2: corners[3].y },
    { x1: corners[3].x, y1: corners[3].y, x2: corners[0].x, y2: corners[0].y },
  ];
}

function wallSegment(wall: Wall): Segment {
  const rad = (wall.rotation * Math.PI) / 180;
  return {
    x1: wall.x,
    y1: wall.y,
    x2: wall.x + wall.width * Math.cos(rad),
    y2: wall.y + wall.width * Math.sin(rad),
  };
}

function closestPointOnSegment(px: number, py: number, seg: Segment) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: seg.x1 + t * dx, y: seg.y1 + t * dy };
}

/** Given a door/window's current center point, find the nearest room edge or
 * freestanding wall within `threshold` px and return the point + angle to snap to. */
export function findWallSnap(
  source: WallSnapSource,
  centerX: number,
  centerY: number,
  threshold = 24,
  excludeWallId?: string
): { x: number; y: number; angle: number } | null {
  let best: { dist: number; x: number; y: number; angle: number } | null = null;

  for (const room of source.rooms) {
    for (const edge of roomEdges(room)) {
      const cp = closestPointOnSegment(centerX, centerY, edge);
      const dist = Math.hypot(cp.x - centerX, cp.y - centerY);
      if (!best || dist < best.dist) {
        const angle = (Math.atan2(edge.y2 - edge.y1, edge.x2 - edge.x1) * 180) / Math.PI;
        best = { dist, x: cp.x, y: cp.y, angle };
      }
    }
  }

  for (const wall of source.walls) {
    if (wall.id === excludeWallId) continue;
    const seg = wallSegment(wall);
    const cp = closestPointOnSegment(centerX, centerY, seg);
    const dist = Math.hypot(cp.x - centerX, cp.y - centerY);
    if (!best || dist < best.dist) {
      const angle = (Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) * 180) / Math.PI;
      best = { dist, x: cp.x, y: cp.y, angle };
    }
  }

  if (best && best.dist <= threshold) {
    return { x: best.x, y: best.y, angle: best.angle };
  }
  return null;
}

/** Find the closest point on any room edge or wall segment to (px, py), ignoring
 * alignment/angle — used to snap a plain point (e.g. a wall endpoint) in place. */
export function findPointSnap(
  source: WallSnapSource,
  px: number,
  py: number,
  threshold = 16,
  excludeWallId?: string
): { x: number; y: number } | null {
  const snap = findWallSnap(source, px, py, threshold, excludeWallId);
  return snap ? { x: snap.x, y: snap.y } : null;
}

/** Center point of a top-left-pivoted, rotated rectangle. */
export function rectCenter(x: number, y: number, width: number, height: number, rotationDeg: number) {
  const r = rotatePoint(width / 2, height / 2, rotationDeg);
  return { x: x + r.x, y: y + r.y };
}

/** Inverse of rectCenter: top-left x/y for a rectangle whose center should sit at (cx, cy). */
export function topLeftFromCenter(cx: number, cy: number, width: number, height: number, rotationDeg: number) {
  const r = rotatePoint(width / 2, height / 2, rotationDeg);
  return { x: cx - r.x, y: cy - r.y };
}
