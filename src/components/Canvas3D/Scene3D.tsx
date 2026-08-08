import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { getActivePage, usePlannerStore } from '../../state/store';
import type { FurnitureItem, Page, Wall as WallEntity } from '../../state/types';
import { rectCenter } from '../../utils/wallSnap';
import { Furniture3D, SEATING } from './Furniture3D';
import { Door3D } from './Door3D';
import { Box, toRad } from './primitives';
import { SurfaceBox } from './textures';
import { WalkControls, WalkHint, type DoorTarget, type SeatTarget } from './WalkControls';
import { computeRoomWallSegments, DOOR_KINDS, WINDOW_KINDS, type WallSegment } from './wallLayout';
import { doorLeafObstacle, isDoorItem, rectObstacle, type Obstacle } from './collision';
import { ItemGizmo, type GizmoMode } from './EditControls';
import { AddItemPanel } from './AddItemPanel';

const WALL_H = 8;
const DEFAULT_WALL_COLOR = '#d9d4c8';
const DOOR_H = 6.75;
const WINDOW_SILL = 2.5;
const WINDOW_HEADER = 6.5;

// Flat/wall-mounted items a walker should be able to step through.
const NON_BLOCKING = new Set(['rug', 'mirror', 'mirror-bath', 'floor-mirror', 'whiteboard']);

