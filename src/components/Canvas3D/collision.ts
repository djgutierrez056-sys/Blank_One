import * as THREE from 'three';
import type { FurnitureItem } from '../../state/types';
import { toRad } from './primitives';

/** An axis-oriented rectangle in world (feet) space that blocks the walker. */
export interface Obstacle {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  rotY: number;
}

const _obj = new THREE.Object3D();
const _v = new THREE.Vector3();

/** Transforms a local (x, z) point by a position+Y-rotation, using Three's
 * own matrix math instead of hand-derived trig so this can never disagree
 * with what actually gets rendered. */
export function localToWorld(originX: number, originZ: number, rotY: number, localX: number, localZ: number): [number, number] {
  _obj.position.set(originX, 0, originZ);
  _obj.rotation.set(0, rotY, 0);
  _obj.updateMatrix();
  _v.set(localX, 0, localZ).applyMatrix4(_obj.matrix);
  return [_v.x, _v.z];
}

export function rectObstacle(originX: number, originZ: number, rotY: number, localCenterX: number, localCenterZ: number, w: number, d: number): Obstacle {
  const [cx, cz] = localToWorld(originX, originZ, rotY, localCenterX, localCenterZ);
  return { cx, cz, halfW: w / 2, halfD: d / 2, rotY };
}

const DOOR_KINDS = new Set(['door', 'sliding-door']);

/** The door leaf's current world-space footprint, matching Door3D's
 * rendering exactly (same hinge point, same open/closed rotation), so a
 * closed door blocks the walker and an open one doesn't. */
export function doorLeafObstacle(item: FurnitureItem, scale: number, open: boolean): Obstacle {
  const w = item.width / scale;
  const t = item.height / scale;
  const hingeX = item.flippedX ? w : 0;
  const closedRot = item.flippedX ? Math.PI : 0;
  const openRot = item.flipped ? Math.PI / 2 : -Math.PI / 2;
  const leafLocalRot = open ? openRot : closedRot;

  const itemObj = new THREE.Object3D();
  itemObj.position.set(item.x / scale, 0, item.y / scale);
  itemObj.rotation.set(0, toRad(item.rotation), 0);
  const hingeObj = new THREE.Object3D();
  hingeObj.position.set(hingeX, 0, t / 2);
  hingeObj.rotation.set(0, leafLocalRot, 0);
  itemObj.add(hingeObj);
  itemObj.updateMatrixWorld(true);

  const center = new THREE.Vector3(w / 2, 0, 0).applyMatrix4(hingeObj.matrixWorld);
  const rotY = toRad(item.rotation) + leafLocalRot;
  return { cx: center.x, cz: center.z, halfW: w / 2, halfD: 0.08, rotY };
}

export function isDoorItem(item: FurnitureItem): boolean {
  return DOOR_KINDS.has(item.catalogId);
}

/** Pushes (x, z) out of any overlapping obstacle, treating the walker as a
 * circle of the given radius. Runs a couple of passes so corner cases
 * (caught between two obstacles) settle instead of jittering. */
export function resolveCollisions(x: number, z: number, radius: number, obstacles: Obstacle[]): [number, number] {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      const dx = px - o.cx;
      const dz = pz - o.cz;
      const cos = Math.cos(-o.rotY);
      const sin = Math.sin(-o.rotY);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      const clampedX = Math.max(-o.halfW, Math.min(o.halfW, localX));
      const clampedZ = Math.max(-o.halfD, Math.min(o.halfD, localZ));
      const diffX = localX - clampedX;
      const diffZ = localZ - clampedZ;
      const distSq = diffX * diffX + diffZ * diffZ;
      if (distSq >= radius * radius) continue;
      const dist = Math.sqrt(distSq);
      let nx: number;
      let nz: number;
      if (dist < 1e-6) {
        // Center is inside the rectangle — push out along the shallowest axis.
        const penX = o.halfW - Math.abs(localX);
        const penZ = o.halfD - Math.abs(localZ);
        if (penX < penZ) {
          nx = localX >= 0 ? 1 : -1;
          nz = 0;
        } else {
          nx = 0;
          nz = localZ >= 0 ? 1 : -1;
        }
      } else {
        nx = diffX / dist;
        nz = diffZ / dist;
      }
      const push = radius - dist;
      const worldCos = Math.cos(o.rotY);
      const worldSin = Math.sin(o.rotY);
      px += (nx * worldCos - nz * worldSin) * push;
      pz += (nx * worldSin + nz * worldCos) * push;
    }
  }
  return [px, pz];
}
