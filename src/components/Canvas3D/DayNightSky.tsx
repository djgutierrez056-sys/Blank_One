import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sky, Stars, Cloud, Clouds } from '@react-three/drei';
import * as THREE from 'three';

const DAY_LENGTH_SECONDS = 600; // real seconds for one full 24h cycle

export interface DayNightState {
  hour: number;
  sunDir: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  ambientIntensity: number;
  ambientColor: string;
  isNight: boolean;
}

export function computeDayNight(hour: number): DayNightState {
  const angle = ((hour - 6) / 12) * Math.PI; // 0 at 6am, PI at 6pm, wraps below/above for night
  const elevation = Math.sin(angle);
  const azimuth = Math.cos(angle);
  const dayFactor = THREE.MathUtils.clamp(elevation, 0, 1);
  const sunColor = new THREE.Color('#8fb3ff').lerp(new THREE.Color('#fff4dd'), dayFactor);
  if (dayFactor > 0 && dayFactor < 0.3) {
    sunColor.lerp(new THREE.Color('#ff9d5c'), (1 - dayFactor / 0.3) * 0.55);
  }
  return {
    hour,
    sunDir: [azimuth, Math.max(elevation, -0.15), 0.35],
    sunIntensity: THREE.MathUtils.lerp(0.12, 1.3, dayFactor),
    sunColor: `#${sunColor.getHexString()}`,
    ambientIntensity: THREE.MathUtils.lerp(0.22, 0.75, dayFactor),
    ambientColor: dayFactor < 0.15 ? '#3a4a6b' : '#ffffff',
    isNight: elevation < 0.08,
  };
}

const CLOUD_LAYOUT: { pos: [number, number, number]; scale: number; seed: number }[] = [
  { pos: [-180, 120, -140], scale: 7, seed: 1 },
  { pos: [120, 140, -220], scale: 9, seed: 2 },
  { pos: [260, 110, 60], scale: 6, seed: 3 },
  { pos: [-260, 130, 100], scale: 8, seed: 4 },
  { pos: [40, 150, 260], scale: 7, seed: 5 },
  { pos: [-80, 100, -280], scale: 5, seed: 6 },
];

/** Drives a slow real-time day/night cycle: a moving sun with drifting
 * clouds by day, a moon and starfield by night, plus the intensity/color
 * values the caller's own sun and ambient lights should use, reported via
 * `onChange` (throttled to ~5/sec so it doesn't force a full React
 * re-render every frame). */
export function DayNightSky({
  center,
  initialHour = 9,
  paused = false,
  onChange,
}: {
  center: [number, number];
  initialHour?: number;
  paused?: boolean;
  onChange: (state: DayNightState) => void;
}) {
  const hourRef = useRef(initialHour);
  const accumRef = useRef(0);
  const [state, setState] = useState(() => computeDayNight(initialHour));
  const cloudsGroupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!cloudsGroupRef.current) return;
    cloudsGroupRef.current.rotation.y += delta * 0.003; // slow drift across the sky
    if (paused) return;
    hourRef.current = (hourRef.current + (delta / DAY_LENGTH_SECONDS) * 24) % 24;
    accumRef.current += delta;
    if (accumRef.current < 0.2) return;
    accumRef.current = 0;
    const next = computeDayNight(hourRef.current);
    setState(next);
    onChange(next);
  });

  const sunDirScaled: [number, number, number] = [state.sunDir[0] * 400, Math.max(state.sunDir[1], 0.02) * 400, state.sunDir[2] * 400];
  const moonPos: [number, number, number] = [-state.sunDir[0] * 350, Math.max(-state.sunDir[1], 0.3) * 350, -state.sunDir[2] * 350];
  const dayFactor = THREE.MathUtils.clamp(state.sunDir[1], 0, 1);
  const cloudColor = new THREE.Color('#2b3a55').lerp(new THREE.Color('#ffffff'), dayFactor);
  const cloudOpacity = THREE.MathUtils.lerp(0.35, 0.85, dayFactor);

  return (
    <>
      {!state.isNight ? (
        <Sky sunPosition={sunDirScaled} turbidity={4} rayleigh={2.4} mieCoefficient={0.004} mieDirectionalG={0.85} />
      ) : (
        <>
          <color attach="background" args={['#060a16']} />
          <group position={[center[0], 0, center[1]]}>
            <Stars radius={250} depth={60} count={3000} factor={3.5} fade speed={0.4} />
          </group>
          <mesh position={[center[0] + moonPos[0], moonPos[1], center[1] + moonPos[2]]}>
            <sphereGeometry args={[18, 24, 24]} />
            <meshBasicMaterial color="#f4f1e6" />
          </mesh>
        </>
      )}
      <group ref={cloudsGroupRef} position={[center[0], 0, center[1]]}>
        <Clouds material={THREE.MeshBasicMaterial} limit={200}>
          {CLOUD_LAYOUT.map((c) => (
            <Cloud
              key={c.seed}
              seed={c.seed}
              position={c.pos}
              scale={c.scale}
              bounds={[8, 2, 4]}
              volume={10}
              opacity={cloudOpacity}
              color={cloudColor}
              fade={80}
            />
          ))}
        </Clouds>
      </group>
    </>
  );
}
