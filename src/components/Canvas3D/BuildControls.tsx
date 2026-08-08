import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getCatalogEntry } from '../../data/catalog';

/** Curated quick-place list for the walk-mode hotbar, keys 1-9. An empty
 * string means the slot has been cleared (see InventoryPanel) so nothing
 * previews/places from it. */
export const DEFAULT_HOTBAR: string[] = [
  'sofa',
  'armchair',
  'coffee-table',
  'dining-table',
  'bed-queen',
  'floor-lamp',
  'plant',
  'bookshelf',
  'rug',
];

const MAX_REACH = 15; // ft
const RESIZE_STEP = 0.04; // fraction per wheel notch
const PREVIEW_HEIGHT = 2; // ft, purely illustrative — doesn't need to match the real model
export const MIN_SIZE_FT = 0.5;
export const MAX_SIZE_FT = 20;

export interface CrosshairTarget {
  point: [number, number, number];
  itemId: string | null;
  itemName: string | null;
  /** Whether this point is a roughly horizontal, upward-facing surface
   * (floor, tabletop) — placement is disallowed on walls/vertical faces so
   * items don't end up floating mid-air stuck to a wall. */
  canPlace: boolean;
  /** The room whose wall this point is on, if any — lets the paint tool
   * repaint a room's walls by clicking one, without an itemId being set. */
  wallRoomId: string | null;
}

export interface ItemRect {
  x: number; // ft, top-left/pivot
  y: number; // ft, top-left/pivot (this is the plan's "z" axis)
  width: number; // ft
  height: number; // ft
  rotation: number; // degrees
  elevation: number; // ft
}

function findItem(object: THREE.Object3D): { id: string; name: string } | null {
  let cur: THREE.Object3D | null = object;
  while (cur) {
    if (cur.userData?.itemId) return { id: cur.userData.itemId as string, name: (cur.userData.itemName as string) ?? '' };
    cur = cur.parent;
  }
  return null;
}

function findWallRoom(object: THREE.Object3D): string | null {
  let cur: THREE.Object3D | null = object;
  while (cur) {
    if (cur.userData?.wallRoomId) return cur.userData.wallRoomId as string;
    cur = cur.parent;
  }
  return null;
}

function rotate2D(x: number, z: number, rad: number): [number, number] {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x * c + z * s, -x * s + z * c];
}

function footprintCorners(rect: ItemRect): [number, number][] {
  const rad = (rect.rotation * Math.PI) / 180;
  const local: [number, number][] = [
    [0, 0],
    [rect.width, 0],
    [0, rect.height],
    [rect.width, rect.height],
  ];
  return local.map(([lx, lz]) => {
    const [wx, wz] = rotate2D(lx, lz, rad);
    return [rect.x + wx, rect.y + wz];
  });
}

interface CornerDrag {
  mode: 'corner';
  id: string;
  cornerIndex: number;
  fixedWorld: [number, number]; // ft, xz
  rotationRad: number;
  planeY: number; // ft
  origWidth: number;
  origHeight: number;
}

interface MoveDrag {
  mode: 'move';
  id: string;
  grabOffsetX: number; // ft, pivot - initial grab point
  grabOffsetZ: number;
  width: number;
  height: number;
  rotation: number;
}

type DragState = CornerDrag | MoveDrag;

/** Minecraft-style building while the mouse stays locked: a fixed forward
 * raycast from the camera finds whatever's under the crosshair — an empty
 * surface (floor, or the top of another item) to place on, or an existing
 * item to resize/rotate/remove/move. A translucent footprint preview follows
 * the crosshair (green when placeable, red when not) so it's clear where G
 * will land before you press it. Hold left-click on an existing item to drag
 * it around; hold right-click near one of its corners to resize just that
 * corner, anchored on the opposite one. No mouse cursor is ever needed. */
