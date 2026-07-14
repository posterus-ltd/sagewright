import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  Link as MuiLink,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import { useEffect, useState, type FC } from 'react';

import { useStopTask, useTask } from '../api/hooks';
import {
  ButtonType,
  useConfirmation,
} from '../components/ConfirmDialogProvider';
import { StatusChip } from '../components/StatusChip';
import { Terminal } from './Terminal';
import { TranscriptTerminal } from './TranscriptTerminal';
import { useTaskStream } from './useTaskStream';
import { Stop } from '@mui/icons-material';
import { SessionMode, SessionStatus, TerminalKind, modeForKind } from '@sagewright/shared';

enum TabValue {
  TRANSCRIPT = 'transcript',
  AGENT = 'agent',
  SHELL = 'shell',
  LOG = 'log',
}

const TERMINAL_DEAD_STATUSES: readonly SessionStatus[] = [
  SessionStatus.DONE,
  SessionStatus.FAILED,
  SessionStatus.STOPPED,
];
const sessionViewButtonSx = {
  minHeight: 32,
  minWidth: 64,
  px: 1.25,
  fontSize: '0.8125rem',
  fontWeight: 600,
  letterSpacing: 0,
  lineHeight: 1,
  textTransform: 'none',
};

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
  const [tab, setTab] = useState<TabValue>(TabValue.AGENT);

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
          onClick: () =>
            stopTask.mutate(taskId, { onSuccess: () => onStopped?.() }),
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

  // Headless runs (scheduled tasks, workflow steps — anything but a canvas/sessions-page
  // session) are driven by the control plane and stream their PTY as the transcript;
  // only an interactive session is driven by the human over Agent/Shell PTYs.
  const headless = task != null && modeForKind(task.kind) === SessionMode.HEADLESS;
  const tabValues: TabValue[] = headless
    ? [TabValue.TRANSCRIPT, TabValue.SHELL, TabValue.LOG]
    : [TabValue.AGENT, TabValue.SHELL, TabValue.LOG];
  // Once a session has stopped its container is gone, so the agent/shell PTYs can't be
  // opened — those tabs are disabled. Keep them out of the selectable set so the active
  // view falls back to the log (the one tab that's always readable) rather than landing
  // on a disabled tab showing an "unavailable" note.
  const dead = task != null && TERMINAL_DEAD_STATUSES.includes(task.status);
  const selectable: TabValue[] = dead
    ? tabValues.filter((t) => t === TabValue.LOG || t === TabValue.TRANSCRIPT)
    : tabValues;
  const current: TabValue = selectable.includes(tab)
    ? tab
    : dead
      ? TabValue.LOG
      : tabValues[0];

  // Widgets only ever host active sessions, so a status chip is only worth a glance
  // once one reaches a terminal outcome — done or failed. While live, no chip.
  const compactStatus =
    task?.status === SessionStatus.DONE
      ? { label: 'done', color: 'success' as const }
      : task?.status === SessionStatus.FAILED || task?.status === SessionStatus.STOPPED
        ? { label: 'failed', color: 'error' as const }
        : null;

  const showHeader = true;

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
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
        >
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
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              ml: { xs: 0, sm: 'auto' },
              width: { xs: '100%', sm: 'auto' },
              justifyContent: { xs: 'space-between', sm: 'flex-end' },
            }}
          >
            <ButtonGroup
              size="small"
              color="secondary"
              aria-label="Session view"
              sx={{
                '& .MuiButtonGroup-grouped': {
                  ...sessionViewButtonSx,
                },
              }}
            >
              {headless ? (
                <Button
                  variant={current === TabValue.TRANSCRIPT ? 'contained' : 'outlined'}
                  aria-pressed={current === TabValue.TRANSCRIPT}
                  onClick={() => setTab(TabValue.TRANSCRIPT)}
                >
                  Transcript
                </Button>
              ) : (
                <Button
                  variant={current === TabValue.AGENT ? 'contained' : 'outlined'}
                  disabled={!live}
                  aria-pressed={current === TabValue.AGENT}
                  onClick={() => setTab(TabValue.AGENT)}
                >
                  Agent
                </Button>
              )}
              <Button
                variant={current === TabValue.SHELL ? 'contained' : 'outlined'}
                disabled={!live}
                aria-pressed={current === TabValue.SHELL}
                onClick={() => setTab(TabValue.SHELL)}
              >
                Shell
              </Button>
              <Button
                variant={current === TabValue.LOG ? 'contained' : 'outlined'}
                aria-pressed={current === TabValue.LOG}
                onClick={() => setTab(TabValue.LOG)}
              >
                Log
              </Button>
            </ButtonGroup>
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
            <Tooltip title="Fullscreen">
              <IconButton
                size="small"
                color="secondary"
                aria-label="Fullscreen"
                onClick={() => setFullscreen((prev) => !prev)}
              >
                {fullscreen ? (
                  <FullscreenExitRounded fontSize="small" />
                ) : (
                  <FullscreenRounded fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          )}
          </Box>
        </Stack>
      )}

      {current === TabValue.TRANSCRIPT && (
        <TranscriptTerminal key={`${taskId}-transcript`} events={events} />
      )}

      {current === TabValue.AGENT &&
        (live ? (
          <Terminal
            key={`${taskId}-agent`}
            taskId={taskId}
            kind={TerminalKind.AGENT}
            events={events}
          />
        ) : (
          <Typography color="text.secondary">
            No running container — the agent terminal is unavailable.
          </Typography>
        ))}

      {current === TabValue.SHELL &&
        (live ? (
          <Terminal
            key={`${taskId}-shell`}
            taskId={taskId}
            kind={TerminalKind.SHELL}
          />
        ) : (
          <Typography color="text.secondary">
            No running container — the shell is unavailable.
          </Typography>
        ))}

      {current === TabValue.LOG && (
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
