import {
  Box,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
  Typography,
  useTheme,
} from '@mui/material';
import { sessionLabel, type CanvasLayout, type Session } from '@sagewright/shared';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from 'react';

import { useCanvasLayout, useTasks, useUpdateCanvasLayout } from '../api/hooks';
import { MainContainer } from '../components/MainContainer';
import { NewSessionButton } from '../components/NewSessionButton';
import { distinctBorderColors, pickRandomBorderColor } from './border-colors';
import { CanvasActionsContext, type SessionNodeData } from './canvas-actions';
import {
  buildLayout,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  placementToNode,
} from './canvas-mapping';
import { SessionNode } from './SessionNode';

const SAVE_DEBOUNCE_MS = 500;
const STAGGER = 36;

const nodeTypes: NodeTypes = { session: SessionNode };

// Changes worth persisting — ignore pure selection/hover churn.
const PERSISTABLE_CHANGE_TYPES = new Set([
  'position',
  'dimensions',
  'remove',
  'add',
]);

const isActive = (t: Session): boolean => t.archivedAt === null;

interface BoardProps {
  initialLayout: CanvasLayout;
  tasks: Session[];
}

const CanvasBoard: FC<BoardProps> = ({ initialLayout, tasks }) => {
  const theme = useTheme();
  const { getViewport, screenToFlowPosition } = useReactFlow();
  const updateLayout = useUpdateCanvasLayout();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const activeIds = useMemo(
    () => new Set(tasks.filter(isActive).map((t) => t.id)),
    [tasks],
  );

  // Seed nodes once from the saved layout, keeping only still-active sessions.
  const [initialNodes] = useState<Node<SessionNodeData>[]>(() =>
    initialLayout.placements
      .filter((p) => activeIds.has(p.sessionId))
      .map(placementToNode),
  );
  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<SessionNodeData>>(initialNodes);

  // Keep a ref to the latest nodes so the debounced save reads current state.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateLayout.mutate(buildLayout(nodesRef.current, getViewport()));
    }, SAVE_DEBOUNCE_MS);
  }, [getViewport, updateLayout]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Drop widgets whose session was archived elsewhere. (Stopping only flips
  // status, not archivedAt, so a stop closes its own widget via onStopped.)
  useEffect(() => {
    setNodes((nds) => {
      const pruned = nds.filter((n) => activeIds.has(n.id));
      if (pruned.length !== nds.length) scheduleSave();
      return pruned.length === nds.length ? nds : pruned;
    });
  }, [activeIds, setNodes, scheduleSave]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<SessionNodeData>>[]) => {
      onNodesChange(changes);
      if (changes.some((c) => PERSISTABLE_CHANGE_TYPES.has(c.type)))
        scheduleSave();
    },
    [onNodesChange, scheduleSave],
  );

  // Drop new widgets near the centre of what the user is currently looking at.
  const nextDropPosition = useCallback(
    (index: number): { x: number; y: number } => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        : { x: 0, y: 0 };
      return {
        x: center.x - DEFAULT_WIDTH / 2 + index * STAGGER,
        y: center.y - DEFAULT_HEIGHT / 2 + index * STAGGER,
      };
    },
    [screenToFlowPosition],
  );

  const addSession = useCallback(
    (sessionId: string) => {
      setNodes((nds) => {
        if (nds.some((n) => n.id === sessionId)) return nds;
        const pos = nextDropPosition(nds.length);
        // New widgets get a random border color so they're distinguishable at a glance.
        return [
          ...nds,
          placementToNode({
            sessionId,
            x: pos.x,
            y: pos.y,
            borderColor: pickRandomBorderColor(),
          }),
        ];
      });
      scheduleSave();
    },
    [nextDropPosition, scheduleSave, setNodes],
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== sessionId));
      scheduleSave();
    },
    [scheduleSave, setNodes],
  );

  const setBorderColor = useCallback(
    (sessionId: string, color: string | undefined) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === sessionId
            ? { ...n, data: { ...n.data, borderColor: color } }
            : n,
        ),
      );
      scheduleSave();
    },
    [scheduleSave, setNodes],
  );

  // Add-existing menu lists active sessions not already on the canvas.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const placedIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const addableSessions = useMemo(
    () => tasks.filter((t) => isActive(t) && !placedIds.has(t.id)),
    [tasks, placedIds],
  );

  const usedBorderColors = useMemo(
    () => distinctBorderColors(nodes.map((n) => n.data.borderColor)),
    [nodes],
  );

  const actions = useMemo(
    () => ({ removeSession, setBorderColor, usedBorderColors }),
    [removeSession, setBorderColor, usedBorderColors],
  );

  return (
    <Box ref={wrapperRef} sx={{ width: '100%', height: '100%' }}>
      <CanvasActionsContext.Provider value={actions}>
        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={[]}
          onNodesChange={handleNodesChange}
          onMoveEnd={scheduleSave}
          defaultViewport={initialLayout.viewport}
          colorMode={theme.palette.mode}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={theme.palette.divider} gap={20} />
          <Controls />

          <Panel position="top-left">
            <Box sx={{ display: 'flex', gap: 1 }}>
              <NewSessionButton
                label="New session"
                onCreated={(task) => addSession(task.id)}
              />
              {addableSessions.length > 0 && (
                <>
                  <Button
                    variant="outlined"
                    onClick={(e) => setMenuAnchor(e.currentTarget)}
                  >
                    Add existing
                  </Button>
                  <Menu
                    anchorEl={menuAnchor}
                    open={Boolean(menuAnchor)}
                    onClose={() => setMenuAnchor(null)}
                  >
                    {addableSessions.map((t) => (
                      <MenuItem
                        key={t.id}
                        onClick={() => {
                          setMenuAnchor(null);
                          addSession(t.id);
                        }}
                      >
                        {sessionLabel(t, 48)}
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              )}
            </Box>
          </Panel>

          {nodes.length === 0 && (
            <Panel position="top-center">
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 12 }}
              >
                Add a session to start building your canvas.
              </Typography>
            </Panel>
          )}
        </ReactFlow>
      </CanvasActionsContext.Provider>
    </Box>
  );
};

export const CanvasPage: FC = () => {
  const { data: layout, isLoading: layoutLoading } = useCanvasLayout();
  const { data: tasks, isLoading: tasksLoading } = useTasks(true);

  if (layoutLoading || tasksLoading || !layout || !tasks) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <MainContainer flush>
      <ReactFlowProvider>
        <CanvasBoard initialLayout={layout} tasks={tasks} />
      </ReactFlowProvider>
    </MainContainer>
  );
};
