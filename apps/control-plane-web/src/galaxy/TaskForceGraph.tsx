import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import R3fForceGraph, { type GraphMethods, type NodeObject } from 'r3f-forcegraph';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';

import type { Palette } from '../theme/tokens';
import type { StarLink, StarNode } from './galaxy-graph-data';
import { starColor, starEmphasis, starSize } from './star-appearance';

type PositionedNode = StarNode & { x?: number; y?: number; z?: number };

const CLUSTER_FORCE_STRENGTH = 0.06;
const EMPHASIS_SCALE = 1.4;

// Nudges each node toward its cluster's fixed anchor point every tick, on top of
// the library's default charge/link forces — keeps each agent's stars grouped
// into a recognizable constellation instead of one undifferentiated blob.
// Typed against the ref's default {} generic (matches GraphMethods.d3Force's
// expected ForceFn) — node.anchor/x/y/z resolve via NodeObject's index signature.
const clusterForce = (strength: number) => {
  let nodes: NodeObject[] = [];
  const force = (alpha: number): void => {
    for (const n of nodes) {
      if (!n.anchor || n.x == null || n.y == null || n.z == null) continue;
      n.vx = (n.vx ?? 0) + (n.anchor.x - n.x) * strength * alpha;
      n.vy = (n.vy ?? 0) + (n.anchor.y - n.y) * strength * alpha;
      n.vz = (n.vz ?? 0) + (n.anchor.z - n.z) * strength * alpha;
    }
  };
  force.initialize = (ns: NodeObject[]): void => {
    nodes = ns;
  };
  return force;
};

interface TaskForceGraphProps {
  nodes: StarNode[];
  links: StarLink[];
  palette: Palette;
  onSelectNode: (node: StarNode) => void;
}

export const TaskForceGraph: FC<TaskForceGraphProps> = ({ nodes, links, palette, onSelectNode }) => {
  const fgRef = useRef<GraphMethods>(undefined);
  const [hovered, setHovered] = useState<PositionedNode | null>(null);

  useFrame(() => fgRef.current?.tickFrame());

  useEffect(() => {
    fgRef.current?.d3Force('cluster', clusterForce(CLUSTER_FORCE_STRENGTH));
  }, []);

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);

  return (
    <>
      <R3fForceGraph
        ref={fgRef}
        graphData={graphData}
        nodeColor={(n) => starColor(n.status, palette)}
        nodeVal={(n) => starSize(n.isHub) * (starEmphasis(n.status) ? EMPHASIS_SCALE : 1)}
        nodeOpacity={0.9}
        linkColor={() => palette.border}
        linkOpacity={0.35}
        linkWidth={0.4}
        onNodeClick={(n) => onSelectNode(n as StarNode)}
        onNodeHover={(n) => setHovered(n as PositionedNode | null)}
      />
      {hovered && hovered.x != null && (
        <Html position={[hovered.x, hovered.y ?? 0, hovered.z ?? 0]} center distanceFactor={80} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: palette.surface,
              color: palette.text,
              border: `1px solid ${palette.border}`,
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            {hovered.name}
          </div>
        </Html>
      )}
    </>
  );
};
