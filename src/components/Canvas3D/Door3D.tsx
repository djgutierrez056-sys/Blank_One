import type { FurnitureItem } from '../../state/types';
import { toRad, Box } from './primitives';

const DOOR_H = 6.75;
const LEAF_THICKNESS = 0.15;

/** The physical door leaf, positioned via the door item's own x/y/rotation
 * (same transform Furniture3D items use) rather than the wall-segment math
 * — that way it automatically respects the user's hinge/swing choices
 * (flippedX/flipped, set in the 2D properties panel). Rendered separately
 * from the wall opening itself (see wallLayout.ts / Scene3D), which now
 * only draws the transom above the doorway. */
export function Door3D({ item, scale, open }: { item: FurnitureItem; scale: number; open: boolean }) {
  const w = item.width / scale;
  const t = item.height / scale;
  const hingeX = item.flippedX ? w : 0;
  const closedRot = item.flippedX ? Math.PI : 0;
  const openRot = item.flipped ? Math.PI / 2 : -Math.PI / 2;
  const rot = open ? openRot : closedRot;

  return (
    <group position={[item.x / scale, 0, item.y / scale]} rotation={[0, toRad(item.rotation), 0]}>
      <group position={[hingeX, 0, t / 2]} rotation={[0, rot, 0]}>
        <Box x={w / 2} y={DOOR_H / 2} z={0} w={w} h={DOOR_H} d={LEAF_THICKNESS} color="#8a6a45" />
      </group>
    </group>
  );
}
