import { SessionStatus, type Session } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import {
  buildGalaxyGraph,
  carrySimulationState,
  clusterDisplayName,
  clusterSummaries,
  SPAWN_JITTER_RADIUS,
  type SimulatedStarNode,
} from './galaxy-graph-data';

const session = (over: Partial<Session>): Session => ({
  id: 's1',
  kind: 'headless',
  name: null,
  prompt: null,
  runnerImage: 'claude-code',
  status: SessionStatus.RUNNING,
  branch: null,
  prUrl: null,
  createdBy: 'al',
  containerId: null,
  scheduledPromptId: null,
  parentSessionId: null,
  workflowId: null,
  workflowStepKey: null,
  currentStepKey: null,
  iteration: null,
  error: null,
  archivedAt: null,
  startedAt: null,
  endedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('buildGalaxyGraph', () => {
  it('creates one node per session, labeled and clustered by runnerImage', () => {
    const { nodes } = buildGalaxyGraph([session({ id: 'a', runnerImage: 'claude-code', name: 'Fix bug' })]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: 'a', name: 'Fix bug', clusterId: 'claude-code', isHub: false });
  });

  it('falls back to an "unassigned" cluster when a session has no runnerImage', () => {
    const { nodes } = buildGalaxyGraph([session({ id: 'a', runnerImage: null })]);
    expect(nodes[0]!.clusterId).toBe('unassigned');
  });

  it('marks workflow-kind sessions as hub nodes', () => {
    const { nodes } = buildGalaxyGraph([session({ id: 'wf', kind: 'workflow' })]);
    expect(nodes[0]!.isHub).toBe(true);
  });

  it('links each session to its parent, and drops links whose parent is missing from the payload', () => {
    const sessions = [
      session({ id: 'parent', kind: 'workflow' }),
      session({ id: 'child', kind: 'workflow_step', parentSessionId: 'parent' }),
      session({ id: 'orphan', kind: 'workflow_step', parentSessionId: 'missing' }),
    ];
    const { links } = buildGalaxyGraph(sessions);
    expect(links).toEqual([
      { id: 'parent->child', source: 'parent', target: 'child', targetStatus: SessionStatus.RUNNING },
    ]);
  });

  it("stamps each link with its target's status so link visuals can react without node lookups", () => {
    const sessions = [
      session({ id: 'parent', kind: 'workflow' }),
      session({ id: 'child', kind: 'workflow_step', parentSessionId: 'parent', status: SessionStatus.DONE }),
    ];
    const { links } = buildGalaxyGraph(sessions);
    expect(links[0]!.targetStatus).toBe(SessionStatus.DONE);
  });

  it('gives every session in the same cluster the same anchor point, and different clusters different anchors', () => {
    const sessions = [
      session({ id: 'a', runnerImage: 'claude-code' }),
      session({ id: 'b', runnerImage: 'claude-code' }),
      session({ id: 'c', runnerImage: 'codex' }),
    ];
    const { nodes } = buildGalaxyGraph(sessions);
    const [a, b, c] = nodes;
    expect(a!.anchor).toEqual(b!.anchor);
    expect(a!.anchor).not.toEqual(c!.anchor);
  });

  it('anchor positions are stable regardless of input order (sorted by cluster id)', () => {
    const forward = buildGalaxyGraph([session({ id: 'a', runnerImage: 'claude-code' }), session({ id: 'b', runnerImage: 'codex' })]);
    const reversed = buildGalaxyGraph([session({ id: 'b', runnerImage: 'codex' }), session({ id: 'a', runnerImage: 'claude-code' })]);
    const anchorFor = (graph: typeof forward, clusterId: string) => graph.nodes.find((n) => n.clusterId === clusterId)!.anchor;
    expect(anchorFor(forward, 'claude-code')).toEqual(anchorFor(reversed, 'claude-code'));
    expect(anchorFor(forward, 'codex')).toEqual(anchorFor(reversed, 'codex'));
  });
});

describe('clusterDisplayName', () => {
  it('strips the registry path, runner-image prefix, and tag down to the agent name', () => {
    expect(clusterDisplayName('sagewright-runner-opencode:latest')).toBe('opencode');
    expect(clusterDisplayName('ghcr.io/acme/sagewright-runner-codex:v2')).toBe('codex');
  });

  it('leaves names without image decoration untouched', () => {
    expect(clusterDisplayName('unassigned')).toBe('unassigned');
    expect(clusterDisplayName('custom-agent')).toBe('custom-agent');
  });
});

describe('clusterSummaries', () => {
  it('summarizes each cluster with totals and live (in-flight or needs-assistance) counts, sorted by id', () => {
    const { nodes } = buildGalaxyGraph([
      session({ id: 'a', runnerImage: 'codex', status: SessionStatus.DONE }),
      session({ id: 'b', runnerImage: 'claude-code', status: SessionStatus.RUNNING }),
      session({ id: 'c', runnerImage: 'claude-code', status: SessionStatus.NEEDS_ASSISTANCE }),
      session({ id: 'd', runnerImage: 'claude-code', status: SessionStatus.FAILED }),
    ]);
    const summaries = clusterSummaries(nodes);
    expect(summaries.map((s) => s.clusterId)).toEqual(['claude-code', 'codex']);
    expect(summaries[0]).toMatchObject({ total: 3, live: 2 });
    expect(summaries[1]).toMatchObject({ total: 1, live: 0 });
    expect(summaries[0]!.anchor).toEqual(nodes.find((n) => n.clusterId === 'claude-code')!.anchor);
  });
});

describe('carrySimulationState', () => {
  const graphFor = (ids: string[]) => buildGalaxyGraph(ids.map((id) => session({ id })));

  it('carries positions and velocities forward by id so a data refresh does not restart the layout', () => {
    const prev: SimulatedStarNode[] = graphFor(['a']).nodes;
    Object.assign(prev[0]!, { x: 10, y: 20, z: 30, vx: 1, vy: 2, vz: 3 });
    const next = carrySimulationState(prev, graphFor(['a']).nodes);
    expect(next[0]).toMatchObject({ x: 10, y: 20, z: 30, vx: 1, vy: 2, vz: 3 });
  });

  it("spawns unseen nodes near their cluster's anchor instead of the field origin", () => {
    const [node] = carrySimulationState([], graphFor(['a']).nodes);
    const { anchor } = node!;
    const distance = Math.hypot(node!.x! - anchor.x, node!.y! - anchor.y, node!.z! - anchor.z);
    expect(distance).toBeLessThanOrEqual(SPAWN_JITTER_RADIUS * Math.sqrt(3));
    expect(distance).toBeGreaterThan(0);
  });

  it('spawns deterministically — the same node lands in the same spot on every rebuild', () => {
    const [first] = carrySimulationState([], graphFor(['a']).nodes);
    const [second] = carrySimulationState([], graphFor(['a']).nodes);
    expect({ x: first!.x, y: first!.y, z: first!.z }).toEqual({ x: second!.x, y: second!.y, z: second!.z });
  });

  it('scatters different nodes to different spawn points', () => {
    const nodes = carrySimulationState([], graphFor(['a', 'b']).nodes);
    expect({ x: nodes[0]!.x, y: nodes[0]!.y }).not.toEqual({ x: nodes[1]!.x, y: nodes[1]!.y });
  });
});
