import { Box, CircularProgress, Typography } from '@mui/material';
import { useMemo, useState, type FC } from 'react';

import { useTaskGraph } from '../api/hooks';
import { MainContainer } from '../components/MainContainer';
import { useThemeMode } from '../theme/ThemeModeProvider';
import { palettes } from '../theme/tokens';
import { buildGalaxyGraph, type StarNode } from './galaxy-graph-data';
import { GalaxyScene } from './GalaxyScene';
import { TaskDetailPanel } from './TaskDetailPanel';

export const GalaxyPage: FC = () => {
  const { data: sessions, isLoading } = useTaskGraph();
  const { resolvedMode } = useThemeMode();
  const palette = palettes[resolvedMode];
  const [selected, setSelected] = useState<StarNode | null>(null);

  const { nodes, links } = useMemo(() => buildGalaxyGraph(sessions ?? []), [sessions]);

  if (isLoading || !sessions) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <MainContainer flush>
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        {nodes.length === 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" color="text.secondary">
              No tasks yet — the galaxy fills in as agents get to work.
            </Typography>
          </Box>
        ) : (
          <GalaxyScene nodes={nodes} links={links} palette={palette} onSelectNode={setSelected} />
        )}
        <TaskDetailPanel node={selected} onClose={() => setSelected(null)} />
      </Box>
    </MainContainer>
  );
};
