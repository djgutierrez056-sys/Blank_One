import type { JSX } from 'react';
import type { FurnitureItem } from '../../state/types';
import { darken } from '../Canvas/FurnitureIcon';
import { GLTFFurniture } from './GLTFFurniture';
import { MODEL_MAP } from './modelMap';
import { Box, Cone, Cyl, Sphere } from './primitives';

function fourLegs(w: number, d: number, legR: number, legH: number, color: string, inset = 0.15) {
  const xs = [inset, w - inset];
  const zs = [inset, d - inset];
  const legs: JSX.Element[] = [];
  for (const x of xs) {
    for (const z of zs) {
      legs.push(<Cyl key={`${x}-${z}`} x={x} y={legH / 2} z={z} rTop={legR} h={legH} color={color} />);
    }
  }
  return legs;
}

const SEATING = new Set(['sofa', 'loveseat', 'sectional', 'armchair', 'recliner', 'lounge-chair']);
const RING_CHAIRS = new Set(['office-chair', 'dining-chair', 'bar-stool']);
const TABLES = new Set([
  'coffee-table',
  'dining-table',
  'desk',
  'island',
  'side-table',
  'meeting-table',
  'console-table',
  'kitchen-cart',
  'folding-table',
  'patio-table',
]);
const BEDS = new Set(['bed-king', 'bed-queen', 'bed-twin', 'crib']);
const TALL_CABINETS = new Set(['wardrobe', 'pantry', 'bookshelf', 'linen-cabinet', 'laundry-cabinet']);
const LOW_CABINETS = new Set(['nightstand', 'dresser', 'filing-cabinet', 'vanity']);
const TALL_APPLIANCE = new Set(['fridge']);
const MED_APPLIANCE = new Set(['stove', 'washer', 'dryer']);
const SHORT_APPLIANCE = new Set(['microwave']);
const SINKS = new Set(['sink-kitchen', 'sink-bath', 'utility-sink']);
const FLAT_PANELS = new Set(['mirror', 'mirror-bath', 'floor-mirror']);

/** Renders one catalog item as a small group of primitives in local plan space
 * — x runs 0..w (feet), z runs 0..d (feet), y is up from the floor. Doors and
 * windows are excluded: those are drawn as wall openings by Scene3D instead. */
