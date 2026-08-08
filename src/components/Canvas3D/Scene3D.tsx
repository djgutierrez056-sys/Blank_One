import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { getActivePage, usePlannerStore } from '../../state/store';
import type { FurnitureItem, Page, Wall as WallEntity } from '../../state/types';
import { rectCenter } from '../../utils/wallSnap';
import { Furniture3D, SEATING } from './Furniture3D';
import { Door3D } from './Door3D';
import { Box, rotate2D, toRad } from './primitives';
import { SurfaceBox } from './textures';
import { WalkControls, WalkHint, type DoorTarget, type SeatTarget } from './WalkControls';
import { computeRoomWallSegments, DOOR_KINDS, WINDOW_KINDS, type WallSegment } from './wallLayout';
import { doorLeafObstacle, isDoorItem, rectObstacle, type Obstacle } from './collision';
import { ItemGizmo, type GizmoMode } from './EditControls';
import { AddItemPanel } from './AddItemPanel';
import { InventoryPanel } from './InventoryPanel';
import { PaintPanel, type Paint } from './PaintPanel';
import { BuildControls, DEFAULT_HOTBAR, hotbarLabel, MIN_SIZE_FT, MAX_SIZE_FT, type CrosshairTarget } from './BuildControls';
import { getCatalogEntry } from '../../data/catalog';
import { getLightSource } from './lights';
import { PlayerAvatar } from './PlayerAvatar';
import { DayNightSky, computeDayNight, type DayNightState } from './DayNightSky';

const WALL_H_BASE = 8;
const DEFAULT_WALL_COLOR = '#d9d4c8';
const DOOR_H_BASE = 6.75;
const WINDOW_SILL_BASE = 2.5;
const WINDOW_HEADER_BASE = 6.5;

// Flat/wall-mounted items a walker should be able to step through.
const NON_BLOCKING = new Set(['rug', 'mirror', 'mirror-bath', 'floor-mirror', 'whiteboard']);

