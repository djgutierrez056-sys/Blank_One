import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { Box } from './primitives';

export interface TextureOption {
  id: string;
  label: string;
  file: string;
  /** Roughly how big one tile of the source photo is in real feet, so the
   * repeat count can be scaled to the wall's actual size instead of always
   * stretching one tile across the whole wall. */
  tileFt: number;
}

export const WALL_TEXTURES: TextureOption[] = [
  { id: 'brick', label: 'Brick', file: 'brick.jpg', tileFt: 4 },
  { id: 'wood-panel', label: 'Wood Panel', file: 'wood-panel.jpg', tileFt: 4 },
  { id: 'tile', label: 'Tile', file: 'tile.jpg', tileFt: 4 },
  { id: 'plaster', label: 'Plaster', file: 'plaster.jpg', tileFt: 6 },
];

export function getWallTexture(id: string | undefined): TextureOption | undefined {
  return WALL_TEXTURES.find((t) => t.id === id);
}

interface SurfaceBoxProps {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  textureId?: string;
  /** Real width/height of the face the texture repeats across (usually w/h
   * for a wall panel), so tiling stays proportional regardless of size. */
  textureWidthFt?: number;
  textureHeightFt?: number;
  castShadow?: boolean;
}

/** Like `Box`, but paints its faces with a tiled photo texture instead of a
 * flat color when `textureId` is set (see WALL_TEXTURES). Falls back to a
 * plain `Box` when no texture is picked, so rooms/doors without one never
 * pay for a texture load at all. */
export function SurfaceBox({ x, y, z, w, h, d, color, textureId, textureWidthFt, textureHeightFt, castShadow = true }: SurfaceBoxProps) {
  const option = getWallTexture(textureId);
  if (!option) return <Box x={x} y={y} z={z} w={w} h={h} d={d} color={color} castShadow={castShadow} />;
  return (
    <Suspense fallback={<Box x={x} y={y} z={z} w={w} h={h} d={d} color={color} castShadow={castShadow} />}>
      <TexturedBox
        x={x}
        y={y}
        z={z}
        w={w}
        h={h}
        d={d}
        option={option}
        widthFt={textureWidthFt ?? w}
        heightFt={textureHeightFt ?? h}
        castShadow={castShadow}
      />
    </Suspense>
  );
}

function TexturedBox({
  x,
  y,
  z,
  w,
  h,
  d,
  option,
  widthFt,
  heightFt,
  castShadow,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  option: TextureOption;
  widthFt: number;
  heightFt: number;
  castShadow: boolean;
}) {
  const base = useTexture(`${import.meta.env.BASE_URL}textures/walls/${option.file}`);
  const map = useMemo(() => {
    const tex = base.clone();
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(0.5, widthFt / option.tileFt), Math.max(0.5, heightFt / option.tileFt));
    tex.needsUpdate = true;
    return tex;
  }, [base, option, widthFt, heightFt]);

  return (
    <mesh position={[x, y, z]} castShadow={castShadow} receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial map={map} roughness={0.85} />
    </mesh>
  );
}