export function Furniture3D({ item, w, d }: { item: FurnitureItem; w: number; d: number }): JSX.Element | null {
  const color = item.color;
  const dark = darken(color, 0.3);
  const cx = w / 2;
  const cz = d / 2;
  const id = item.catalogId;

  if (MODEL_MAP[id]) {
    return <GLTFFurniture catalogId={id} w={w} d={d} />;
  }

  if (SEATING.has(id)) {
    const seatH = 1.3;
    const backH = 1.4;
    return (
      <group>
        <Box x={cx} y={seatH / 2} z={cz} w={w} h={seatH} d={d} color={color} />
        <Box x={cx} y={seatH + backH / 2} z={d * 0.12} w={w} h={backH} d={d * 0.24} color={dark} />
        <Box x={w * 0.1} y={seatH + backH * 0.3} z={cz} w={w * 0.16} h={backH * 0.6} d={d * 0.8} color={dark} />
        <Box x={w * 0.9} y={seatH + backH * 0.3} z={cz} w={w * 0.16} h={backH * 0.6} d={d * 0.8} color={dark} />
      </group>
    );
  }

  if (RING_CHAIRS.has(id)) {
    const seatH = 1.5;
    const r = Math.min(w, d) / 2;
    return (
      <group>
        <Cyl x={cx} y={seatH} z={cz} rTop={r * 0.85} h={0.2} color={color} />
        <Box x={cx} y={seatH + 0.7} z={cz - r * 0.7} w={r * 1.4} h={1.2} d={0.15} color={dark} />
        <Cyl x={cx} y={seatH / 2} z={cz} rTop={0.08} h={seatH} color="#5c5c5c" />
      </group>
    );
  }

  if (TABLES.has(id)) {
    const topH = 1.5;
    return (
      <group>
        <Box x={cx} y={topH - 0.06} z={cz} w={w} h={0.12} d={d} color={color} />
        {fourLegs(w, d, Math.min(w, d) * 0.03 + 0.03, topH - 0.12, dark)}
      </group>
    );
  }

  if (BEDS.has(id)) {
    const mattressH = 1.1;
    return (
      <group>
        <Box x={cx} y={mattressH / 2} z={cz} w={w} h={mattressH} d={d} color={color} />
        <Box x={cx} y={mattressH + 0.9} z={d * 0.05} w={w} h={1.8} d={0.15} color={dark} />
        <Box x={w * 0.22} y={mattressH + 0.15} z={d * 0.15} w={w * 0.32} h={0.3} d={d * 0.22} color="#ffffff" />
        <Box x={w * 0.78} y={mattressH + 0.15} z={d * 0.15} w={w * 0.32} h={0.3} d={d * 0.22} color="#ffffff" />
      </group>
    );
  }

  if (TALL_CABINETS.has(id) || LOW_CABINETS.has(id)) {
    const h = TALL_CABINETS.has(id) ? 5.5 : 2.6;
    return (
      <group>
        <Box x={cx} y={h / 2} z={cz} w={w} h={h} d={d} color={color} />
        <Box x={cx} y={h - 0.06} z={cz} w={w * 0.98} h={0.1} d={d * 0.98} color={dark} />
      </group>
    );
  }

  if (TALL_APPLIANCE.has(id) || MED_APPLIANCE.has(id) || SHORT_APPLIANCE.has(id) || id === 'washer-dryer-stack') {
    const h = TALL_APPLIANCE.has(id) ? 5.5 : id === 'washer-dryer-stack' ? 5.2 : SHORT_APPLIANCE.has(id) ? 1.2 : 2.8;
    return (
      <group>
        <Box x={cx} y={h / 2} z={cz} w={w} h={h} d={d} color={color} />
        <Box x={cx} y={h * 0.75} z={d * 0.02} w={w * 0.9} h={h * 0.06} d={0.05} color={dark} />
      </group>
    );
  }

  if (SINKS.has(id)) {
    const h = 2.6;
    return (
      <group>
        <Box x={cx} y={h / 2} z={cz} w={w} h={h} d={d} color={color} />
        <Cyl x={cx} y={h - 0.1} z={cz} rTop={Math.min(w, d) * 0.32} h={0.2} color={darken(color, 0.15)} />
      </group>
    );
  }

  if (id === 'toilet') {
    const r = Math.min(w, d) * 0.4;
    return (
      <group>
        <Box x={cx} y={1.9} z={d * 0.18} w={w * 0.7} h={0.9} d={d * 0.3} color={color} />
        <Cyl x={cx} y={0.8} z={d * 0.6} rTop={r} h={1.4} color={color} />
      </group>
    );
  }

  if (id === 'bathtub') {
    const h = 1.7;
    return (
      <group>
        <Box x={cx} y={h / 2} z={cz} w={w} h={h} d={d} color={color} />
        <Box x={cx} y={h - 0.15} z={cz} w={w * 0.82} h={0.5} d={d * 0.72} color="#eef4f6" />
      </group>
    );
  }

  if (id === 'shower') {
    return (
      <group>
        <Box x={cx} y={0.15} z={cz} w={w} h={0.3} d={d} color={color} />
        <Box x={cx} y={3.2} z={0.03} w={w} h={6.2} d={0.05} color="#bfe0ea" opacity={0.35} />
        <Box x={0.03} y={3.2} z={cz} w={0.05} h={6.2} d={d} color="#bfe0ea" opacity={0.35} />
      </group>
    );
  }

  if (id === 'rug') {
    return <Box x={cx} y={0.03} z={cz} w={w} h={0.06} d={d} color={color} opacity={0.9} />;
  }

  if (id === 'tv-stand') {
    return (
      <group>
        <Box x={cx} y={0.65} z={cz} w={w} h={1.3} d={d} color={color} />
        <Box x={cx} y={1.3 + 1.5} z={d * 0.15} w={w * 0.85} h={2.2} d={0.1} color="#20232b" />
      </group>
    );
  }

  if (id === 'plant') {
    const r = Math.min(w, d) / 2;
    return (
      <group>
        <Cyl x={cx} y={0.5} z={cz} rTop={r * 0.7} rBottom={r * 0.9} h={1} color={dark} />
        <Sphere x={cx} y={1.5} z={cz} r={r * 1.1} color="#5f8f5a" />
        <Sphere x={cx - r * 0.3} y={1.8} z={cz + r * 0.2} r={r * 0.7} color="#6fa068" />
      </group>
    );
  }

  if (id === 'floor-lamp') {
    return (
      <group>
        <Cyl x={cx} y={2.2} z={cz} rTop={0.06} h={4.4} color="#8f8f8f" />
        <Cone x={cx} y={4.7} z={cz} r={Math.min(w, d) / 2} h={0.8} color={color} />
      </group>
    );
  }

  if (id === 'coat-rack') {
    return (
      <group>
        <Cyl x={cx} y={2.75} z={cz} rTop={0.07} h={5.5} color={dark} />
        <Sphere x={cx} y={5.4} z={cz} r={0.12} color={dark} />
        <Sphere x={cx - 0.4} y={5.1} z={cz} r={0.09} color={dark} />
        <Sphere x={cx + 0.4} y={5.1} z={cz} r={0.09} color={dark} />
      </group>
    );
  }

  if (id === 'bench') {
    return (
      <group>
        <Box x={cx} y={1.3} z={cz} w={w} h={0.2} d={d} color={color} />
        <Box x={w * 0.08} y={0.65} z={cz} w={0.15} h={1.3} d={d * 0.8} color={dark} />
        <Box x={w * 0.92} y={0.65} z={cz} w={0.15} h={1.3} d={d * 0.8} color={dark} />
      </group>
    );
  }

  if (id === 'ironing-board') {
    return (
      <group>
        <Box x={cx} y={2.3} z={cz} w={w} h={0.15} d={d} color={color} />
        <Cyl x={cx} y={1.15} z={cz} rTop={0.06} h={2.3} color={dark} />
      </group>
    );
  }

  if (FLAT_PANELS.has(id)) {
    const h = id === 'floor-mirror' ? 4.5 : 3.2;
    const baseY = id === 'floor-mirror' ? 0 : 2.4;
    return (
      <group>
        <Box x={cx} y={baseY + h / 2} z={cz} w={w} h={h} d={Math.max(0.08, d)} color={color} />
      </group>
    );
  }

  // Generic fallback: a plain box sized to the item's footprint.
  const fallbackH = 1.8;
  return <Box x={cx} y={fallbackH / 2} z={cz} w={w} h={fallbackH} d={d} color={color} />;
}
