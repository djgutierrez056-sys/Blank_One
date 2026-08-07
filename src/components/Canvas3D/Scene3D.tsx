import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { getActivePage, usePlannerStore } from '../../state/store';
import type { FurnitureItem, Page, Room, Wall as WallEntity } from '../../state/types';
import { rectCenter } from '../../utils/wallSnap';
import { Furniture3D } from './Furniture3D';
import { Box, toRad } from './primitives';

const WALL_H = 8;
const WALL_COLOR = '#d9d4c8';
const DOOR_H = 6.75;
const WINDOW_SILL = 2.5;
const WINDOW_HEADER = 6.5;
const DOOR_KINDS = new Set(['door', 'sliding-door']);
const WINDOW_KINDS = new Set(['window', 'large-window']);

interface GapInterval {
  start: number;
  end: number;
  kind: 'door' | 'window';
}

interface Side {
  origin: [number, number];
  dirU: [number, number];
  dirV: [number, number];
  length: number;
}

function sidePoint(side: Side, u: number, v: number): [number, number] {
  return [side.origin[0] + side.dirU[0] * u + side.dirV[0] * v, side.origin[1] + side.dirU[1] * u + side.dirV[1] * v];
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

/** One straight run of wall (one side of a room), split into solid segments
 * plus door/window openings computed by the caller. */
function WallRun({ side, gaps, thickness }: { side: Side; gaps: GapInterval[]; thickness: number }) {
  const segments = buildTimeline(side.length, gaps);
  const rotY = side.dirU[0] !== 0 ? 0 : Math.PI / 2;

  return (
    <>
      {segments.map((seg, i) => {
        const mid = (seg.from + seg.to) / 2;
        const segLen = seg.to - seg.from;

        if (seg.kind === 'solid') {
          const extendStart = seg.from <= 0.05 ? thickness / 2 : 0;
          const extendEnd = seg.to >= side.length - 0.05 ? thickness / 2 : 0;
          const effLen = segLen + extendStart + extendEnd;
          const midAdj = mid + (extendEnd - extendStart) / 2;
          const [x, z] = sidePoint(side, midAdj, 0);
          const w = rotY === 0 ? effLen : thickness;
          const d = rotY === 0 ? thickness : effLen;
          return <Box key={i} x={x} y={WALL_H / 2} z={z} w={w} h={WALL_H} d={d} color={WALL_COLOR} castShadow={false} />;
        }

        const [x, z] = sidePoint(side, mid, 0);
        const w = rotY === 0 ? segLen : thickness;
        const d = rotY === 0 ? thickness : segLen;

        if (seg.kind === 'door') {
          return (
            <group key={i}>
              <Box x={x} y={DOOR_H / 2} z={z} w={w} h={DOOR_H} d={d} color="#8a6a45" castShadow={false} />
              <Box x={x} y={DOOR_H + (WALL_H - DOOR_H) / 2} z={z} w={w} h={WALL_H - DOOR_H} d={d} color={WALL_COLOR} castShadow={false} />
            </group>
          );
        }

        // window
        return (
          <group key={i}>
            <Box x={x} y={WINDOW_SILL / 2} z={z} w={w} h={WINDOW_SILL} d={d} color={WALL_COLOR} castShadow={false} />
            <Box
              x={x}
              y={WINDOW_SILL + (WINDOW_HEADER - WINDOW_SILL) / 2}
              z={z}
              w={w}
              h={WINDOW_HEADER - WINDOW_SILL}
              d={d * 0.7}
              color="#bfe0ea"
              opacity={0.5}
              castShadow={false}
            />
            <Box x={x} y={WINDOW_HEADER + (WALL_H - WINDOW_HEADER) / 2} z={z} w={w} h={WALL_H - WINDOW_HEADER} d={d} color={WALL_COLOR} castShadow={false} />
          </group>
        );
      })}
    </>
  );
}

function Room3D({ room, scale, doorWindowItems }: { room: Room; scale: number; doorWindowItems: FurnitureItem[] }) {
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

  return (
    <group position={[room.x / scale, 0, room.y / scale]} rotation={[0, toRad(room.rotation), 0]}>
      <Box x={wFt / 2} y={0.03} z={hFt / 2} w={wFt} h={0.06} d={hFt} color={room.fill} castShadow={false} />
      <WallRun side={sides.top} gaps={gapLists.top} thickness={t} />
      <WallRun side={sides.bottom} gaps={gapLists.bottom} thickness={t} />
      <WallRun side={sides.left} gaps={gapLists.left} thickness={t} />
      <WallRun side={sides.right} gaps={gapLists.right} thickness={t} />
    </group>
  );
}

function Wall3D({ wall, scale }: { wall: WallEntity; scale: number }) {
  const length = wall.width / scale;
  const t = wall.height / scale;
  return (
    <group position={[wall.x / scale, 0, wall.y / scale]} rotation={[0, toRad(wall.rotation), 0]}>
      <Box x={length / 2} y={WALL_H / 2} z={0} w={length} h={WALL_H} d={t} color={wall.color} castShadow={false} />
    </group>
  );
}

function computeBounds(page: Page, scale: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const r of page.rooms) {
    consider(r.x, r.y);
    consider(r.x + r.width, r.y + r.height);
  }
  for (const it of page.items) {
    consider(it.x, it.y);
    consider(it.x + it.width, it.y + it.height);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 400, maxY: 400 };
  return { minX: minX / scale, minY: minY / scale, maxX: maxX / scale, maxY: maxY / scale };
}

