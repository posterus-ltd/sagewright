import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { FC } from 'react';

import type { Palette } from '../theme/tokens';
import type { StarLink, StarNode } from './galaxy-graph-data';
import { TaskForceGraph } from './TaskForceGraph';

interface GalaxySceneProps {
  nodes: StarNode[];
  links: StarLink[];
  palette: Palette;
  onSelectNode: (node: StarNode) => void;
}

export const GalaxyScene: FC<GalaxySceneProps> = ({ nodes, links, palette, onSelectNode }) => (
  <Canvas camera={{ position: [0, 120, 420], fov: 55 }} style={{ background: palette.bg }}>
    <ambientLight intensity={0.6} />
    <pointLight position={[200, 200, 200]} intensity={0.8} />
    {/* Ambient background sparkle, distinct from the task stars themselves. A low
        `factor` keeps any single background point from ballooning when it lands
        close to the camera (drei sizes points by inverse distance). */}
    <Stars radius={500} depth={80} count={3000} factor={1.2} saturation={0} fade speed={0.5} />
    <OrbitControls enableDamping dampingFactor={0.08} minDistance={50} maxDistance={1200} />
    <TaskForceGraph nodes={nodes} links={links} palette={palette} onSelectNode={onSelectNode} />
  </Canvas>
);
