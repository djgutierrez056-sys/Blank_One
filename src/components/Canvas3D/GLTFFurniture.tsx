import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { modelPathFor } from './modelMap';

/** A failed/missing .glb (e.g. a 404) throws inside the R3F render tree.
 * Without this, an uncaught error there unmounts the entire app instead of
 * just this one item. */
class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('Failed to load furniture model:', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
    <ModelErrorBoundary>
      <Suspense fallback={null}>
        <LoadedModel path={path} w={w} d={d} />
        {catalogId === 'tv-stand' && <TvScreen standW={w} standD={d} />}
      </Suspense>
    </ModelErrorBoundary>
  );
}

/** A TV sitting on top of the tv-stand cabinet — the cabinet model has no
 * screen of its own, so this fits a second model on top of it instead of
 * stretching one model to cover both. Scaled by width only (not the full
 * footprint) so the screen keeps its own proportions rather than being
 * squashed to the stand's depth. */
function TvScreen({ standW, standD }: { standW: number; standD: number }) {
  const { scene: standScene } = useGLTF(modelPathFor('tv-stand')!);
  const { scene: tvScene } = useGLTF(`${import.meta.env.BASE_URL}models/furniture/televisionModern.glb`);

  const { object, x, y, z, scale } = useMemo(() => {
    const standBox = new THREE.Box3().setFromObject(standScene);
    const standSize = new THREE.Vector3();
    standBox.getSize(standSize);
    const standScale = Math.min(standSize.x > 0 ? standW / standSize.x : 1, standSize.z > 0 ? standD / standSize.z : 1);
    const standHeight = standSize.y * standScale;

    const clone = tvScene.clone(true);
    const tvBox = new THREE.Box3().setFromObject(clone);
    const tvSize = new THREE.Vector3();
    tvBox.getSize(tvSize);
    const tvScale = (standW * 0.6) / tvSize.x;
    const center = new THREE.Vector3();
    tvBox.getCenter(center);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return {
      object: clone,
      scale: tvScale,
      x: standW / 2 - center.x * tvScale,
      y: standHeight - tvBox.min.y * tvScale,
      z: standD / 2 - center.z * tvScale,
    };
  }, [standScene, tvScene, standW, standD]);

  return <primitive object={object} position={[x, y, z]} scale={scale} />;
}
