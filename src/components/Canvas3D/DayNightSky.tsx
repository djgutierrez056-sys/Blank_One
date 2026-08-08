import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
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

/** Drives a slow real-time day/night cycle: a moving sun (or, at night, a
 * starfield) plus the intensity/color values the caller's own sun and
 * ambient lights should use, reported via `onChange` (throttled to ~5/sec
 * so it doesn't force a full React re-render every frame). */
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

  useFrame((_, delta) => {
    if (paused) return;
    hourRef.current = (hourRef.current + (delta / DAY_LENGTH_SECONDS) * 24) % 24;
    accumRef.current += delta;
    if (accumRef.current < 0.2) return;
    accumRef.current = 0;
    const next = computeDayNight(hourRef.current);
    setState(next);
    onChange(next);
  });

  const sunPos: [number, number, number] = [state.sunDir[0] * 400, Math.max(state.sunDir[1], 0.02) * 400, state.sunDir[2] * 400];

  return (
    <>
      {!state.isNight ? (
        <Sky sunPosition={sunPos} turbidity={6} rayleigh={1.8} mieCoefficient={0.006} mieDirectionalG={0.8} />
      ) : (
        <>
          <color attach="background" args={['#060a16']} />
          <group position={[center[0], 0, center[1]]}>
            <Stars radius={250} depth={60} count={3000} factor={3.5} fade speed={0.4} />
          </group>
        </>
      )}
    </>
  );
}
