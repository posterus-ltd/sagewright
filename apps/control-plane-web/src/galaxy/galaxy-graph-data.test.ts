import { SessionStatus, type Session } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { buildGalaxyGraph } from './galaxy-graph-data';

const session = (over: Partial<Session>): Session => ({
  id: 's1',
  kind: 'headless',
  name: null,
  prompt: null,
  workerImage: 'claude-code',
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
  it('creates one node per session, labeled and clustered by workerImage', () => {
    const { nodes } = buildGalaxyGraph([session({ id: 'a', workerImage: 'claude-code', name: 'Fix bug' })]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: 'a', name: 'Fix bug', clusterId: 'claude-code', isHub: false });
  });

  it('falls back to an "unassigned" cluster when a session has no workerImage', () => {
    const { nodes } = buildGalaxyGraph([session({ id: 'a', workerImage: null })]);
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
    expect(links).toEqual([{ id: 'parent->child', source: 'parent', target: 'child' }]);
  });

  it('gives every session in the same cluster the same anchor point, and different clusters different anchors', () => {
    const sessions = [
      session({ id: 'a', workerImage: 'claude-code' }),
      session({ id: 'b', workerImage: 'claude-code' }),
      session({ id: 'c', workerImage: 'codex' }),
    ];
    const { nodes } = buildGalaxyGraph(sessions);
    const [a, b, c] = nodes;
    expect(a!.anchor).toEqual(b!.anchor);
    expect(a!.anchor).not.toEqual(c!.anchor);
  });

  it('anchor positions are stable regardless of input order (sorted by cluster id)', () => {
    const forward = buildGalaxyGraph([session({ id: 'a', workerImage: 'claude-code' }), session({ id: 'b', workerImage: 'codex' })]);
    const reversed = buildGalaxyGraph([session({ id: 'b', workerImage: 'codex' }), session({ id: 'a', workerImage: 'claude-code' })]);
    const anchorFor = (graph: typeof forward, clusterId: string) => graph.nodes.find((n) => n.clusterId === clusterId)!.anchor;
    expect(anchorFor(forward, 'claude-code')).toEqual(anchorFor(reversed, 'claude-code'));
    expect(anchorFor(forward, 'codex')).toEqual(anchorFor(reversed, 'codex'));
  });
});
