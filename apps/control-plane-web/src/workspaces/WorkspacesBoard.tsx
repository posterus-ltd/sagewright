import { Box, Button, Typography } from '@mui/material';
import ViewQuiltRounded from '@mui/icons-material/ViewQuiltRounded';
import {
  sessionLeafIds,
  type MosaicDirection,
  type MosaicNode,
  type Session,
  type Workspace,
  type WorkspacesResponse,
} from '@sagewright/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';

import { useUpdateWorkspaces } from '../api/hooks';
import { useUserPreferences } from '../preferences/UserPreferencesProvider';
import { WorkspaceActionsContext, type WorkspaceActions } from './workspace-actions';
import { WorkspaceMosaic } from './WorkspaceMosaic';
import { WorkspacesList } from './WorkspacesList';
import {
  leafIds,
  newEmptyLeafId,
  pruneLeaves,
  removeLeaf as removeLeafInTree,
  replaceLeaf,
  splitLeaf as splitLeafInTree,
  workspacesSignature,
} from './workspace-mapping';

const SAVE_DEBOUNCE_MS = 500;

const activeSessionIds = (tasks: Session[]): Set<string> =>
  new Set(tasks.filter((t) => t.archivedAt === null).map((t) => t.id));

/** Drop archived-session leaves from every workspace's tree (the seed/reconcile normalizer). */
const pruneWorkspaces = (list: Workspace[], active: Set<string>): Workspace[] =>
  list.map((w) => ({ ...w, tree: pruneLeaves(w.tree, active) }));

/** Prefer the server's active workspace if it still exists, else the previous, else the first. */
const resolveActive = (list: Workspace[], preferred: string | null, prev: string | null): string | null => {
  if (preferred && list.some((w) => w.id === preferred)) return preferred;
  if (prev && list.some((w) => w.id === prev)) return prev;
  return list[0]?.id ?? null;
};

interface BoardProps {
  serverWorkspaces: WorkspacesResponse;
  tasks: Session[];
}

/**
 * The stateful controller for /workspaces (the `CanvasBoard` analogue): seeds workspaces +
 * activeWorkspaceId once from the server, runs the persistence engine (debounced save +
 * out-of-band reconcile + archived-session prune), owns transient zoom/focus state, provides
 * `WorkspaceActionsContext`, and lays out the mosaic + the right-hand workspaces list.
 */