export function Scene3D() {
  const project = usePlannerStore((s) => s.project);
  const page = getActivePage(project);
  const scale = project.scale;

  const doorWindowItems = page.items.filter((i) => DOOR_KINDS.has(i.catalogId) || WINDOW_KINDS.has(i.catalogId));
  const regularItems = page.items.filter((i) => !DOOR_KINDS.has(i.catalogId) && !WINDOW_KINDS.has(i.catalogId));

  const bounds = computeBounds(page, scale);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minY + bounds.maxY) / 2;
  const spanFt = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 12);

  return (
    <div className="h-full w-full bg-slate-200">
      <Canvas shadows camera={{ position: [centerX + spanFt * 0.85, spanFt * 0.95, centerZ + spanFt * 0.85], fov: 40 }}>
        <color attach="background" args={['#dbe3ea']} />
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[centerX + spanFt, spanFt * 1.6, centerZ + spanFt * 0.6]}
          target-position={[centerX, 0, centerZ]}
          intensity={1.15}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-spanFt * 1.2}
          shadow-camera-right={spanFt * 1.2}
          shadow-camera-top={spanFt * 1.2}
          shadow-camera-bottom={-spanFt * 1.2}
          shadow-camera-near={0.5}
          shadow-camera-far={spanFt * 4}
          shadow-bias={-0.0005}
          shadow-normalBias={0.08}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, -0.02, centerZ]} receiveShadow>
          <planeGeometry args={[spanFt * 4, spanFt * 4]} />
          <meshStandardMaterial color="#eef1f4" />
        </mesh>
        {page.rooms.map((room) => (
          <Room3D key={room.id} room={room} scale={scale} doorWindowItems={doorWindowItems} />
        ))}
        {page.walls.map((wall) => (
          <Wall3D key={wall.id} wall={wall} scale={scale} />
        ))}
        {regularItems.map((item) => (
          <group key={item.id} position={[item.x / scale, 0, item.y / scale]} rotation={[0, toRad(item.rotation), 0]}>
            <Furniture3D item={item} w={item.width / scale} d={item.height / scale} />
          </group>
        ))}
        <OrbitControls
          target={[centerX, 1, centerZ]}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={5}
          maxDistance={spanFt * 4}
        />
      </Canvas>
    </div>
  );
}
