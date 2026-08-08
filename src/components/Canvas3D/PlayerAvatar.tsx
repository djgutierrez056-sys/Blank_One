import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { usePlannerStore } from '../../state/store';
import { toRad } from './primitives';

const FOLLOW_SPEED = 10; // higher = snappier catch-up to the last broadcast position

/** Another connected player, shown in the 3D walkthrough at their last
 * broadcast position/heading. Position updates arrive throttled (~10/sec)
 * over the realtime channel, so this smoothly follows toward the latest
 * value each frame instead of teleporting on every update. */
export function PlayerAvatar({ clientId, color, name }: { clientId: string; color: string; name: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3());
  const targetYaw = useRef(0);
  const initialized = useRef(false);
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
    const bobBase = sitting ? 1.1 : 1.5;
    g.userData.bob = bobBase + Math.sin(state.clock.elapsedTime * 2 + g.position.x) * 0.03;
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, sitting ? 1.1 : 1.5, 0]} castShadow>
        <capsuleGeometry args={[0.75, sitting ? 1.2 : 2.2, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, sitting ? 1.9 : 3.0, 0]} castShadow>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshStandardMaterial color="#f2c9a0" roughness={0.7} />
      </mesh>
      <Billboard position={[0, sitting ? 2.6 : 3.7, 0]}>
        <Text fontSize={0.4} color={color} anchorX="center" anchorY="bottom" outlineWidth={0.025} outlineColor="#000000">
          {name}
        </Text>
      </Billboard>
    </group>
  );
}
