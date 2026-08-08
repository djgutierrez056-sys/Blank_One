import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { resolveCollisions, type Obstacle } from './collision';
import { broadcastAvatar } from '../../lib/collab';
import { isTypingTarget } from '../../utils/dom';

const EYE_HEIGHT_BASE = 5.5;
const SIT_EYE_HEIGHT_BASE = 3.0;
const PLAYER_RADIUS_BASE = 1.0;
const WALK_SPEED = 9; // ft/sec
const RUN_SPEED = 18; // ft/sec (Shift)
const DOOR_RANGE = 4.5; // ft
const SEAT_RANGE = 4.0; // ft

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export interface DoorTarget {
  id: string;
  x: number;
  z: number;
}

export interface SeatTarget {
  id: string;
  x: number;
  z: number;
}

/** First-person walkthrough: click the scene to lock the mouse and look
 * around, WASD/arrows to move at a fixed eye height. The walker is treated
 * as a circle and pushed out of any overlapping obstacle each frame (walls,
 * furniture, closed doors). Press E near a door to open/close it, and F
 * near a seat to sit down (camera drops to a seated height and movement
 * pauses) or stand back up. */
export function WalkControls({
  spawn,
  enabled = true,
  humanScale = 1,
  onLockChange,
  obstacles,
  doors,
  onToggleDoor,
  onNearDoorChange,
  seats,
  onNearSeatChange,
  onSitChange,
}: {
  spawn: [number, number, number];
  /** False while Build Mode owns the mouse (free cursor, no pointer lock) —
   * movement/collision still run, only the look-around lock is suspended. */
  enabled?: boolean;
  /** Scales eye height and collision radius to match a project's wallScale
   * (bigger walls/doors -> a bigger character to match), independent of
   * the floor plan's actual footprint. */
  humanScale?: number;
  onLockChange: (locked: boolean) => void;
  obstacles: Obstacle[];
  doors: DoorTarget[];
  onToggleDoor: (id: string) => void;
  onNearDoorChange: (id: string | null) => void;
  seats: SeatTarget[];
  onNearSeatChange: (id: string | null) => void;
  onSitChange: (id: string | null) => void;
}) {
  const { camera } = useThree();
  const EYE_HEIGHT = EYE_HEIGHT_BASE * humanScale;
  const SIT_EYE_HEIGHT = SIT_EYE_HEIGHT_BASE * humanScale;
  const PLAYER_RADIUS = PLAYER_RADIUS_BASE * humanScale;
  const keys = useRef<Record<string, boolean>>({});
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;
  const doorsRef = useRef(doors);
  doorsRef.current = doors;
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const nearDoorRef = useRef<string | null>(null);
  const nearSeatRef = useRef<string | null>(null);
  const sittingRef = useRef<string | null>(null);
  const preSitPositionRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    camera.position.set(spawn[0], EYE_HEIGHT, spawn[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(spawn[0], EYE_HEIGHT, spawn[2] - 1);
    // Runs once on mount only — Scene3D remounts this via a `key` change on Canvas.
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (MOVE_KEYS.has(e.code)) e.preventDefault();
      keys.current[e.code] = true;
      if (e.code === 'KeyE' && nearDoorRef.current) onToggleDoor(nearDoorRef.current);
      if (e.code === 'KeyF') {
        if (sittingRef.current) {
          sittingRef.current = null;
          onSitChange(null);
          if (preSitPositionRef.current) camera.position.copy(preSitPositionRef.current);
        } else if (nearSeatRef.current) {
          const seat = seatsRef.current.find((s) => s.id === nearSeatRef.current);
          if (seat) {
            preSitPositionRef.current = camera.position.clone();
            camera.position.set(seat.x, SIT_EYE_HEIGHT, seat.z);
            sittingRef.current = seat.id;
            onSitChange(seat.id);
          }
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      keys.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [camera, onSitChange, onToggleDoor]);

  useFrame((_, delta) => {
    const k = keys.current;

    if (sittingRef.current) {
      camera.position.y = SIT_EYE_HEIGHT;
    } else {
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
    }

    let closestDoor: string | null = null;
    let closestDoorDist = DOOR_RANGE;
    for (const d of doorsRef.current) {
      const dist = Math.hypot(d.x - camera.position.x, d.z - camera.position.z);
      if (dist < closestDoorDist) {
        closestDoorDist = dist;
        closestDoor = d.id;
      }
    }
    if (closestDoor !== nearDoorRef.current) {
      nearDoorRef.current = closestDoor;
      onNearDoorChange(closestDoor);
    }

    let closestSeat: string | null = null;
    if (!sittingRef.current) {
      let closestSeatDist = SEAT_RANGE;
      for (const s of seatsRef.current) {
        const dist = Math.hypot(s.x - camera.position.x, s.z - camera.position.z);
        if (dist < closestSeatDist) {
          closestSeatDist = dist;
          closestSeat = s.id;
        }
      }
    }
    if (closestSeat !== nearSeatRef.current) {
      nearSeatRef.current = closestSeat;
      onNearSeatChange(closestSeat);
    }

    const yawDeg = (-camera.rotation.y * 180) / Math.PI;
    // Broadcast the foot/base position, not the eye -- PlayerAvatar builds
    // its model upward from the ground, so sending eye height here (as
    // before) made every remote avatar float ~5.5ft off the floor.
    const footY = camera.position.y - (sittingRef.current ? SIT_EYE_HEIGHT : EYE_HEIGHT);
    broadcastAvatar(camera.position.x, footY, camera.position.z, yawDeg, !!sittingRef.current);
  });

  useEffect(() => {
    if (!enabled) document.exitPointerLock();
  }, [enabled]);

  return enabled ? <PointerLockControls onLock={() => onLockChange(true)} onUnlock={() => onLockChange(false)} /> : null;
}

export function WalkHint({ active, nearDoor, nearSeat, sitting }: { active: boolean; nearDoor: boolean; nearSeat: boolean; sitting: boolean }) {
  return (
    <>
      {!active && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-black/60 px-4 py-3 text-center text-sm text-white">
            Click to look around
            <br />
            <span className="text-xs text-white/70">
              WASD / arrows to move &middot; Shift to run &middot; E to open doors &middot; F to sit &middot; 1-9 + G to build &middot; Esc to release mouse
            </span>
          </div>
        </div>
      )}
      {nearDoor && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
          <div className="rounded-md bg-black/60 px-3 py-1.5 text-sm text-white">Press E to open/close door</div>
        </div>
      )}
      {sitting ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
          <div className="rounded-md bg-black/60 px-3 py-1.5 text-sm text-white">Press F to stand up</div>
        </div>
      ) : (
        nearSeat && (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
            <div className="rounded-md bg-black/60 px-3 py-1.5 text-sm text-white">Press F to sit</div>
          </div>
        )
      )}
    </>
  );
}
