import { Box, CircularProgress } from '@mui/material';
import { type FC } from 'react';

import { useTasks, useWorkspaces } from '../api/hooks';
import { MainContainer } from '../components/MainContainer';
import { WorkspacesBoard } from './WorkspacesBoard';

/** Route entry for /workspaces: a tmux-style tiling area whose panes host live sessions, plus
 *  a right-hand list to switch/create/manage workspaces. Loads the per-user workspaces blob and
 *  the session list, then hands both to the stateful board. Mirrors CanvasPage. */
export const WorkspacesPage: FC = () => {
  const { data: workspaces, isLoading: workspacesLoading } = useWorkspaces();
  const { data: tasks, isLoading: tasksLoading } = useTasks(true);

  if (workspacesLoading || tasksLoading || !workspaces || !tasks) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <MainContainer flush>
      <WorkspacesBoard serverWorkspaces={workspaces} tasks={tasks} />
    </MainContainer>
  );
};
