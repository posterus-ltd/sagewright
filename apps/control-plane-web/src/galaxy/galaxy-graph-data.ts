import { sessionLabel, SessionKind, type Session } from '@sagewright/shared';

export interface StarAnchor {
  x: number;
  y: number;
  z: number;
}

export interface StarNode {
  id: string;
  name: string;
  status: Session['status'];
  kind: Session['kind'];
  workerImage: string | null;
  parentSessionId: string | null;
  workflowId: string | null;
  createdAt: string;
  endedAt: string | null;
  // The session's worker image, or 'unassigned' — each distinct cluster gets its
  // own constellation region (see clusterAnchor).
  clusterId: string;
  // A workflow parent renders larger and anchors its step children.
  isHub: boolean;
  anchor: StarAnchor;
}

export interface StarLink {
  id: string;
  source: string;
  target: string;
}

export interface GalaxyGraph {
  nodes: StarNode[];
  links: StarLink[];
}

const UNASSIGNED_CLUSTER = 'unassigned';
const RING_RADIUS = 260;

/**
 * A stable anchor point per cluster: evenly spaced around a ring, sorted by
 * cluster id so positions don't reshuffle across polls just because sessions
 * arrived in a different order. The 'unassigned' cluster anchors at the
 * center rather than on the ring.
 */
const clusterAnchors = (clusterIds: Set<string>): Map<string, StarAnchor> => {
  const ordered = [...clusterIds].filter((id) => id !== UNASSIGNED_CLUSTER).sort();
  const anchors = new Map<string, StarAnchor>();
  if (clusterIds.has(UNASSIGNED_CLUSTER)) anchors.set(UNASSIGNED_CLUSTER, { x: 0, y: 0, z: 0 });
  ordered.forEach((id, i) => {
    const angle = (i / ordered.length) * Math.PI * 2;
    anchors.set(id, { x: Math.cos(angle) * RING_RADIUS, y: 0, z: Math.sin(angle) * RING_RADIUS });
  });
  return anchors;
};

/** Turn every session (standalone + workflow parents/steps) into a star-field
 *  graph: one node per session clustered by agent, one link per parent/child pair. */
export const buildGalaxyGraph = (sessions: Session[]): GalaxyGraph => {
  const clusterIdFor = (s: Session): string => s.workerImage ?? UNASSIGNED_CLUSTER;
  const anchors = clusterAnchors(new Set(sessions.map(clusterIdFor)));
  const idsInPayload = new Set(sessions.map((s) => s.id));

  const nodes: StarNode[] = sessions.map((s) => {
    const clusterId = clusterIdFor(s);
    return {
      id: s.id,
      name: sessionLabel(s),
      status: s.status,
      kind: s.kind,
      workerImage: s.workerImage,
      parentSessionId: s.parentSessionId,
      workflowId: s.workflowId,
      createdAt: s.createdAt,
      endedAt: s.endedAt,
      clusterId,
      isHub: s.kind === SessionKind.WORKFLOW,
      anchor: anchors.get(clusterId)!,
    };
  });

  const links: StarLink[] = sessions
    .filter((s) => s.parentSessionId && idsInPayload.has(s.parentSessionId))
    .map((s) => ({ id: `${s.parentSessionId}->${s.id}`, source: s.parentSessionId!, target: s.id }));

  return { nodes, links };
};