function WallSegments({
  segments,
  wallColor,
  wallTexture,
  wallScale = 1,
}: {
  segments: WallSegment[];
  wallColor?: string;
  wallTexture?: string;
  wallScale?: number;
}) {
  const color = wallColor ?? DEFAULT_WALL_COLOR;
  const WALL_H = WALL_H_BASE * wallScale;
  const DOOR_H = DOOR_H_BASE * wallScale;
  const WINDOW_SILL = WINDOW_SILL_BASE * wallScale;
  const WINDOW_HEADER = WINDOW_HEADER_BASE * wallScale;
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

function Wall3D({ wall, scale, wallScale = 1 }: { wall: WallEntity; scale: number; wallScale?: number }) {
  const length = wall.width / scale;
  const t = wall.height / scale;
  const WALL_H = WALL_H_BASE * wallScale;
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
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const remoteAvatars = usePlannerStore((s) => s.remoteAvatars);
  const wallScale = project.wallScale ?? 1;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const relockPointer = () => {
    wrapperRef.current?.querySelector('canvas')?.requestPointerLock();
  };
  const takePhoto = () => {
    const canvas = wrapperRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${project.name || 'room'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  const [locked, setLocked] = useState(false);
  const [nearDoor, setNearDoor] = useState<string | null>(null);
  const [nearSeat, setNearSeat] = useState<string | null>(null);
  const [sitting, setSitting] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('move');
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [hotbar, setHotbar] = useState<string[]>(DEFAULT_HOTBAR);
  const [hotbarIndex, setHotbarIndex] = useState(0);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [buildModeOn, setBuildModeOn] = useState(false);
  const [paintOpen, setPaintOpen] = useState(false);
  const [heldPaint, setHeldPaint] = useState<Paint | null>(null);
  const [dayNight, setDayNight] = useState<DayNightState>(() => computeDayNight(9));
  const [dayNightPaused, setDayNightPaused] = useState(false);
  const [crosshairTarget, setCrosshairTarget] = useState<CrosshairTarget | null>(null);
  const lastPlacePointRef = useRef<[number, number, number] | null>(null);
  const handleTargetChange = (target: CrosshairTarget | null) => {
    setCrosshairTarget(target);
    if (target?.canPlace) lastPlacePointRef.current = target.point;
  };
  const orbitControlsRef = useRef<any>(null);
  // A gizmo drag's mouseup often lands over open floor, which would
  // otherwise fire the floor's deselect-on-click right after finishing a
  // drag. Set for one click right as a drag ends, then consumed/cleared.
  const suppressNextDeselectRef = useRef(false);

  // Editing (selecting/dragging/placing) needs a free mouse cursor — while
  // walking with the pointer locked, only the walkthrough itself owns clicks.
  // While Build Mode is on, BuildControls owns the free cursor exclusively
  // (it has its own move/resize/paint interactions), so the orbit-style
  // click-to-select-and-gizmo system stays off to avoid the two fighting
  // over the same click.
  const editingEnabled = !walkMode || (!locked && !buildModeOn);

  const doorWindowItems = page.items.filter((i) => DOOR_KINDS.has(i.catalogId) || WINDOW_KINDS.has(i.catalogId));
  const doorItems = doorWindowItems.filter(isDoorItem);
  const regularItems = page.items.filter((i) => !DOOR_KINDS.has(i.catalogId) && !WINDOW_KINDS.has(i.catalogId));
  const selectedItem: FurnitureItem | undefined =
    editingEnabled && selectedIds.length === 1 ? regularItems.find((i) => i.id === selectedIds[0]) : undefined;

  const bounds = computeBounds(page, scale);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minY + bounds.maxY) / 2;
  const spanFt = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 12);

  const rawRoomSegments = useMemo(
    () => page.rooms.map((room) => ({ room, segments: computeRoomWallSegments(room, doorWindowItems, scale) })),
    [page.rooms, doorWindowItems, scale],
  );

  // Two rooms placed edge-to-edge (or one dragged to overlap another) each
  // independently compute a solid wall at the shared boundary, so the same
  // physical wall gets drawn twice at the exact same position -- classic
  // z-fighting, seen as flickering "glitchy" walls. Rooms that share a
  // rotation are compared in world space and any solid segment that lands
  // on top of another room's is dropped, keeping only one.
  const roomSegments = useMemo(() => {
    const WALL_EPS = 0.15; // ft
    const worldCenter = (room: (typeof rawRoomSegments)[number]['room'], seg: WallSegment) => {
      const [wx, wz] = rotate2D(seg.x, seg.z, toRad(room.rotation));
      return { x: room.x / scale + wx, z: room.y / scale + wz };
    };
    const dropped = new Set<string>(); // `${roomIdx}-${segIdx}`
    for (let i = 0; i < rawRoomSegments.length; i++) {
      for (let j = i + 1; j < rawRoomSegments.length; j++) {
        const a = rawRoomSegments[i];
        const b = rawRoomSegments[j];
        if ((((a.room.rotation - b.room.rotation) % 360) + 360) % 360 > 1) continue;
        for (let ai = 0; ai < a.segments.length; ai++) {
          const segA = a.segments[ai];
          if (segA.kind !== 'solid') continue;
          const wa = worldCenter(a.room, segA);
          for (let bi = 0; bi < b.segments.length; bi++) {
            const key = `${j}-${bi}`;
            if (dropped.has(key)) continue;
            const segB = b.segments[bi];
            if (segB.kind !== 'solid') continue;
            const wb = worldCenter(b.room, segB);
            const sameSize = Math.abs(segA.w - segB.w) < WALL_EPS && Math.abs(segA.d - segB.d) < WALL_EPS;
            const samePos = Math.abs(wa.x - wb.x) < WALL_EPS && Math.abs(wa.z - wb.z) < WALL_EPS;
            if (sameSize && samePos) dropped.add(key);
          }
        }
      }
    }
    return rawRoomSegments.map(({ room, segments }, idx) => ({
      room,
      segments: segments.filter((_, si) => !dropped.has(`${idx}-${si}`)),
    }));
  }, [rawRoomSegments, scale]);

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

  const handleBuildPlace = (catalogId: string, point: [number, number, number], yawDeg: number) => {
    const id = addItemFromCatalog(catalogId, point[0] * scale, point[2] * scale);
    if (!id) return;
    const defaultElevationFt = getLightSource(catalogId)?.defaultElevationFt;
    const elevationFt = defaultElevationFt ?? Math.max(0, point[1]);
    updateEntity(id, { elevation: elevationFt * scale, rotation: yawDeg }, { commit: true });
  };

  const handleBuildResize = (itemId: string, deltaFraction: number) => {
    const item = page.items.find((i) => i.id === itemId);
    if (!item) return;
    const factor = 1 + deltaFraction;
    updateEntity(
      itemId,
      {
        width: Math.min(MAX_SIZE_FT * scale, Math.max(MIN_SIZE_FT * scale, item.width * factor)),
        height: Math.min(MAX_SIZE_FT * scale, Math.max(MIN_SIZE_FT * scale, item.height * factor)),
      },
      { commit: true },
    );
  };

  const handleBuildRotate = (itemId: string) => {
    const item = page.items.find((i) => i.id === itemId);
    if (!item) return;
    updateEntity(itemId, { rotation: (item.rotation + 45) % 360 }, { commit: true });
  };

  const handleBuildDelete = (itemId: string) => {
    select([itemId]);
    deleteSelected();
  };

  const handleInventoryPick = (catalogId: string) => {
    const point = lastPlacePointRef.current ?? [centerX, 0, centerZ];
    handleBuildPlace(catalogId, point, 0);
    setInventoryOpen(false);
    relockPointer();
  };

  const getItemRect = (id: string) => {
    const item = page.items.find((i) => i.id === id);
    if (!item) return undefined;
    return {
      x: item.x / scale,
      y: item.y / scale,
      width: item.width / scale,
      height: item.height / scale,
      rotation: item.rotation,
      elevation: (item.elevation ?? 0) / scale,
    };
  };

  const handleMoveItem = (itemId: string, xFt: number, yFt: number, elevationFt: number) => {
    updateEntity(itemId, { x: xFt * scale, y: yFt * scale, elevation: elevationFt * scale }, { commit: true });
  };

  const handleCornerResize = (itemId: string, changes: { x: number; y: number; width: number; height: number }) => {
    updateEntity(
      itemId,
      { x: changes.x * scale, y: changes.y * scale, width: changes.width * scale, height: changes.height * scale },
      { commit: true },
    );
  };

  const handlePaintWall = (roomId: string) => {
    if (!heldPaint) return;
    updateEntity(roomId, { wallColor: heldPaint.color, wallTexture: heldPaint.texture }, { commit: true });
  };

  const handlePaintPick = (paint: Paint | null) => {
    setHeldPaint(paint);
    if (!paint) {
      setPaintOpen(false);
      relockPointer();
    }
  };

  useEffect(() => {
    if (!walkMode) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyI' && !sitting) {
        document.exitPointerLock();
        setInventoryOpen((open) => !open);
      } else if (e.code === 'KeyB' && !sitting && !inventoryOpen && !paintOpen) {
        setBuildModeOn((on) => {
          if (!on) document.exitPointerLock();
          else relockPointer();
          return !on;
        });
      } else if (e.code === 'KeyP' && !sitting && buildModeOn) {
        document.exitPointerLock();
        setPaintOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [walkMode, sitting, inventoryOpen, buildModeOn, paintOpen]);

  return (
    <div ref={wrapperRef} className="relative h-full w-full bg-slate-200">
      <Canvas
        key={walkMode ? 'walk' : 'orbit'}
        shadows
        gl={{ logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
        camera={{
          position: [centerX + spanFt * 0.85, spanFt * 0.95 * Math.max(1, wallScale), centerZ + spanFt * 0.85],
          fov: 40,
        }}
      >
        <DayNightSky center={[centerX, centerZ]} paused={dayNightPaused} onChange={setDayNight} />
        <ambientLight intensity={dayNight.ambientIntensity} color={dayNight.ambientColor} />
        <directionalLight
          position={[
            centerX + dayNight.sunDir[0] * spanFt * 3,
            Math.max(dayNight.sunDir[1], 0.05) * spanFt * 3,
            centerZ + dayNight.sunDir[2] * spanFt * 3,
          ]}
          target-position={[centerX, 0, centerZ]}
          intensity={dayNight.sunIntensity}
          color={dayNight.sunColor}
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
              <group userData={{ wallRoomId: room.id }}>
                <WallSegments segments={segments} wallColor={room.wallColor} wallTexture={room.wallTexture} wallScale={wallScale} />
              </group>
            </group>
          );
        })}
        {page.walls.map((wall) => (
          <Wall3D key={wall.id} wall={wall} scale={scale} wallScale={wallScale} />
        ))}
        {doorItems.map((item) => (
          <Door3D key={item.id} item={item} scale={scale} open={!!openDoors[item.id]} wallScale={wallScale} />
        ))}
        {regularItems.map((item) => {
          const light = getLightSource(item.catalogId);
          const actualWFt = item.width / scale;
          const actualDFt = item.height / scale;
          let renderWFt = actualWFt;
          let renderDFt = actualDFt;
          let visualOffsetX = 0;
          let visualOffsetZ = 0;
          if (item.realWorldSizeLock) {
            const entry = getCatalogEntry(item.catalogId);
            if (entry) {
              renderWFt = entry.width;
              renderDFt = entry.height;
              // Center the real-size model within whatever footprint the
              // item was resized to, rather than pinning it to one corner.
              visualOffsetX = (actualWFt - renderWFt) / 2;
              visualOffsetZ = (actualDFt - renderDFt) / 2;
            }
          }
          const inner = (
            <group position={[visualOffsetX, 0, visualOffsetZ]}>
              <group scale={[1, item.heightScale ?? 1, 1]}>
                <Furniture3D item={item} w={renderWFt} d={renderDFt} />
              </group>
              {light && (
                <pointLight
                  position={[renderWFt / 2, light.heightOffsetFt, renderDFt / 2]}
                  color={light.color}
                  intensity={light.intensity}
                  distance={light.distance}
                  decay={2}
                />
              )}
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
              userData={{ itemId: item.id, itemName: item.label || getCatalogEntry(item.catalogId)?.name || item.catalogId }}
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
        {walkMode && (
          <BuildControls
            active={buildModeOn && !sitting && !inventoryOpen && !paintOpen}
            hotbar={hotbar}
            hotbarIndex={hotbarIndex}
            gridSnapFt={project.gridSnap}
            getItemRect={getItemRect}
            paint={heldPaint}
            onHotbarIndexChange={setHotbarIndex}
            onTargetChange={handleTargetChange}
            onPlace={handleBuildPlace}
            onResizeItem={handleBuildResize}
            onRotateItem={handleBuildRotate}
            onDeleteItem={handleBuildDelete}
            onMoveItem={handleMoveItem}
            onCornerResize={handleCornerResize}
            onPaintWall={handlePaintWall}
          />
        )}
        {walkMode ? (
          <WalkControls
            spawn={[centerX, 0, centerZ]}
            enabled={!buildModeOn}
            humanScale={wallScale}
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
        {Object.entries(remoteAvatars).map(([id, a]) => (
          <PlayerAvatar key={id} clientId={id} color={a.color} name={a.name} />
        ))}
      </Canvas>
      {walkMode && !inventoryOpen && <WalkHint active={locked || buildModeOn} nearDoor={!!nearDoor} nearSeat={!!nearSeat} sitting={!!sitting} />}
      {walkMode && (
        <div className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-[11px] text-white/80">
          <span>
            {(() => {
              const h = Math.floor(dayNight.hour);
              const m = Math.floor((dayNight.hour - h) * 60);
              const h12 = h % 12 === 0 ? 12 : h % 12;
              return `${dayNight.isNight ? '🌙' : '☀️'} ${h12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
            })()}
          </span>
          <button
            title={dayNightPaused ? 'Resume time' : 'Pause time'}
            onClick={() => setDayNightPaused((p) => !p)}
            className="rounded px-1 hover:bg-white/20"
          >
            {dayNightPaused ? '▶' : '⏸'}
          </button>
          <button title="Take a photo" onClick={takePhoto} className="rounded px-1 hover:bg-white/20">
            📷
          </button>
        </div>
      )}
      {walkMode && locked && !sitting && !inventoryOpen && !buildModeOn && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/70">Press B to build</span>
        </div>
      )}
      {walkMode && buildModeOn && !sitting && !inventoryOpen && !paintOpen && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-20 flex justify-center">
            <div className="rounded-md bg-black/60 px-3 py-1.5 text-center text-sm text-white">
              {heldPaint ? (
                <span className="text-xs text-white/70">
                  <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: heldPaint.color ?? '#d9d4c8' }} />
                  {crosshairTarget?.wallRoomId ? 'Click this wall to paint it' : 'Point at a wall to paint · P for palette'}
                </span>
              ) : crosshairTarget?.itemId ? (
                <>
                  <span className="font-medium">{crosshairTarget.itemName}</span>
                  <br />
                  <span className="text-xs text-white/70">
                    Drag to move &middot; drag a yellow handle to resize a corner &middot; scroll to resize both &middot; R
                    to rotate &middot; Del to remove
                    {crosshairTarget.canPlace && hotbar[hotbarIndex] ? ` · G to place ${hotbarLabel(hotbar[hotbarIndex])} here` : ''}
                  </span>
                </>
              ) : crosshairTarget?.canPlace && hotbar[hotbarIndex] ? (
                <span className="text-xs text-white/70">G to place {hotbarLabel(hotbar[hotbarIndex])} here</span>
              ) : crosshairTarget?.canPlace ? (
                <span className="text-xs text-white/70">Slot empty &middot; press I to assign an item</span>
              ) : crosshairTarget?.wallRoomId ? (
                <span className="text-xs text-white/70">Press P to pick a paint, then click this wall</span>
              ) : (
                <span className="text-xs text-white/70">Point at a floor or surface to build &middot; right-click drag to look around</span>
              )}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-1">
            <div className="flex justify-center gap-1">
              {hotbar.map((catalogId, i) => (
                <div
                  key={i}
                  title={hotbarLabel(catalogId)}
                  className={`flex h-10 w-10 flex-col items-center justify-center rounded-md border text-[9px] text-white ${
                    i === hotbarIndex ? 'border-blue-400 bg-blue-600/80 ring-1 ring-blue-300' : 'border-white/30 bg-black/50'
                  } ${!catalogId ? 'opacity-40' : ''}`}
                >
                  <span className="text-[10px] font-semibold">{i + 1}</span>
                  <span className="line-clamp-1 max-w-[36px] text-center leading-tight">{hotbarLabel(catalogId)}</span>
                </div>
              ))}
            </div>
            <span className="pointer-events-auto rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/70">
              Press I for full inventory &middot; P to paint &middot; B to stop building
            </span>
          </div>
        </div>
      )}
      {walkMode && inventoryOpen && (
        <div className="pointer-events-none absolute inset-0">
          <InventoryPanel
            hotbar={hotbar}
            onPick={handleInventoryPick}
            onAssignSlot={(slot, catalogId) => setHotbar((h) => h.map((c, i) => (i === slot ? catalogId : c)))}
            onClose={() => {
              setInventoryOpen(false);
              relockPointer();
            }}
          />
        </div>
      )}
      {walkMode && paintOpen && (
        <div className="pointer-events-none absolute inset-0">
          <PaintPanel
            current={heldPaint}
            onPick={handlePaintPick}
            onClose={() => {
              setPaintOpen(false);
              relockPointer();
            }}
          />
        </div>
      )}
      {editingEnabled && !inventoryOpen && (
        <div className="pointer-events-none absolute inset-0">
          {addPanelOpen ? (
            <AddItemPanel
              onPick={(catalogId) => {
                const id = addItemFromCatalog(catalogId, centerX * scale, centerZ * scale);
                if (id) {
                  const defaultElevationFt = getLightSource(catalogId)?.defaultElevationFt;
                  if (defaultElevationFt) updateEntity(id, { elevation: defaultElevationFt * scale }, { commit: true });
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
