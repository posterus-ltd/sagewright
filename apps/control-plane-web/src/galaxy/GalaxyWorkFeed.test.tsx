import { SessionKind, SessionStatus, type Session } from '@sagewright/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { dark } from '../theme/tokens';
import { buildGalaxyGraph } from './galaxy-graph-data';
import { GalaxyWorkFeed } from './GalaxyWorkFeed';

const session = (id: string): Session => ({
  id,
  kind: SessionKind.HEADLESS,
  name: `Task ${id}`,
  prompt: `Work on task ${id}`,
  workerImage: 'sagewright-worker-codex:latest',
  status: SessionStatus.RUNNING,
  branch: null,
  prUrl: null,
  createdBy: 'Ada',
  containerId: null,
  scheduledPromptId: null,
  parentSessionId: null,
  workflowId: null,
  workflowStepKey: null,
  currentStepKey: 'building',
  iteration: 1,
  error: null,
  archivedAt: null,
  startedAt: '2026-07-12T10:00:00.000Z',
  endedAt: null,
  createdAt: '2026-07-12T10:00:00.000Z',
  updatedAt: '2026-07-12T10:05:00.000Z',
});

describe('GalaxyWorkFeed', () => {
  it('starts collapsed and reveals the complete scrollable task list', () => {
    const nodes = buildGalaxyGraph(
      Array.from({ length: 8 }, (_, index) => session(String(index + 1))),
    ).nodes;

    render(
      <GalaxyWorkFeed
        nodes={nodes}
        palette={dark}
        selectedId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(
      screen.queryAllByRole('button', { name: /Inspect Task/ }),
    ).toHaveLength(0);

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand work in orbit, 8 tasks' }),
    );

    expect(
      screen.getAllByRole('button', { name: /Inspect Task/ }),
    ).toHaveLength(8);
    expect(
      screen
        .getByRole('button', { name: 'Collapse work in orbit' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });
});
