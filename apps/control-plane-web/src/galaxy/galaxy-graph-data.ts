import { sessionLabel, SessionKind, type Session } from '@sagewright/shared';

import { hashUnit } from './hash';
import { starEmphasis } from './star-appearance';

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
  runnerImage: string | null;
  parentSessionId: string | null;
  workflowId: string | null;
  createdAt: string;
  endedAt: string | null;
  updatedAt: string;
  prompt: string | null;
  createdBy: string;
  createdByName: string | null;
  currentStepKey: string | null;
  workflowStepKey: string | null;
  iteration: number | null;
  branch: string | null;
  prUrl: string | null;
  // The session's runner image, or 'unassigned' — each distinct cluster gets its
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
  // The target step's status, denormalized so link visuals (e.g. particles on
  // running steps) don't need node lookups inside render-loop accessors.
  targetStatus: Session['status'];
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
  const ordered = [...clusterIds]
    .filter((id) => id !== UNASSIGNED_CLUSTER)
    .sort();
  const anchors = new Map<string, StarAnchor>();
  if (clusterIds.has(UNASSIGNED_CLUSTER))
    anchors.set(UNASSIGNED_CLUSTER, { x: 0, y: 0, z: 0 });
  ordered.forEach((id, i) => {
    const angle = (i / ordered.length) * Math.PI * 2;
    anchors.set(id, {
      x: Math.cos(angle) * RING_RADIUS,
      y: 0,
      z: Math.sin(angle) * RING_RADIUS,
    });
  });
  return anchors;
};

/** Turn every session (standalone + workflow parents/steps) into a star-field
 *  graph: one node per session clustered by agent, one link per parent/child pair. */
export const buildGalaxyGraph = (sessions: Session[]): GalaxyGraph => {
  const clusterIdFor = (s: Session): string =>
    s.runnerImage ?? UNASSIGNED_CLUSTER;
  const anchors = clusterAnchors(new Set(sessions.map(clusterIdFor)));
  const idsInPayload = new Set(sessions.map((s) => s.id));

  const nodes: StarNode[] = sessions.map((s) => {
    const clusterId = clusterIdFor(s);
    return {
      id: s.id,
      name: sessionLabel(s),
      status: s.status,
      kind: s.kind,
      runnerImage: s.runnerImage,
      parentSessionId: s.parentSessionId,
      workflowId: s.workflowId,
      createdAt: s.createdAt,
      endedAt: s.endedAt,
      updatedAt: s.updatedAt,
      prompt: s.prompt,
      createdBy: s.createdBy,
      createdByName: s.createdByName,
      currentStepKey: s.currentStepKey,
      workflowStepKey: s.workflowStepKey,
      iteration: s.iteration,
      branch: s.branch,
      prUrl: s.prUrl,
      clusterId,
      isHub: s.kind === SessionKind.WORKFLOW,
      anchor: anchors.get(clusterId)!,
    };
  });

  const links: StarLink[] = sessions
    .filter((s) => s.parentSessionId && idsInPayload.has(s.parentSessionId))
    .map((s) => ({
      id: `${s.parentSessionId}->${s.id}`,
      source: s.parentSessionId!,
      target: s.id,
      targetStatus: s.status,
    }));

  return { nodes, links };
};

/** Constellation name for a cluster id: a runner image ref reduced to its agent
 *  name (registry path, `sagewright-runner-` prefix, and tag stripped), so the
 *  nameplate reads "opencode", not "sagewright-runner-opencode:latest". */
export const clusterDisplayName = (clusterId: string): string =>
  clusterId
    .split('/')
    .at(-1)!
    .replace(/:[^:]*$/, '')
    .replace(/^sagewright-runner-/, '');

export interface ClusterSummary {
  clusterId: string;
  anchor: StarAnchor;
  total: number;
  // Stars that read as alive right now: in-flight work plus needs-assistance.
  live: number;
}

/** Per-constellation rollup for the in-scene nameplates, sorted by cluster id. */
export const clusterSummaries = (nodes: StarNode[]): ClusterSummary[] => {
  const byCluster = new Map<string, ClusterSummary>();
  for (const node of nodes) {
    const summary =
      byCluster.get(node.clusterId) ??
      byCluster
        .set(node.clusterId, {
          clusterId: node.clusterId,
          anchor: node.anchor,
          total: 0,
          live: 0,
        })
        .get(node.clusterId)!;
    summary.total += 1;
    if (starEmphasis(node.status)) summary.live += 1;
  }
  return [...byCluster.values()].sort((a, b) =>
    a.clusterId.localeCompare(b.clusterId),
  );
};

/** A star node once the force engine owns it — positions/velocities live on the
 *  node object itself (d3-force-3d mutates in place). */
export type SimulatedStarNode = StarNode & {
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
};

export const SPAWN_JITTER_RADIUS = 40;

/**
 * Carry the running simulation's positions/velocities onto a freshly built node
 * set (the graph endpoint polls every 5s, producing new node objects each time).
 * Known stars keep flying from where they were instead of the layout restarting;
 * unseen stars spawn near their cluster anchor with a deterministic scatter so
 * they join their constellation without a cross-field flight.
 */
export const carrySimulationState = (
  prev: SimulatedStarNode[],
  next: StarNode[],
): SimulatedStarNode[] => {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  return next.map((node) => {
    const carried = prevById.get(node.id);
    if (carried && carried.x != null) {
      const { x, y, z, vx, vy, vz } = carried;
      return { ...node, x, y, z, vx, vy, vz };
    }
    const jitter = (salt: number): number =>
      (hashUnit(node.id, salt) * 2 - 1) * SPAWN_JITTER_RADIUS;
    return {
      ...node,
      x: node.anchor.x + jitter(1),
      y: node.anchor.y + jitter(2),
      z: node.anchor.z + jitter(3),
    };
  });
};
