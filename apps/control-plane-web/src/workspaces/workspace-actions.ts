import type { MosaicDirection, Session } from '@sagewright/shared';
import { createContext, useContext } from 'react';

/**
 * Actions a pane can trigger on the surrounding workspace. Provided by `WorkspacesBoard` so
 * panes don't have to thread callbacks through the tree. The `canvas-actions.ts` analogue.
 */
export interface WorkspaceActions {
  /** Split the pane in two (tmux `prefix+%` / `prefix+"`): a fresh `empty:*` pane appears
   *  beside it along `direction` ('row' → to the right, 'column' → below). */
  splitLeaf: (leafId: string, direction: MosaicDirection) => void;
  /** Fill a pane with a session. Moves the session (rather than duplicating) if it's already
   *  placed elsewhere in this workspace. */
  assignSession: (leafId: string, sessionId: string) => void;
  /** Remove the pane entirely, collapsing its split and promoting the neighbor. */
  removeLeaf: (leafId: string) => void;
  /** Maximize the pane to fill the frame, or restore if it's already zoomed (tmux `prefix+z`).
   *  Transient view state — never persisted. */
  toggleZoom: (leafId: string) => void;
  /** Mark a pane focused (for the optional keyboard-zoom shortcut). */
  focusLeaf: (leafId: string) => void;
  /** The currently-maximized pane, or null. */
  zoomedLeafId: string | null;
  /** The last-focused pane, or null. */
  focusedLeafId: string | null;
  /** Active, unarchived sessions not already placed in the current workspace — the pool the
   *  empty-pane "Add existing session" picker offers. */
  availableSessions: Session[];
}

const noop = (): void => undefined;

export const WorkspaceActionsContext = createContext<WorkspaceActions>({
  splitLeaf: noop,
  assignSession: noop,
  removeLeaf: noop,
  toggleZoom: noop,
  focusLeaf: noop,
  zoomedLeafId: null,
  focusedLeafId: null,
  availableSessions: [],
});

export const useWorkspaceActions = (): WorkspaceActions => useContext(WorkspaceActionsContext);