export const WorkspacesBoard: FC<BoardProps> = ({ serverWorkspaces, tasks }) => {
  const updateWorkspaces = useUpdateWorkspaces();
  const { preference: collapsed, updatePreference: setCollapsed } = useUserPreferences(
    'workspacesListCollapsed',
    false,
  );

  // Seed once from the server, pruning session leaves whose session is no longer active.
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() =>
    pruneWorkspaces(serverWorkspaces.workspaces, activeSessionIds(tasks)),
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() =>
    resolveActive(
      pruneWorkspaces(serverWorkspaces.workspaces, activeSessionIds(tasks)),
      serverWorkspaces.activeWorkspaceId,
      null,
    ),
  );
  // Zoom + focus are client-only view state — never persisted, excluded from the save signature.
  const [zoomedLeafId, setZoomedLeafId] = useState<string | null>(null);
  const [focusedLeafId, setFocusedLeafId] = useState<string | null>(null);

  // Latest state, read by the debounced save and the effects without stale-closure risk.
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;
  const activeIdRef = useRef(activeWorkspaceId);
  activeIdRef.current = activeWorkspaceId;
  const zoomRef = useRef(zoomedLeafId);
  zoomRef.current = zoomedLeafId;

  const activeIds = useMemo(() => activeSessionIds(tasks), [tasks]);

  // Signatures of blobs this client recently SAVED, so a polled blob that is just our own write
  // echoing back is never mistaken for an external change. True while a divider is mid-drag so a
  // live reconcile never yanks it. Seeded from the initial (pruned) workspaces.
  const savedSignaturesRef = useRef<Set<string>>(new Set([workspacesSignature(workspacesRef.current)]));
  const draggingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = undefined; // no longer pending — lets reconcile run again
      const blob = { workspaces: workspacesRef.current, activeWorkspaceId: activeIdRef.current };
      const sig = workspacesSignature(blob.workspaces);
      savedSignaturesRef.current.add(sig);
      if (savedSignaturesRef.current.size > 20) {
        savedSignaturesRef.current = new Set([...savedSignaturesRef.current].slice(-10));
      }
      updateWorkspaces.mutate(blob);
    }, SAVE_DEBOUNCE_MS);
  }, [updateWorkspaces]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Adopt an out-of-band blob (an agent's set_workspaces, or another tab) live: when the polled
  // server blob differs from what we show AND isn't one of our own recent saves, re-seed. Both
  // sides are pruned to active sessions first, so an archived-only difference (which the prune
  // effect below resolves) never triggers a reconcile loop. Skipped while dragging or with a
  // save pending, so we never fight an in-flight edit; the next poll re-evaluates.
  useEffect(() => {
    const prunedServer = pruneWorkspaces(serverWorkspaces.workspaces, activeIds);
    const serverSig = workspacesSignature(prunedServer);
    const localSig = workspacesSignature(workspacesRef.current);
    if (serverSig === localSig) return; // already in sync
    if (savedSignaturesRef.current.has(serverSig)) return; // our own save echoing back
    if (draggingRef.current || saveTimer.current) return; // don't interrupt an active edit
    setWorkspaces(prunedServer);
    setActiveWorkspaceId((prev) => resolveActive(prunedServer, serverWorkspaces.activeWorkspaceId, prev));
  }, [serverWorkspaces, activeIds]);

  // Drop session leaves whose session was archived elsewhere from every workspace; persist if
  // changed. Stopped/done (terminal but not archived) sessions are KEPT — SessionPanel renders
  // their terminal state, matching canvas semantics.
  useEffect(() => {
    if (zoomRef.current && !activeIds.has(zoomRef.current)) setZoomedLeafId(null);
    setWorkspaces((prev) => {
      let changed = false;
      const next = prev.map((w) => {
        const tree = pruneLeaves(w.tree, activeIds);
        if (tree !== w.tree) changed = true;
        return tree === w.tree ? w : { ...w, tree };
      });
      if (changed) scheduleSave();
      return changed ? next : prev;
    });
  }, [activeIds, scheduleSave]);

  // --- mutators (each updates local state, then schedules a save) ------------------------

  /** Apply `fn` to the active workspace's tree. */
  const updateActiveTree = useCallback(
    (fn: (tree: MosaicNode | null) => MosaicNode | null) => {
      setWorkspaces((prev) => prev.map((w) => (w.id === activeIdRef.current ? { ...w, tree: fn(w.tree) } : w)));
      scheduleSave();
    },
    [scheduleSave],
  );

  const splitLeaf = useCallback(
    (leafId: string, direction: MosaicDirection) =>
      updateActiveTree((tree) => (tree == null ? tree : splitLeafInTree(tree, leafId, direction, newEmptyLeafId()))),
    [updateActiveTree],
  );

  const assignSession = useCallback(
    (leafId: string, sessionId: string) =>
      updateActiveTree((tree) => {
        if (tree == null) return sessionId; // first pane in an empty workspace
        // Move rather than duplicate: if the session already sits elsewhere here, vacate it.
        const next = sessionLeafIds(tree).includes(sessionId)
          ? replaceLeaf(tree, sessionId, newEmptyLeafId())
          : tree;
        return replaceLeaf(next, leafId, sessionId);
      }),
    [updateActiveTree],
  );

  const removeLeaf = useCallback(
    (leafId: string) => {
      if (zoomRef.current === leafId) setZoomedLeafId(null);
      updateActiveTree((tree) => (tree == null ? null : removeLeafInTree(tree, leafId)));
    },
    [updateActiveTree],
  );

  const toggleZoom = useCallback((leafId: string) => {
    setZoomedLeafId((prev) => (prev === leafId ? null : leafId));
  }, []);

  const focusLeaf = useCallback((leafId: string) => setFocusedLeafId(leafId), []);

  const addPane = useCallback(() => updateActiveTree(() => newEmptyLeafId()), [updateActiveTree]);

  const handleTreeChange = useCallback(
    (tree: MosaicNode) => {
      setWorkspaces((prev) => prev.map((w) => (w.id === activeIdRef.current ? { ...w, tree } : w)));
      scheduleSave();
    },
    [scheduleSave],
  );

  // --- workspace management (right-list actions) ----------------------------------------

  const createWorkspace = useCallback(() => {
    const id = crypto.randomUUID();
    const name = `Workspace ${workspacesRef.current.length + 1}`;
    // Seed with a single empty pane so the add/spawn placeholder is immediately actionable.
    setWorkspaces((prev) => [...prev, { id, name, tree: newEmptyLeafId() }]);
    setActiveWorkspaceId(id);
    setZoomedLeafId(null);
    scheduleSave();
  }, [scheduleSave]);

  const renameWorkspace = useCallback(
    (id: string, name: string) => {
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)));
      scheduleSave();
    },
    [scheduleSave],
  );

  const duplicateWorkspace = useCallback(
    (id: string) => {
      const src = workspacesRef.current.find((w) => w.id === id);
      if (!src) return;
      const newId = crypto.randomUUID();
      const copy: Workspace = { id: newId, name: `${src.name} (copy)`.slice(0, 120), tree: structuredClone(src.tree) };
      setWorkspaces((prev) => {
        const idx = prev.findIndex((w) => w.id === id);
        const next = [...prev];
        next.splice(idx + 1, 0, copy);
        return next;
      });
      setActiveWorkspaceId(newId);
      setZoomedLeafId(null);
      scheduleSave();
    },
    [scheduleSave],
  );

  const deleteWorkspace = useCallback(
    (id: string) => {
      setWorkspaces((prev) => {
        const next = prev.filter((w) => w.id !== id);
        if (activeIdRef.current === id) {
          setActiveWorkspaceId(next[0]?.id ?? null);
          setZoomedLeafId(null);
        }
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const switchWorkspace = useCallback(
    (id: string) => {
      setActiveWorkspaceId(id);
      setZoomedLeafId(null);
      setFocusedLeafId(null);
      scheduleSave();
    },
    [scheduleSave],
  );

  // --- derived + context ----------------------------------------------------------------

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  const placedSessionIds = useMemo(
    () => new Set(sessionLeafIds(activeWorkspace?.tree ?? null)),
    [activeWorkspace],
  );
  const availableSessions = useMemo(
    () => tasks.filter((t) => t.archivedAt === null && !placedSessionIds.has(t.id)),
    [tasks, placedSessionIds],
  );

  // Only honor a zoom that still points at a real, present leaf.
  const zoomValid = zoomedLeafId != null && leafIds(activeWorkspace?.tree ?? null).includes(zoomedLeafId);

  const actions = useMemo<WorkspaceActions>(
    () => ({
      splitLeaf,
      assignSession,
      removeLeaf,
      toggleZoom,
      focusLeaf,
      zoomedLeafId: zoomValid ? zoomedLeafId : null,
      focusedLeafId,
      availableSessions,
    }),
    [splitLeaf, assignSession, removeLeaf, toggleZoom, focusLeaf, zoomValid, zoomedLeafId, focusedLeafId, availableSessions],
  );

  return (
    <WorkspaceActionsContext.Provider value={actions}>
      <Box sx={{ display: 'flex', height: '100%', width: '100%', minHeight: 0 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0, minHeight: 0 }}>
          {activeWorkspace ? (
            <WorkspaceMosaic
              tree={activeWorkspace.tree}
              zoomedLeafId={zoomValid ? zoomedLeafId : null}
              onTreeChange={handleTreeChange}
              onDraggingChange={(dragging) => {
                draggingRef.current = dragging;
                if (!dragging) scheduleSave();
              }}
              onAddPane={addPane}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                color: 'text.secondary',
              }}
            >
              <ViewQuiltRounded sx={{ fontSize: 48, opacity: 0.5 }} />
              <Typography variant="body1">No workspace yet.</Typography>
              <Button variant="contained" onClick={createWorkspace}>
                New workspace
              </Button>
            </Box>
          )}
        </Box>
        <WorkspacesList
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(!collapsed)}
          onSwitch={switchWorkspace}
          onCreate={createWorkspace}
          onRename={renameWorkspace}
          onDuplicate={duplicateWorkspace}
          onDelete={deleteWorkspace}
        />
      </Box>
    </WorkspaceActionsContext.Provider>
  );
};
