/** Small shared mesh helpers for the 3D scene — all positions/sizes are in
 * feet (1 world unit = 1 foot), with (x, z) as the floor plane and y as up. */

export function toRad(deg: number): number {
  return (-deg * Math.PI) / 180;
}

interface BoxProps {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  opacity?: number;
  rotY?: number;
  castShadow?: boolean;
}

export function Box({ x, y, z, w, h, d, color, opacity = 1, rotY = 0, castShadow = true }: BoxProps) {
  return (
    <mesh position={[x, y, z]} rotation={[0, rotY, 0]} castShadow={castShadow} receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.8} />
    </mesh>
  );
}

interface CylProps {
  x: number;
  y: number;
  z: number;
  rTop: number;
  rBottom?: number;
  h: number;
  color: string;
  opacity?: number;
  segments?: number;
}

export function Cyl({ x, y, z, rTop, rBottom, h, color, opacity = 1, segments = 16 }: CylProps) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <cylinderGeometry args={[rTop, rBottom ?? rTop, h, segments]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.8} />
    </mesh>
  );
}

export function Sphere({ x, y, z, r, color }: { x: number; y: number; z: number; r: number; color: string }) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <sphereGeometry args={[r, 12, 10]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

export function Cone({ x, y, z, r, h, color }: { x: number; y: number; z: number; r: number; h: number; color: string }) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <coneGeometry args={[r, h, 16]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

export function Torus({
  x,
  y,
  z,
  r,
  tube,
  color,
  rotX = Math.PI / 2,
}: {
  x: number;
  y: number;
  z: number;
  r: number;
  tube: number;
  color: string;
  rotX?: number;
}) {
  return (
    <mesh position={[x, y, z]} rotation={[rotX, 0, 0]} castShadow receiveShadow>
      <torusGeometry args={[r, tube, 8, 20]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}
