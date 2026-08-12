import { fireEvent, render, screen } from '@testing-library/react';
import type { Session } from '@sagewright/shared';
import { describe, expect, it, vi } from 'vitest';

import { MosaicPane } from './MosaicPane';
import { WorkspaceActionsContext, type WorkspaceActions } from './workspace-actions';
import { EMPTY_LEAF_PREFIX } from './workspace-mapping';

// The pane body (SessionPanel) opens sockets/fetches; the spawn button pulls in runners + i18n.
// Stub both so the test stays on MosaicPane's own toolbar + picker wiring.
vi.mock('../tasks/SessionPanel', () => ({ SessionPanel: () => <div data-testid="session-panel" /> }));
vi.mock('../components/NewSessionButton', () => ({
  NewSessionButton: ({ onCreated, label }: { onCreated: (t: { id: string }) => void; label?: string }) => (
    <button onClick={() => onCreated({ id: 'spawned-1' })}>{label}</button>
  ),
}));
vi.mock('../api/hooks', () => ({
  useTask: () => ({
    data: { id: 't1', name: 'My session', status: 'running', origin: 'user', kind: 'interactive', runnerImage: null },
  }),
  useRunners: () => ({ data: { runners: [] } }),
}));

const makeActions = (over: Partial<WorkspaceActions> = {}): WorkspaceActions => ({
  splitLeaf: vi.fn(),
  assignSession: vi.fn(),
  removeLeaf: vi.fn(),
  toggleZoom: vi.fn(),
  focusLeaf: vi.fn(),
  zoomedLeafId: null,
  focusedLeafId: null,
  availableSessions: [],
  ...over,
});

const renderPane = (leafId: string, actions: WorkspaceActions) =>
  render(
    <WorkspaceActionsContext.Provider value={actions}>
      <MosaicPane leafId={leafId} />
    </WorkspaceActionsContext.Provider>,
  );

const fakeSession = (id: string, name: string): Session => ({ id, name, prompt: null } as unknown as Session);

describe('MosaicPane — session leaf', () => {
  it('renders the session label, status, and body', () => {
    renderPane('t1', makeActions());
    expect(screen.getByText('My session')).toBeTruthy();
    expect(screen.getByText('running')).toBeTruthy();
    expect(screen.getByTestId('session-panel')).toBeTruthy();
  });

  it('split right / split down call splitLeaf with the direction', () => {
    const actions = makeActions();
    renderPane('t1', actions);
    fireEvent.click(screen.getByLabelText('Split right'));
    expect(actions.splitLeaf).toHaveBeenCalledWith('t1', 'row');
    fireEvent.click(screen.getByLabelText('Split down'));
    expect(actions.splitLeaf).toHaveBeenCalledWith('t1', 'column');
  });

  it('zoom toggles and remove removes the pane', () => {
    const actions = makeActions();
    renderPane('t1', actions);
    fireEvent.click(screen.getByLabelText('Zoom pane'));
    expect(actions.toggleZoom).toHaveBeenCalledWith('t1');
    fireEvent.click(screen.getByLabelText('Remove pane'));
    expect(actions.removeLeaf).toHaveBeenCalledWith('t1');
  });

  it('offers an open-in-new-tab link to the session detail page', () => {
    renderPane('t1', makeActions());
    const link = screen.getByLabelText('Open session in new tab') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/tasks/t1');
  });
});

describe('MosaicPane — empty leaf', () => {
  const emptyId = `${EMPTY_LEAF_PREFIX}slot`;

  it('disables add-existing when no sessions are available', () => {
    renderPane(emptyId, makeActions({ availableSessions: [] }));
    expect(screen.getByText('Empty pane')).toBeTruthy();
    expect((screen.getByLabelText('Add existing session') as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists available sessions and assigns the picked one', () => {
    const actions = makeActions({ availableSessions: [fakeSession('s-a', 'Session A'), fakeSession('s-b', 'Session B')] });
    renderPane(emptyId, actions);
    fireEvent.click(screen.getByLabelText('Add existing session'));
    fireEvent.click(screen.getByText('Session B'));
    expect(actions.assignSession).toHaveBeenCalledWith(emptyId, 's-b');
  });

  it('spawns a new session and assigns it into the pane', () => {
    const actions = makeActions();
    renderPane(emptyId, actions);
    fireEvent.click(screen.getByText('Spawn new'));
    expect(actions.assignSession).toHaveBeenCalledWith(emptyId, 'spawned-1');
  });
});
