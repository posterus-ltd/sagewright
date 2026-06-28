import { Breadcrumbs, Link as MuiLink, Stack, Typography } from '@mui/material';
import { taskLabel } from '@sagewright/shared';
import { type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useTask } from '../api/hooks';
import { MainContainer } from '../components/MainContainer';
import { SessionPanel } from './SessionPanel';

export const TaskDetailPage: FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: task } = useTask(id);
  // Stopping leaves a dead session on screen; return to the sessions list.
  return (
    <MainContainer fill>
      <Stack spacing={2} sx={{ height: '100%', minHeight: 0 }}>
        <Breadcrumbs aria-label="breadcrumb">
          <MuiLink component={Link} to="/" underline="hover" color="inherit">
            Sessions
          </MuiLink>
          <Typography color="text.primary">{task ? taskLabel(task) : '…'}</Typography>
        </Breadcrumbs>
        <SessionPanel taskId={id} onStopped={() => navigate('/')} />
      </Stack>
    </MainContainer>
  );
};
