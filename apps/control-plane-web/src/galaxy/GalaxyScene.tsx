import { CameraControls, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useImperativeHandle, useRef, type FC, type Ref, type RefObject } from 'react';

import type { Palette } from '../theme/tokens';
import type { StarAnchor, StarLink, StarNode } from './galaxy-graph-data';
import type { StatusGroupKey } from './status-legend';
import { TaskForceGraph } from './TaskForceGraph';

// Elevated enough to frame the whole constellation ring on a wide viewport.
const HOME_CAMERA: StarAnchor = { x: 0, y: 220, z: 560 };
const CLUSTER_VIEW_DISTANCE = 190; // how far outside a constellation the camera parks
const CLUSTER_VIEW_HEIGHT = 70;
const IDLE_RESUME_MS = 8000;
const DRIFT_RADIANS_PER_S = 0.004; // one slow sidereal orbit every ~26 minutes

export interface GalaxySceneHandle {
  resetView: () => void;
}

interface GalaxySceneProps {
  nodes: StarNode[];
  links: StarLink[];
  palette: Palette;
  isDark: boolean;
  hiddenGroups: ReadonlySet<StatusGroupKey>;
  selectedId: string | null;
  reducedMotion: boolean;
  onSelectNode: (node: StarNode) => void;
  ref?: Ref<GalaxySceneHandle>;
}

// Ambient camera drift while the user isn't steering — the galaxy keeps slowly
// turning like a real sky, pausing whenever a hand is on the controls, the
// pointer is exploring the field, or the camera is mid-flight, and staying off
// entirely under reduced motion.
const IdleDrift: FC<{ controls: RefObject<CameraControls | null>; enabled: boolean }> = ({
  controls,
  enabled,
}) => {
  const lastInteractionRef = useRef(0);
  const glDomElement = useThree((state) => state.gl.domElement);

  useEffect(() => {
    const instance = controls.current;
    if (!instance) return;
    const bump = (): void => {
      lastInteractionRef.current = performance.now();
    };
    instance.addEventListener('control', bump);
    instance.addEventListener('transitionstart', bump);
    glDomElement.addEventListener('pointermove', bump);
    return () => {
      instance.removeEventListener('control', bump);
      instance.removeEventListener('transitionstart', bump);
      glDomElement.removeEventListener('pointermove', bump);
    };
  }, [controls, glDomElement]);

  useFrame((_, delta) => {
    const instance = controls.current;
    if (!enabled || !instance) return;
    if (performance.now() - lastInteractionRef.current < IDLE_RESUME_MS) return;
    instance.azimuthAngle += delta * DRIFT_RADIANS_PER_S;
  });

  return null;
};

export const GalaxyScene: FC<GalaxySceneProps> = ({
  nodes,
  links,
  palette,
  isDark,
  hiddenGroups,
  selectedId,
  reducedMotion,
  onSelectNode,
  ref,
}) => {
  const controlsRef = useRef<CameraControls>(null);
  const smooth = !reducedMotion;

  useImperativeHandle(ref, () => ({
    resetView: () => {
      void controlsRef.current?.setLookAt(HOME_CAMERA.x, HOME_CAMERA.y, HOME_CAMERA.z, 0, 0, 0, smooth);
    },
  }));

  // Fly out to a vantage point looking back at the constellation. Anchors sit on
  // a ring around the origin, so "outward from center" is the natural approach
  // direction; the center cluster gets a fixed southern approach instead.
  const focusCluster = useCallback(
    (anchor: StarAnchor): void => {
      const controls = controlsRef.current;
      if (!controls) return;
      const ringDistance = Math.hypot(anchor.x, anchor.z);
      const [outX, outZ] =
        ringDistance > 1 ? [anchor.x / ringDistance, anchor.z / ringDistance] : [0, 1];
      void controls.setLookAt(
        anchor.x + outX * CLUSTER_VIEW_DISTANCE,
        anchor.y + CLUSTER_VIEW_HEIGHT,
        anchor.z + outZ * CLUSTER_VIEW_DISTANCE,
        anchor.x,
        anchor.y,
        anchor.z,
        smooth,
      );
    },
    [smooth],
  );

  // A click re-aims the camera at the star without changing the orbit distance —
  // enough to bring it into comfortable view alongside the opening detail panel.
  const focusNode = useCallback(
    (position: StarAnchor): void => {
      void controlsRef.current?.setTarget(position.x, position.y, position.z, smooth);
    },
    [smooth],
  );

  return (
    // far must comfortably exceed maxDistance + the Stars backdrop radius —
    // the default (1000) is inside the zoom range, so zooming out clipped the
    // entire scene away.
    <Canvas
      camera={{ position: [HOME_CAMERA.x, HOME_CAMERA.y, HOME_CAMERA.z], fov: 55, far: 4000 }}
      style={{ background: palette.bg }}
    >
      {/* Ambient background sparkle, distinct from the task stars themselves. A low
          `factor` keeps any single background point from ballooning when it lands
          close to the camera (drei sizes points by inverse distance). */}
      <Stars radius={500} depth={80} count={3000} factor={1.2} saturation={0} fade speed={reducedMotion ? 0 : 0.5} />
      <CameraControls ref={controlsRef} minDistance={50} maxDistance={1200} smoothTime={0.35} />
      <IdleDrift controls={controlsRef} enabled={!reducedMotion} />
      <TaskForceGraph
        nodes={nodes}
        links={links}
        palette={palette}
        isDark={isDark}
        hiddenGroups={hiddenGroups}
        selectedId={selectedId}
        reducedMotion={reducedMotion}
        onSelectNode={onSelectNode}
        onFocusCluster={focusCluster}
        onFocusNode={focusNode}
      />
    </Canvas>
  );
};
