import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';

const EYE_HEIGHT = 5.5;
const WALK_SPEED = 9; // ft/sec
const RUN_SPEED = 18; // ft/sec (Shift)

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** First-person walkthrough: click the scene to lock the mouse and look
 * around, WASD/arrows to move at a fixed eye height. No wall collision yet
 * — you can walk through walls. */
export function WalkControls({ spawn, onLockChange }: { spawn: [number, number, number]; onLockChange: (locked: boolean) => void }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    camera.position.set(spawn[0], EYE_HEIGHT, spawn[2]);
    camera.rotation.set(0, camera.rotation.y, 0);
    // Runs once on mount only — Scene3D remounts this via a `key` change on Canvas.
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) e.preventDefault();
      keys.current[e.code] = true;
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
  }, []);

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
  });

  return <PointerLockControls onLock={() => onLockChange(true)} onUnlock={() => onLockChange(false)} />;
}

export function WalkHint({ active }: { active: boolean }) {
  if (active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="rounded-lg bg-black/60 px-4 py-3 text-center text-sm text-white">
        Click to look around
        <br />
        <span className="text-xs text-white/70">WASD / arrows to move &middot; Shift to run &middot; Esc to release mouse</span>
      </div>
    </div>
  );
}
