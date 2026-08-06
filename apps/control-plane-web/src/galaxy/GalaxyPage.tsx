import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';

import { useTaskGraph } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import { MainContainer } from '../components/MainContainer';
import { useUserPreferences } from '../preferences/UserPreferencesProvider';
import { useThemeMode } from '../theme/ThemeModeProvider';
import { palettes, ResolvedMode } from '../theme/tokens';
import {
  filterSessionsByScope,
  filterSessionsByView,
  GalaxyScope,
  GalaxyView,
} from './galaxy-filters';
import { buildGalaxyGraph } from './galaxy-graph-data';
import {
  DEFAULT_GALAXY_TIME_WINDOW,
  filterSessionsByWindow,
  GalaxyTimeWindow,
} from './galaxy-time-window';
import { GalaxyHud } from './GalaxyHud';
import { GalaxyScene, type GalaxySceneHandle } from './GalaxyScene';
import { countByGroup, type StatusGroupKey } from './status-legend';
import { TaskDetailPanel } from './TaskDetailPanel';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export const GalaxyPage: FC = () => {
  const { data: sessions, isLoading } = useTaskGraph();
  const { resolvedMode } = useThemeMode();
  const palette = palettes[resolvedMode];
  const reducedMotion = usePrefersReducedMotion();
  const sceneRef = useRef<GalaxySceneHandle>(null);

  const { userId } = useAuth();
  const { preference: timeWindow, updatePreference: setTimeWindow } =
    useUserPreferences('galaxyTimeWindow', DEFAULT_GALAXY_TIME_WINDOW);
  // Like the Sessions page's toggles, these are transient lenses, not saved
  // preferences — every visit starts on the live, fleet-wide field.
  const [view, setView] = useState<GalaxyView>(GalaxyView.ACTIVE);
  const [scope, setScope] = useState<GalaxyScope>(GalaxyScope.ALL);
  const [hiddenGroups, setHiddenGroups] = useState<ReadonlySet<StatusGroupKey>>(
    new Set(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const windowed = useMemo(
    () =>
      filterSessionsByWindow(
        filterSessionsByView(
          filterSessionsByScope(sessions ?? [], scope, userId),
          view,
        ),
        timeWindow,
        Date.now(),
      ),
    [sessions, scope, userId, view, timeWindow],
  );
  const { nodes, links } = useMemo(
    () => buildGalaxyGraph(windowed),
    [windowed],
  );
  const counts = useMemo(
    () => countByGroup(nodes.map((n) => n.status)),
    [nodes],
  );
  const agentCount = useMemo(
    () => new Set(nodes.map((n) => n.clusterId)).size,
    [nodes],
  );
  // Resolve the selection against the freshest poll so the panel tracks live
  // status changes; a star that left the window closes its panel with it.
  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const toggleGroup = useCallback((key: StatusGroupKey): void => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (isLoading || !sessions) {
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
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          bgcolor: palette.bg,
          backgroundImage: `radial-gradient(circle at 68% 36%, ${palette.info}16 0, transparent 28%), radial-gradient(circle at 42% 72%, ${palette.accent}0D 0, transparent 24%), linear-gradient(145deg, ${palette.bg}, ${palette.surface} 130%)`,
        }}
      >
        {sessions.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No tasks yet — the galaxy fills in as agents get to work.
            </Typography>
          </Box>
        ) : (
          <>
            <GalaxyScene
              ref={sceneRef}
              nodes={nodes}
              links={links}
              palette={palette}
              isDark={resolvedMode === ResolvedMode.DARK}
              hiddenGroups={hiddenGroups}
              selectedId={selectedId}
              reducedMotion={reducedMotion}
              onSelectNode={(node) => setSelectedId(node.id)}
            />
            {nodes.length === 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1.5,
                  pointerEvents: 'none',
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No tasks match this view.
                </Typography>
                {timeWindow !== GalaxyTimeWindow.ALL && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setTimeWindow(GalaxyTimeWindow.ALL)}
                    sx={{ pointerEvents: 'auto' }}
                  >
                    Show all time
                  </Button>
                )}
              </Box>
            )}
            <GalaxyHud
              palette={palette}
              timeWindow={timeWindow}
              onTimeWindowChange={setTimeWindow}
              view={view}
              onViewChange={setView}
              scope={scope}
              onScopeChange={setScope}
              counts={counts}
              hiddenGroups={hiddenGroups}
              onToggleGroup={toggleGroup}
              taskCount={nodes.length}
              agentCount={agentCount}
              onResetView={() => sceneRef.current?.resetView()}
              nodes={nodes}
              selectedId={selectedId}
              onSelectNode={(node) => setSelectedId(node.id)}
            />
          </>
        )}
        <TaskDetailPanel node={selected} onClose={() => setSelectedId(null)} />
      </Box>
    </MainContainer>
  );
};
