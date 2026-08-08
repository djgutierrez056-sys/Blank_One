import { useCallback, useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { FurnitureItem } from '../../state/types';

export type GizmoMode = 'move' | 'resize' | 'rotate';

function isDescendantOf(obj: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}

/** Casts straight down from (x, z) against everything in the scene except
 * `exclude` (the item being moved) and returns the highest surface found —
 * the floor if nothing else is there, or the top of whatever's underneath.
 * This is what makes dragging an item onto a table "just work". */
export function surfaceHeightAt(scene: THREE.Object3D, x: number, z: number, exclude: THREE.Object3D | null): number {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const hit of hits) {
    if (!hit.object.visible) continue;
    if (exclude && isDescendantOf(hit.object, exclude)) continue;
    return Math.max(0, hit.point.y);
  }
  return 0;
}

const THREE_MODE: Record<GizmoMode, 'translate' | 'scale' | 'rotate'> = {
  move: 'translate',
  resize: 'scale',
  rotate: 'rotate',
};

/** Wraps a selected item's group with a drag gizmo (drei's TransformControls)
 * matching the current edit mode. Move is constrained to the X/Z plane with
 * height auto-snapped to whatever surface is underneath; resize converts the
 * gizmo's scale back into width/height/heightScale; rotate writes back the
 * plan's Y rotation. Disables orbit/walk camera controls while dragging so
 * the two don't fight over the mouse. */
export function ItemGizmo({
  item,
  scale,
  mode,
  position,
  rotationY,
  orbitControlsRef,
  onCommit,
  onDragEnd,
  children,
}: {
  item: FurnitureItem;
  scale: number;
  mode: GizmoMode;
  /** Initial position/rotation for the controlled object — must live directly
   * on the object TransformControls wraps, not on a nested child, or the
   * gizmo renders at the wrong spot (world origin) while the mesh itself
   * sits offset inside it. */
  position: [number, number, number];
  rotationY: number;
  orbitControlsRef: React.RefObject<any>;
  onCommit: (changes: Partial<Omit<FurnitureItem, 'kind'>>) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useThree();
  const startRef = useRef({ w: item.width, d: item.height });
  startRef.current = { w: item.width, d: item.height };

  const handleMouseDown = useCallback(() => {
    if (orbitControlsRef.current) orbitControlsRef.current.enabled = false;
  }, [orbitControlsRef]);

  const handleObjectChange = useCallback(() => {
    if (mode !== 'move') return;
    const obj = groupRef.current;
    if (!obj) return;
    obj.position.y = surfaceHeightAt(scene, obj.position.x, obj.position.z, obj);
  }, [mode, scene]);

  const handleMouseUp = useCallback(() => {
    if (orbitControlsRef.current) orbitControlsRef.current.enabled = true;
    onDragEnd();
    const obj = groupRef.current;
    if (!obj) return;
    if (mode === 'move') {
      onCommit({ x: obj.position.x * scale, y: obj.position.z * scale, elevation: obj.position.y * scale });
    } else if (mode === 'resize') {
      const { w, d } = startRef.current;
      onCommit({
        width: Math.max(0.2 * scale, w * obj.scale.x),
        height: Math.max(0.2 * scale, d * obj.scale.z),
        heightScale: Math.max(0.1, obj.scale.y),
      });
      obj.scale.set(1, 1, 1);
    } else if (mode === 'rotate') {
      onCommit({ rotation: (-obj.rotation.y * 180) / Math.PI });
    }
  }, [mode, onCommit, onDragEnd, scale]);

  return (
    <>
      {/* Rendered as a normal scene child (not nested inside TransformControls,
          which would otherwise wrap it in its own unpositioned group) so the
          gizmo attaches to — and therefore appears at — this object's real
          world position via the `object` ref below. */}
      <group ref={groupRef} position={position} rotation={[0, rotationY, 0]}>
        {children}
      </group>
      <TransformControls
        object={groupRef as React.RefObject<THREE.Object3D>}
        mode={THREE_MODE[mode]}
        showX={mode === 'move' || mode === 'resize'}
        showY={mode === 'resize' || mode === 'rotate'}
        showZ={mode === 'move' || mode === 'resize'}
        onMouseDown={handleMouseDown}
        onObjectChange={handleObjectChange}
        onMouseUp={handleMouseUp}
      />
    </>
  );
}
