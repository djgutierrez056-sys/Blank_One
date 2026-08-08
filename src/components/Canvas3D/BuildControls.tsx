import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getCatalogEntry } from '../../data/catalog';

/** Curated quick-place list for the walk-mode hotbar, keys 1-9. */
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
}

function findItem(object: THREE.Object3D): { id: string; name: string } | null {
  let cur: THREE.Object3D | null = object;
  while (cur) {
    if (cur.userData?.itemId) return { id: cur.userData.itemId as string, name: (cur.userData.itemName as string) ?? '' };
    cur = cur.parent;
  }
  return null;
}

/** Minecraft-style building while the mouse stays locked: a fixed forward
 * raycast from the camera finds whatever's under the crosshair — an empty
 * surface (floor, or the top of another item) to place on, or an existing
 * item to resize/rotate/remove. A translucent footprint preview follows the
 * crosshair (green when placeable, red when not) so it's clear where G will
 * land before you press it. No mouse cursor is ever needed. */
export function BuildControls({
  active,
  hotbar,
  hotbarIndex,
  onHotbarIndexChange,
  onTargetChange,
  onPlace,
  onResizeItem,
  onRotateItem,
  onDeleteItem,
}: {
  active: boolean;
  hotbar: string[];
  hotbarIndex: number;
  onHotbarIndexChange: (i: number) => void;
  onTargetChange: (target: CrosshairTarget | null) => void;
  onPlace: (catalogId: string, point: [number, number, number], yawDeg: number) => void;
  onResizeItem: (itemId: string, deltaFraction: number) => void;
  onRotateItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  const { camera, scene } = useThree();
  const targetRef = useRef<CrosshairTarget | null>(null);
  const hotbarRef = useRef(hotbar);
  hotbarRef.current = hotbar;
  const hotbarIndexRef = useRef(hotbarIndex);
  hotbarIndexRef.current = hotbarIndex;
  const activeRef = useRef(active);
  activeRef.current = active;
  const previewRef = useRef<THREE.Mesh>(null);
  const previewMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= hotbarRef.current.length) onHotbarIndexChange(n - 1);
      } else if (e.code === 'KeyG') {
        const t = targetRef.current;
        if (t?.canPlace) {
          const yawDeg = (-camera.rotation.y * 180) / Math.PI;
          onPlace(hotbarRef.current[hotbarIndexRef.current], t.point, yawDeg);
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
    window.addEventListener('keydown', down);
    window.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('wheel', wheel);
    };
  }, [camera, onHotbarIndexChange, onPlace, onResizeItem, onRotateItem, onDeleteItem]);

  const raycaster = useRef(new THREE.Raycaster());

  useFrame(() => {
    if (!active) {
      if (targetRef.current) {
        targetRef.current = null;
        onTargetChange(null);
      }
      if (previewRef.current) previewRef.current.visible = false;
      return;
    }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    raycaster.current.set(camera.position, dir);
    raycaster.current.far = MAX_REACH;
    const hits = raycaster.current.intersectObjects(scene.children, true);
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
      };
      break;
    }
    const changed =
      (next?.itemId ?? null) !== (targetRef.current?.itemId ?? null) ||
      (next?.canPlace ?? null) !== (targetRef.current?.canPlace ?? null) ||
      (next === null) !== (targetRef.current === null);
    targetRef.current = next;
    if (changed) onTargetChange(next);

    // Move the ghost preview to follow the crosshair every frame, sized to
    // the currently-selected hotbar item's real footprint and facing the
    // way the player is currently facing (matching what G would place).
    if (previewRef.current && previewMaterialRef.current) {
      if (next) {
        const entry = getCatalogEntry(hotbarRef.current[hotbarIndexRef.current]);
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
    <mesh ref={previewRef} visible={false} renderOrder={999}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial ref={previewMaterialRef} color="#4ade80" transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}

export function hotbarLabel(catalogId: string): string {
  return getCatalogEntry(catalogId)?.name ?? catalogId;
}
