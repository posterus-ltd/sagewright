import {
  Box,
  Button,
  Chip,
  IconButton,
  Link as MuiLink,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import { useEffect, useState, type FC } from 'react';

import { useStopTask, useTask } from '../api/hooks';
import { ButtonType, useConfirmation } from '../components/ConfirmDialogProvider';
import { StatusChip } from '../components/StatusChip';
import { Terminal } from './Terminal';
import { TranscriptTerminal } from './TranscriptTerminal';
import { useTaskStream } from './useTaskStream';
import { Stop } from '@mui/icons-material';

type TabValue = 'transcript' | 'agent' | 'shell' | 'log';

const TERMINAL_DEAD_STATUSES = ['done', 'failed', 'stopped'];

/**
 * The interactive view of a single session: agent/shell terminals, the event
 * log, and (on the detail route) a stop control — shown only while the session
 * is still stoppable, not once it has finished/failed/stopped. Shared by the
 * dedicated task detail route and by each session widget on the canvas.
 *
 * `compact` strips the header to a single live/done/failed indicator and hides
 * the stop control — a widget only hosts active sessions, so the full status
 * badge and stop button belong on the detail route. `onStopped` lets that
 * route navigate away once the stop succeeds (stopping only flips status,
 * not `archivedAt`, so nothing dismisses the view on its own).
 */
export const SessionPanel: FC<{
  taskId: string;
  compact?: boolean;
  onStopped?: () => void;
}> = ({ taskId, compact = false, onStopped }) => {
  const { data: task } = useTask(taskId);
  const { events } = useTaskStream(taskId);
  const stopTask = useStopTask();
  const { confirm } = useConfirmation();
  const [tab, setTab] = useState<TabValue>('agent');

  // Stopping kills the running container and can't be undone, so gate it behind a confirmation.
  const confirmStop = (): void =>
    confirm({
      title: 'Stop this session?',
      content: 'Stopping ends the running container. This cannot be undone.',
      buttons: [
        { label: 'Cancel' },
        {
          label: 'Stop',
          type: ButtonType.DANGER,
          onClick: () => stopTask.mutate(taskId, { onSuccess: () => onStopped?.() }),
        },
      ],
    });

  // Fullscreen lifts the panel into a fixed full-viewport overlay so the terminal
  // gets the whole screen; it's a detail-route affordance only (widgets are sized by
  // the canvas, not the user). Escape exits, matching the browser fullscreen idiom.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const live =
    !!task?.containerId && !TERMINAL_DEAD_STATUSES.includes(task.status);

  // Headless runs are driven by the control plane and stream their PTY as the
  // transcript; interactive sessions are driven by the human over Agent/Shell PTYs.
  const headless = task?.mode === 'headless';
  const tabValues: TabValue[] = headless
    ? ['transcript', 'shell', 'log']
    : ['agent', 'shell', 'log'];
  // Once a session has stopped its container is gone, so the agent/shell PTYs can't be
  // opened — those tabs are disabled. Keep them out of the selectable set so the active
  // view falls back to the log (the one tab that's always readable) rather than landing
  // on a disabled tab showing an "unavailable" note.
  const dead = task != null && TERMINAL_DEAD_STATUSES.includes(task.status);
  const selectable: TabValue[] = dead
    ? tabValues.filter((t) => t === 'log' || t === 'transcript')
    : tabValues;
  const current: TabValue = selectable.includes(tab)
    ? tab
    : dead
      ? 'log'
      : tabValues[0];

  // Widgets only ever host active sessions, so a status chip is only worth a glance
  // once one reaches a terminal outcome — done or failed. While live, no chip.
  const compactStatus =
    task?.status === 'done'
      ? { label: 'done', color: 'success' as const }
      : task?.status === 'failed' || task?.status === 'stopped'
        ? { label: 'failed', color: 'error' as const }
        : null;

  // In compact widgets the header carries only the terminal-status chip and PR link, so a
  // live session with no PR has an empty header — skip it entirely so the outer Stack's gap
  // doesn't reserve dead space above the tabs.
  const showHeader = compact
    ? compactStatus != null || task?.prUrl != null
    : true;

  return (
    <Stack
      spacing={2}
      sx={{
        height: '100%',
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        ...(fullscreen && {
          position: 'fixed',
          inset: 0,
          zIndex: (theme) => theme.zIndex.modal,
          bgcolor: 'background.default',
          p: 2,
        }),
      }}
    >
      {showHeader && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {compact ? (
            compactStatus && (
              <Chip
                label={compactStatus.label}
                color={compactStatus.color}
                size="small"
              />
            )
          ) : task ? (
            <StatusChip status={task.status} />
          ) : null}
          {task?.prUrl ? (
            <MuiLink href={task.prUrl} target="_blank">
              PR
            </MuiLink>
          ) : null}
          {!compact &&
            task != null &&
            !TERMINAL_DEAD_STATUSES.includes(task.status) && (
              <Button
                size="small"
                color="error"
                onClick={confirmStop}
                startIcon={<Stop fontSize="small" />}
              >
                Stop
              </Button>
          )}
          {!compact && (
            <Button
              size="small"
              color="secondary"
              aria-label="Fullscreen"
              onClick={() => setFullscreen((prev) => !prev)}
              sx={{ ml: 'auto' }}
              startIcon={
                fullscreen ? (
                  <FullscreenExitRounded fontSize="small" />
                ) : (
                  <FullscreenRounded fontSize="small" />
                )
              }
            >
              Fullscreen
            </Button>
          )}
        </Stack>
      )}

      <Tabs value={current} onChange={(_, v: TabValue) => setTab(v)}>
        {headless && <Tab value="transcript" label="Transcript" />}
        {!headless && <Tab value="agent" label="Agent" disabled={!live} />}
        <Tab value="shell" label="Shell" disabled={!live} />
        <Tab value="log" label="Log" />
      </Tabs>

      {current === 'transcript' && (
        <TranscriptTerminal key={`${taskId}-transcript`} events={events} />
      )}

      {current === 'agent' &&
        (live ? (
          <Terminal key={`${taskId}-agent`} taskId={taskId} kind="agent" />
        ) : (
          <Typography color="text.secondary">
            No running container — the agent terminal is unavailable.
          </Typography>
        ))}

      {current === 'shell' &&
        (live ? (
          <Terminal key={`${taskId}-shell`} taskId={taskId} kind="shell" />
        ) : (
          <Typography color="text.secondary">
            No running container — the shell is unavailable.
          </Typography>
        ))}

      {current === 'log' && (
        <Box
          sx={{
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            maxHeight: '60vh',
            overflow: 'auto',
          }}
        >
          {events.map((e) => (
            <div key={e.seq}>
              [{e.type}] {JSON.stringify(e.payload)}
            </div>
          ))}
        </Box>
      )}
    </Stack>
  );
};
