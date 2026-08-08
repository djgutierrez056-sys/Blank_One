import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { usePlannerStore } from '../../state/store';
import { toRad } from './primitives';

const FOLLOW_SPEED = 10; // higher = snappier catch-up to the last broadcast position
const SKIN = '#f2c9a0';
const PANTS = '#3b4252';

/** Another connected player, shown in the 3D walkthrough at their last
 * broadcast (ground-level) position/heading. Position updates arrive
 * throttled (~10/sec) over the realtime channel, so this smoothly follows
 * toward the latest value each frame instead of teleporting on every
 * update. A simple low-poly figure (legs, torso, arms, head) rather than a
 * single stretched capsule, so it reads as a person and not a cylinder. */
export function PlayerAvatar({ clientId, color, name }: { clientId: string; color: string; name: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3());
  const targetYaw = useRef(0);
  const initialized = useRef(false);
  const lastXZ = useRef(new THREE.Vector2());
  const [sitting, setSitting] = useState(false);

  useEffect(() => {
    const unsub = usePlannerStore.subscribe((s) => {
      const a = s.remoteAvatars[clientId];
      if (!a) return;
      targetPos.current.set(a.x, a.y, a.z);
      targetYaw.current = toRad(a.yawDeg);
      setSitting((prev) => (prev !== a.sitting ? a.sitting : prev));
      if (!initialized.current && groupRef.current) {
        groupRef.current.position.copy(targetPos.current);
        groupRef.current.rotation.y = targetYaw.current;
        lastXZ.current.set(a.x, a.z);
        initialized.current = true;
      }
    });
    return unsub;
  }, [clientId]);

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const t = Math.min(1, delta * FOLLOW_SPEED);
    g.position.lerp(targetPos.current, t);
    let diff = targetYaw.current - g.rotation.y;
    diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    g.rotation.y += diff * t;

    const moved = Math.hypot(g.position.x - lastXZ.current.x, g.position.z - lastXZ.current.y);
    lastXZ.current.set(g.position.x, g.position.z);
    const walking = !sitting && moved > 0.01;

    if (bodyRef.current) {
      const bob = walking ? Math.sin(state.clock.elapsedTime * 9) * 0.08 : Math.sin(state.clock.elapsedTime * 1.5) * 0.02;
      bodyRef.current.position.y = bob;
    }
    const swing = walking ? Math.sin(state.clock.elapsedTime * 9) * 0.45 : 0;
    if (leftLegRef.current) leftLegRef.current.rotation.x = swing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = -swing;
    if (leftArmRef.current) leftArmRef.current.rotation.x = -swing;
    if (rightArmRef.current) rightArmRef.current.rotation.x = swing;
  });

  const scale = sitting ? 0.62 : 1;

  return (
    <group ref={groupRef}>
      <group ref={bodyRef} scale={[1, scale, 1]}>
        <group ref={leftLegRef} position={[-0.22, 1.3, 0]}>
          <mesh position={[0, -0.65, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.13, 1.3, 8]} />
            <meshStandardMaterial color={PANTS} roughness={0.8} />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[0.22, 1.3, 0]}>
          <mesh position={[0, -0.65, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.13, 1.3, 8]} />
            <meshStandardMaterial color={PANTS} roughness={0.8} />
          </mesh>
        </group>
        <mesh position={[0, 2.75, 0]} castShadow>
          <capsuleGeometry args={[0.42, 0.9, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.75} />
        </mesh>
        <group ref={leftArmRef} position={[-0.62, 3.45, 0]}>
          <mesh position={[0, -0.7, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.1, 1.4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.8} />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[0.62, 3.45, 0]}>
          <mesh position={[0, -0.7, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.1, 1.4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.8} />
          </mesh>
        </group>
        <mesh position={[0, 4.15, 0]} castShadow>
          <sphereGeometry args={[0.42, 16, 16]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} />
        </mesh>
      </group>
      <Billboard position={[0, (sitting ? 4.15 * scale : 4.15) + 0.6, 0]}>
        <Text fontSize={0.4} color={color} anchorX="center" anchorY="bottom" outlineWidth={0.025} outlineColor="#000000">
          {name}
        </Text>
      </Billboard>
    </group>
  );
}