function WallSegments({ segments, wallColor, wallTexture }: { segments: WallSegment[]; wallColor?: string; wallTexture?: string }) {
  const color = wallColor ?? DEFAULT_WALL_COLOR;
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'solid') {
          return (
            <SurfaceBox
              key={i}
              x={seg.x}
              y={WALL_H / 2}
              z={seg.z}
              w={seg.w}
              h={WALL_H}
              d={seg.d}
              color={color}
              textureId={wallTexture}
              textureWidthFt={seg.w}
              textureHeightFt={WALL_H}
              castShadow={false}
            />
          );
        }
        if (seg.kind === 'door') {
          // Only the transom above the doorway — the leaf itself is a
          // separate Door3D positioned by the door item's own transform.
          return (
            <SurfaceBox
              key={i}
              x={seg.x}
              y={DOOR_H + (WALL_H - DOOR_H) / 2}
              z={seg.z}
              w={seg.w}
              h={WALL_H - DOOR_H}
              d={seg.d}
              color={color}
              textureId={wallTexture}
              textureWidthFt={seg.w}
              textureHeightFt={WALL_H}
              castShadow={false}
            />
          );
        }
        // window
        return (
          <group key={i}>
            <SurfaceBox
              x={seg.x}
              y={WINDOW_SILL / 2}
              z={seg.z}
              w={seg.w}
              h={WINDOW_SILL}
              d={seg.d}
              color={color}
              textureId={wallTexture}
              textureWidthFt={seg.w}
              textureHeightFt={WALL_H}
              castShadow={false}
            />
            <Box
              x={seg.x}
              y={WINDOW_SILL + (WINDOW_HEADER - WINDOW_SILL) / 2}
              z={seg.z}
              w={seg.w}
              h={WINDOW_HEADER - WINDOW_SILL}
              d={seg.d * 0.7}
              color="#bfe0ea"
              opacity={0.5}
              castShadow={false}
            />
            <SurfaceBox
              x={seg.x}
              y={WINDOW_HEADER + (WALL_H - WINDOW_HEADER) / 2}
              z={seg.z}
              w={seg.w}
              h={WALL_H - WINDOW_HEADER}
              d={seg.d}
              color={color}
              textureId={wallTexture}
              textureWidthFt={seg.w}
              textureHeightFt={WALL_H}
              castShadow={false}
            />
          </group>
        );
      })}
    </>
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
  const walkMode = usePlannerStore((s) => s.walkMode);
  const openDoors = usePlannerStore((s) => s.openDoors);
  const toggleDoor = usePlannerStore((s) => s.toggleDoor);
  const selectedIds = usePlannerStore((s) => s.selectedIds);
  const select = usePlannerStore((s) => s.select);
  const updateEntity = usePlannerStore((s) => s.updateEntity);
  const addItemFromCatalog = usePlannerStore((s) => s.addItemFromCatalog);
  const [locked, setLocked] = useState(false);
  const [nearDoor, setNearDoor] = useState<string | null>(null);
  const [nearSeat, setNearSeat] = useState<string | null>(null);
  const [sitting, setSitting] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('move');
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const orbitControlsRef = useRef<any>(null);
  // A gizmo drag's mouseup often lands over open floor, which would
  // otherwise fire the floor's deselect-on-click right after finishing a
  // drag. Set for one click right as a drag ends, then consumed/cleared.
  const suppressNextDeselectRef = useRef(false);

  // Editing (selecting/dragging/placing) needs a free mouse cursor — while
  // walking with the pointer locked, only the walkthrough itself owns clicks.
  const editingEnabled = !walkMode || !locked;

  const doorWindowItems = page.items.filter((i) => DOOR_KINDS.has(i.catalogId) || WINDOW_KINDS.has(i.catalogId));
  const doorItems = doorWindowItems.filter(isDoorItem);
  const regularItems = page.items.filter((i) => !DOOR_KINDS.has(i.catalogId) && !WINDOW_KINDS.has(i.catalogId));
  const selectedItem: FurnitureItem | undefined =
    editingEnabled && selectedIds.length === 1 ? regularItems.find((i) => i.id === selectedIds[0]) : undefined;

  const bounds = computeBounds(page, scale);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minY + bounds.maxY) / 2;
  const spanFt = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 12);

  const roomSegments = useMemo(
    () => page.rooms.map((room) => ({ room, segments: computeRoomWallSegments(room, doorWindowItems, scale) })),
    [page.rooms, doorWindowItems, scale],
  );

  const obstacles = useMemo<Obstacle[]>(() => {
    const list: Obstacle[] = [];
    for (const { room, segments } of roomSegments) {
      const originX = room.x / scale;
      const originZ = room.y / scale;
      const rotY = toRad(room.rotation);
      for (const seg of segments) {
        if (seg.kind === 'door') continue; // handled per-door-item below
        list.push(rectObstacle(originX, originZ, rotY, seg.x, seg.z, seg.w, seg.d));
      }
    }
    for (const wall of page.walls) {
      const length = wall.width / scale;
      const t = wall.height / scale;
      list.push(rectObstacle(wall.x / scale, wall.y / scale, toRad(wall.rotation), length / 2, 0, length, t));
    }
    for (const item of regularItems) {
      // Elevated items (e.g. a microwave stacked on a table) already have
      // whatever they're resting on as a ground-level obstacle; they don't
      // need their own, or you couldn't walk under the table.
      if (NON_BLOCKING.has(item.catalogId) || (item.elevation ?? 0) > 0) continue;
      const w = item.width / scale;
      const d = item.height / scale;
      list.push(rectObstacle(item.x / scale, item.y / scale, toRad(item.rotation), w / 2, d / 2, w, d));
    }
    for (const item of doorItems) {
      if (!openDoors[item.id]) list.push(doorLeafObstacle(item, scale, false));
    }
    return list;
  }, [roomSegments, page.walls, regularItems, doorItems, openDoors, scale]);

  const doorTargets = useMemo<DoorTarget[]>(
    () =>
      doorItems.map((item) => {
        const center = rectCenter(item.x, item.y, item.width, item.height, item.rotation);
        return { id: item.id, x: center.x / scale, z: center.y / scale };
      }),
    [doorItems, scale],
  );

  const seatTargets = useMemo<SeatTarget[]>(
    () =>
      regularItems
        .filter((item) => SEATING.has(item.catalogId))
        .map((item) => {
          const center = rectCenter(item.x, item.y, item.width, item.height, item.rotation);
          return { id: item.id, x: center.x / scale, z: center.y / scale };
        }),
    [regularItems, scale],
  );

  return (
    <div className="relative h-full w-full bg-slate-200">
      <Canvas
        key={walkMode ? 'walk' : 'orbit'}
        shadows
        camera={{ position: [centerX + spanFt * 0.85, spanFt * 0.95, centerZ + spanFt * 0.85], fov: 40 }}
      >
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
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[centerX, -0.02, centerZ]}
          receiveShadow
          onClick={(e) => {
            if (!editingEnabled) return;
            e.stopPropagation();
            if (suppressNextDeselectRef.current) {
              suppressNextDeselectRef.current = false;
              return;
            }
            select([]);
          }}
        >
          <planeGeometry args={[spanFt * 4, spanFt * 4]} />
          <meshStandardMaterial color="#eef1f4" />
        </mesh>
        {roomSegments.map(({ room, segments }) => {
          const wFt = room.width / scale;
          const hFt = room.height / scale;
          return (
            <group key={room.id} position={[room.x / scale, 0, room.y / scale]} rotation={[0, toRad(room.rotation), 0]}>
              <Box x={wFt / 2} y={0.03} z={hFt / 2} w={wFt} h={0.06} d={hFt} color={room.fill} castShadow={false} />
              <WallSegments segments={segments} wallColor={room.wallColor} wallTexture={room.wallTexture} />
            </group>
          );
        })}
        {page.walls.map((wall) => (
          <Wall3D key={wall.id} wall={wall} scale={scale} />
        ))}
        {doorItems.map((item) => (
          <Door3D key={item.id} item={item} scale={scale} open={!!openDoors[item.id]} />
        ))}
        {regularItems.map((item) => {
          const inner = (
            <group scale={[1, item.heightScale ?? 1, 1]}>
              <Furniture3D item={item} w={item.width / scale} d={item.height / scale} />
            </group>
          );
          if (item.id === selectedItem?.id) {
            return (
              <ItemGizmo
                key={item.id}
                item={item}
                scale={scale}
                mode={gizmoMode}
                position={[item.x / scale, (item.elevation ?? 0) / scale, item.y / scale]}
                rotationY={toRad(item.rotation)}
                orbitControlsRef={orbitControlsRef}
                onCommit={(changes) => updateEntity(item.id, changes, { commit: true })}
                onDragEnd={() => {
                  suppressNextDeselectRef.current = true;
                }}
              >
                {inner}
              </ItemGizmo>
            );
          }
          return (
            <group
              key={item.id}
              position={[item.x / scale, (item.elevation ?? 0) / scale, item.y / scale]}
              rotation={[0, toRad(item.rotation), 0]}
              onClick={(e) => {
                if (!editingEnabled) return;
                e.stopPropagation();
                select([item.id]);
              }}
            >
              {inner}
            </group>
          );
        })}
        {walkMode ? (
          <WalkControls
            spawn={[centerX, 0, centerZ]}
            onLockChange={setLocked}
            obstacles={obstacles}
            doors={doorTargets}
            onToggleDoor={toggleDoor}
            onNearDoorChange={setNearDoor}
            seats={seatTargets}
            onNearSeatChange={setNearSeat}
            onSitChange={setSitting}
          />
        ) : (
          <OrbitControls
            ref={orbitControlsRef}
            target={[centerX, 1, centerZ]}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={5}
            maxDistance={spanFt * 4}
          />
        )}
      </Canvas>
      {walkMode && <WalkHint active={locked} nearDoor={!!nearDoor} nearSeat={!!nearSeat} sitting={!!sitting} />}
      {editingEnabled && (
        <div className="pointer-events-none absolute inset-0">
          {addPanelOpen ? (
            <AddItemPanel
              onPick={(catalogId) => {
                const id = addItemFromCatalog(catalogId, centerX * scale, centerZ * scale);
                if (id) {
                  select([id]);
                  setGizmoMode('move');
                }
                setAddPanelOpen(false);
              }}
              onClose={() => setAddPanelOpen(false)}
            />
          ) : (
            <button
              onClick={() => setAddPanelOpen(true)}
              className="pointer-events-auto absolute left-3 top-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              + Add Item
            </button>
          )}
          {selectedItem && (
            <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              {(['move', 'resize', 'rotate'] as GizmoMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setGizmoMode(m)}
                  className={`rounded px-3 py-1.5 text-xs font-medium capitalize ${
                    gizmoMode === m ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {m}
                </button>
              ))}
              <button onClick={() => select([])} className="rounded px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