export function BuildControls({
  active,
  hotbar,
  hotbarIndex,
  gridSnapFt,
  getItemRect,
  paint,
  onHotbarIndexChange,
  onTargetChange,
  onPlace,
  onResizeItem,
  onRotateItem,
  onDeleteItem,
  onMoveItem,
  onCornerResize,
  onPaintWall,
}: {
  active: boolean;
  hotbar: string[];
  hotbarIndex: number;
  gridSnapFt: number;
  getItemRect: (id: string) => ItemRect | undefined;
  paint: { color?: string; texture?: string } | null;
  onHotbarIndexChange: (i: number) => void;
  onTargetChange: (target: CrosshairTarget | null) => void;
  onPlace: (catalogId: string, point: [number, number, number], yawDeg: number) => void;
  onResizeItem: (itemId: string, deltaFraction: number) => void;
  onRotateItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onMoveItem: (itemId: string, x: number, y: number, elevation: number) => void;
  onCornerResize: (itemId: string, changes: { x: number; y: number; width: number; height: number }) => void;
  onPaintWall: (roomId: string) => void;
}) {
  const { camera, scene } = useThree();
  const targetRef = useRef<CrosshairTarget | null>(null);
  const hotbarRef = useRef(hotbar);
  hotbarRef.current = hotbar;
  const hotbarIndexRef = useRef(hotbarIndex);
  hotbarIndexRef.current = hotbarIndex;
  const activeRef = useRef(active);
  activeRef.current = active;
  const getItemRectRef = useRef(getItemRect);
  getItemRectRef.current = getItemRect;
  const gridSnapRef = useRef(gridSnapFt);
  gridSnapRef.current = gridSnapFt;
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const previewRef = useRef<THREE.Mesh>(null);
  const previewMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dragPreviewRef = useRef<THREE.Mesh>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragResultRef = useRef<{ x: number; y: number; width: number; height: number; elevation: number } | null>(null);

  useEffect(() => {
    const endDrag = () => {
      const drag = dragRef.current;
      const result = dragResultRef.current;
      if (drag && result) {
        if (drag.mode === 'move') {
          onMoveItem(drag.id, result.x, result.y, result.elevation);
        } else {
          onCornerResize(drag.id, { x: result.x, y: result.y, width: result.width, height: result.height });
        }
      }
      dragRef.current = null;
      dragResultRef.current = null;
    };

    const down = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= hotbarRef.current.length) onHotbarIndexChange(n - 1);
      } else if (e.code === 'KeyG') {
        const t = targetRef.current;
        const catalogId = hotbarRef.current[hotbarIndexRef.current];
        if (t?.canPlace && catalogId && !paintRef.current) {
          const yawDeg = (-camera.rotation.y * 180) / Math.PI;
          onPlace(catalogId, t.point, yawDeg);
        }
      } else if (e.code === 'KeyR') {
        const t = targetRef.current;
        if (t?.itemId) onRotateItem(t.itemId);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        const t = targetRef.current;
        if (t?.itemId) onDeleteItem(t.itemId);
      }
    };
    const wheel = (e: WheelEvent) => {
      if (!activeRef.current) return;
      const t = targetRef.current;
      if (!t?.itemId) return;
      e.preventDefault();
      onResizeItem(t.itemId, e.deltaY < 0 ? RESIZE_STEP : -RESIZE_STEP);
    };
    const mousedown = (e: MouseEvent) => {
      if (!activeRef.current || dragRef.current) return;
      const t = targetRef.current;
      if (e.button === 0 && paintRef.current && t?.wallRoomId && !t.itemId) {
        onPaintWall(t.wallRoomId);
        return;
      }
      if (!t?.itemId) return;
      if (e.button === 0) {
        const rect = getItemRectRef.current(t.itemId);
        if (!rect) return;
        dragRef.current = {
          mode: 'move',
          id: t.itemId,
          grabOffsetX: rect.x - t.point[0],
          grabOffsetZ: rect.y - t.point[2],
          width: rect.width,
          height: rect.height,
          rotation: rect.rotation,
        };
      } else if (e.button === 2) {
        const rect = getItemRectRef.current(t.itemId);
        if (!rect) return;
        const corners = footprintCorners(rect);
        let best = 0;
        let bestDist = Infinity;
        corners.forEach(([cx, cz], i) => {
          const dist = (cx - t.point[0]) ** 2 + (cz - t.point[2]) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });
        const opposite = 3 - best;
        dragRef.current = {
          mode: 'corner',
          id: t.itemId,
          cornerIndex: best,
          fixedWorld: corners[opposite],
          rotationRad: (rect.rotation * Math.PI) / 180,
          planeY: rect.elevation,
          origWidth: rect.width,
          origHeight: rect.height,
        };
      }
    };
    const mouseup = (e: MouseEvent) => {
      if ((e.button === 0 || e.button === 2) && dragRef.current) endDrag();
    };
    const contextmenu = (e: MouseEvent) => {
      if (activeRef.current) e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('mousedown', mousedown);
    window.addEventListener('mouseup', mouseup);
    window.addEventListener('contextmenu', contextmenu);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('mousedown', mousedown);
      window.removeEventListener('mouseup', mouseup);
      window.removeEventListener('contextmenu', contextmenu);
    };
  }, [camera, onHotbarIndexChange, onPlace, onResizeItem, onRotateItem, onDeleteItem, onMoveItem, onCornerResize, onPaintWall]);

  const raycaster = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane());
  const planeHit = useRef(new THREE.Vector3());

  // The ghost preview meshes live in this same scene graph — without this
  // exclusion the crosshair ray can hit its own preview box (positioned
  // exactly along the ray from the previous frame) instead of the real
  // floor/item behind it, feeding back into a runaway height each frame.
  const raycastTargets = () => scene.children.filter((c) => c !== previewRef.current && c !== dragPreviewRef.current);

  useFrame(() => {
    if (!active) {
      if (targetRef.current) {
        targetRef.current = null;
        onTargetChange(null);
      }
      if (previewRef.current) previewRef.current.visible = false;
      if (dragPreviewRef.current) dragPreviewRef.current.visible = false;
      dragRef.current = null;
      dragResultRef.current = null;
      return;
    }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const drag = dragRef.current;
    const snap = (v: number) => (gridSnapRef.current > 0 ? Math.round(v / gridSnapRef.current) * gridSnapRef.current : v);

    if (drag) {
      // While dragging, the placement ghost is hidden and this drag preview
      // (cyan) takes over, showing the live footprint at its would-be
      // landing spot. The actual store isn't touched until release.
      if (previewRef.current) previewRef.current.visible = false;
      if (drag.mode === 'move') {
        raycaster.current.set(camera.position, dir);
        raycaster.current.far = MAX_REACH;
        const hits = raycaster.current.intersectObjects(raycastTargets(), true);
        let hitPoint: THREE.Vector3 | null = null;
        for (const hit of hits) {
          if (!hit.object.visible) continue;
          const found = findItem(hit.object);
          if (found?.id === drag.id) continue; // see past the item being moved
          let canPlace = true;
          if (hit.face) {
            const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
            canPlace = worldNormal.y > 0.5;
          }
          if (!canPlace) break;
          hitPoint = hit.point;
          break;
        }
        if (hitPoint) {
          const x = snap(hitPoint.x + drag.grabOffsetX);
          const y = snap(hitPoint.z + drag.grabOffsetZ);
          dragResultRef.current = { x, y, width: drag.width, height: drag.height, elevation: Math.max(0, hitPoint.y) };
          if (dragPreviewRef.current) {
            const rad = (drag.rotation * Math.PI) / 180;
            const [cx, cz] = rotate2D(drag.width / 2, drag.height / 2, rad);
            dragPreviewRef.current.visible = true;
            dragPreviewRef.current.position.set(x + cx, hitPoint.y + PREVIEW_HEIGHT / 2, y + cz);
            dragPreviewRef.current.scale.set(drag.width, PREVIEW_HEIGHT, drag.height);
            dragPreviewRef.current.rotation.y = rad;
          }
        }
      } else {
        plane.current.set(new THREE.Vector3(0, 1, 0), -drag.planeY);
        raycaster.current.set(camera.position, dir);
        const hit = raycaster.current.ray.intersectPlane(plane.current, planeHit.current);
        if (hit) {
          const fx = drag.fixedWorld[0];
          const fz = drag.fixedWorld[1];
          const dx = hit.x - fx;
          const dz = hit.z - fz;
          const [lx, lz] = rotate2D(dx, dz, -drag.rotationRad);
          const cornersLocalOld: [number, number][] = [
            [0, 0],
            [drag.origWidth, 0],
            [0, drag.origHeight],
            [drag.origWidth, drag.origHeight],
          ];
          const opposite = 3 - drag.cornerIndex;
          const fixedLocalOld = cornersLocalOld[opposite];
          const grabbedLocalOld = cornersLocalOld[drag.cornerIndex];
          const signX = Math.sign(grabbedLocalOld[0] - fixedLocalOld[0]) || 1;
          const signZ = Math.sign(grabbedLocalOld[1] - fixedLocalOld[1]) || 1;
          const newW = Math.min(MAX_SIZE_FT, Math.max(MIN_SIZE_FT, snap(signX * lx)));
          const newH = Math.min(MAX_SIZE_FT, Math.max(MIN_SIZE_FT, snap(signZ * lz)));
          const fixedLocalNew: [number, number] = [opposite === 1 || opposite === 3 ? newW : 0, opposite === 2 || opposite === 3 ? newH : 0];
          const pivotOffset: [number, number] = [-fixedLocalNew[0], -fixedLocalNew[1]];
          const [wx, wz] = rotate2D(pivotOffset[0], pivotOffset[1], drag.rotationRad);
          const pivotX = fx + wx;
          const pivotY = fz + wz;
          dragResultRef.current = { x: pivotX, y: pivotY, width: newW, height: newH, elevation: drag.planeY };
          if (dragPreviewRef.current) {
            const [cx, cz] = rotate2D(newW / 2, newH / 2, drag.rotationRad);
            dragPreviewRef.current.visible = true;
            dragPreviewRef.current.position.set(pivotX + cx, drag.planeY + PREVIEW_HEIGHT / 2, pivotY + cz);
            dragPreviewRef.current.scale.set(newW, PREVIEW_HEIGHT, newH);
            dragPreviewRef.current.rotation.y = drag.rotationRad;
          }
        }
      }
      return;
    }

    if (dragPreviewRef.current) dragPreviewRef.current.visible = false;

    raycaster.current.set(camera.position, dir);
    raycaster.current.far = MAX_REACH;
    const hits = raycaster.current.intersectObjects(raycastTargets(), true);
    let next: CrosshairTarget | null = null;
    for (const hit of hits) {
      if (!hit.object.visible) continue;
      const found = findItem(hit.object);
      let canPlace = true;
      if (hit.face) {
        const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        canPlace = worldNormal.y > 0.5;
      }
      next = {
        point: [hit.point.x, hit.point.y, hit.point.z],
        itemId: found?.id ?? null,
        itemName: found?.name ?? null,
        canPlace,
        wallRoomId: found ? null : findWallRoom(hit.object),
      };
      break;
    }
    const changed =
      (next?.itemId ?? null) !== (targetRef.current?.itemId ?? null) ||
      (next?.canPlace ?? null) !== (targetRef.current?.canPlace ?? null) ||
      (next?.wallRoomId ?? null) !== (targetRef.current?.wallRoomId ?? null) ||
      (next === null) !== (targetRef.current === null);
    targetRef.current = next;
    if (changed) onTargetChange(next);

    // Move the ghost preview to follow the crosshair every frame, sized to
    // the currently-selected hotbar item's real footprint and facing the
    // way the player is currently facing (matching what G would place).
    const catalogId = hotbarRef.current[hotbarIndexRef.current];
    if (previewRef.current && previewMaterialRef.current) {
      if (next && catalogId && !paintRef.current) {
        const entry = getCatalogEntry(catalogId);
        const w = entry?.width ?? 2;
        const d = entry?.height ?? 2;
        previewRef.current.visible = true;
        previewRef.current.position.set(next.point[0], next.point[1] + PREVIEW_HEIGHT / 2, next.point[2]);
        previewRef.current.scale.set(w, PREVIEW_HEIGHT, d);
        previewRef.current.rotation.y = camera.rotation.y;
        previewMaterialRef.current.color.set(next.canPlace ? '#4ade80' : '#f87171');
      } else {
        previewRef.current.visible = false;
      }
    }
  });

  return (
    <>
      <mesh ref={previewRef} visible={false} renderOrder={999}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial ref={previewMaterialRef} color="#4ade80" transparent opacity={0.55} depthTest={false} depthWrite={false} />
        <lineSegments renderOrder={1000}>
          <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
          <lineBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} />
        </lineSegments>
      </mesh>
      <mesh ref={dragPreviewRef} visible={false} renderOrder={999}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.5} depthTest={false} depthWrite={false} />
        <lineSegments renderOrder={1000}>
          <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
          <lineBasicMaterial color="#ffffff" transparent opacity={0.95} depthTest={false} />
        </lineSegments>
      </mesh>
    </>
  );
}

export function hotbarLabel(catalogId: string): string {
  if (!catalogId) return 'Empty';
  return getCatalogEntry(catalogId)?.name ?? catalogId;
}
