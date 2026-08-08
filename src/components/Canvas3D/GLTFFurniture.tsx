import { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { modelPathFor } from './modelMap';

/** Loads a Kenney furniture .glb and fits it into the item's plan footprint
 * (w × d feet, local space x:0..w, z:0..d, y up from the floor). Scaled
 * uniformly so proportions stay correct, then centered/grounded. */
function LoadedModel({ path, w, d }: { path: string; w: number; d: number }) {
  const { scene } = useGLTF(path);

  const { object, x, y, z, scale } = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = Math.min(size.x > 0 ? w / size.x : 1, size.z > 0 ? d / size.z : 1);
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return {
      object: clone,
      scale: s,
      x: w / 2 - center.x * s,
      y: -box.min.y * s,
      z: d / 2 - center.z * s,
    };
  }, [scene, w, d]);

  return <primitive object={object} position={[x, y, z]} scale={scale} />;
}

export function GLTFFurniture({ catalogId, w, d }: { catalogId: string; w: number; d: number }) {
  const path = modelPathFor(catalogId);
  if (!path) return null;
  return (
    <Suspense fallback={null}>
      <LoadedModel path={path} w={w} d={d} />
    </Suspense>
  );
}
