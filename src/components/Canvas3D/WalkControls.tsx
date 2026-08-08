import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { resolveCollisions, type Obstacle } from './collision';

const EYE_HEIGHT = 5.5;
const PLAYER_RADIUS = 1.0;
const WALK_SPEED = 9; // ft/sec
const RUN_SPEED = 18; // ft/sec (Shift)
const DOOR_RANGE = 4.5; // ft

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export interface DoorTarget {
  id: string;
  x: number;
  z: number;
}

/** First-person walkthrough: click the scene to lock the mouse and look
 * around, WASD/arrows to move at a fixed eye height. The walker is treated
 * as a circle and pushed out of any overlapping obstacle each frame (walls,
 * furniture, closed doors). Press E near a door to open/close it. */
export function WalkControls({
  spawn,
  onLockChange,
  obstacles,
  doors,
  onToggleDoor,
  onNearDoorChange,
}: {
  spawn: [number, number, number];
  onLockChange: (locked: boolean) => void;
  obstacles: Obstacle[];
  doors: DoorTarget[];
  onToggleDoor: (id: string) => void;
  onNearDoorChange: (id: string | null) => void;
}) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;
  const doorsRef = useRef(doors);
  doorsRef.current = doors;
  const nearDoorRef = useRef<string | null>(null);

  useEffect(() => {
    camera.position.set(spawn[0], EYE_HEIGHT, spawn[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(spawn[0], EYE_HEIGHT, spawn[2] - 1);
    // Runs once on mount only — Scene3D remounts this via a `key` change on Canvas.
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) e.preventDefault();
      keys.current[e.code] = true;
      if (e.code === 'KeyE' && nearDoorRef.current) onToggleDoor(nearDoorRef.current);
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onToggleDoor]);

  useFrame((_, delta) => {
    const k = keys.current;
    const speed = (k.ShiftLeft || k.ShiftRight ? RUN_SPEED : WALK_SPEED) * delta;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    const move = new THREE.Vector3();
    if (k.KeyW || k.ArrowUp) move.add(forward);
    if (k.KeyS || k.ArrowDown) move.sub(forward);
    if (k.KeyD || k.ArrowRight) move.add(right);
    if (k.KeyA || k.ArrowLeft) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
    }
    camera.position.y = EYE_HEIGHT;

    const [rx, rz] = resolveCollisions(camera.position.x, camera.position.z, PLAYER_RADIUS, obstaclesRef.current);
    camera.position.x = rx;
    camera.position.z = rz;

    let closestId: string | null = null;
    let closestDist = DOOR_RANGE;
    for (const d of doorsRef.current) {
      const dist = Math.hypot(d.x - camera.position.x, d.z - camera.position.z);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = d.id;
      }
    }
    if (closestId !== nearDoorRef.current) {
      nearDoorRef.current = closestId;
      onNearDoorChange(closestId);
    }
  });

  return <PointerLockControls onLock={() => onLockChange(true)} onUnlock={() => onLockChange(false)} />;
}

export function WalkHint({ active, nearDoor }: { active: boolean; nearDoor: boolean }) {
  return (
    <>
      {!active && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-black/60 px-4 py-3 text-center text-sm text-white">
            Click to look around
            <br />
            <span className="text-xs text-white/70">WASD / arrows to move &middot; Shift to run &middot; E to open doors &middot; Esc to release mouse</span>
          </div>
        </div>
      )}
      {nearDoor && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
          <div className="rounded-md bg-black/60 px-3 py-1.5 text-sm text-white">Press E to open/close door</div>
        </div>
      )}
    </>
  );
}
