import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getCatalogEntry } from '../../data/catalog';

/** Curated quick-place list for the walk-mode hotbar, keys 1-9. */
export const HOTBAR: string[] = [
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
 * item to resize/rotate/remove. No mouse cursor is ever needed. */
export function BuildControls({
  active,
  hotbarIndex,
  onHotbarIndexChange,
  onTargetChange,
  onPlace,
  onResizeItem,
  onRotateItem,
  onDeleteItem,
}: {
  active: boolean;
  hotbarIndex: number;
  onHotbarIndexChange: (i: number) => void;
  onTargetChange: (target: CrosshairTarget | null) => void;
  onPlace: (catalogId: string, point: [number, number, number]) => void;
  onResizeItem: (itemId: string, deltaFraction: number) => void;
  onRotateItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  const { camera, scene } = useThree();
  const targetRef = useRef<CrosshairTarget | null>(null);
  const hotbarIndexRef = useRef(hotbarIndex);
  hotbarIndexRef.current = hotbarIndex;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= HOTBAR.length) onHotbarIndexChange(n - 1);
      } else if (e.code === 'KeyG') {
        const t = targetRef.current;
        if (t?.canPlace) onPlace(HOTBAR[hotbarIndexRef.current], t.point);
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
  }, [onHotbarIndexChange, onPlace, onResizeItem, onRotateItem, onDeleteItem]);

  const raycaster = useRef(new THREE.Raycaster());

  useFrame(() => {
    if (!active) {
      if (targetRef.current) {
        targetRef.current = null;
        onTargetChange(null);
      }
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
  });

  return null;
}

export function hotbarLabel(catalogId: string): string {
  return getCatalogEntry(catalogId)?.name ?? catalogId;
}
