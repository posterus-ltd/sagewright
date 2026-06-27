import {
  AddRounded,
  ChevronLeftRounded,
  ScheduleRounded,
  SearchRounded,
  TerminalRounded,
} from '@mui/icons-material';
import {
  Box,
  Dialog,
  InputBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import { taskLabel } from '@sagewright/shared';
import {
  useMemo,
  useState,
  type FC,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';

import { useCreateSession, useTasks, useWorkers } from '../../api/hooks';

type Mode = 'root' | 'sessions';

interface Item {
  id: string;
  label: string;
  icon: ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  onNewScheduledTask: () => void;
}

// The quick-actions palette. Mounted only while open (so the session query is
// idle otherwise). Two modes: a root list of actions, and a session picker that
// filters existing sessions by prompt text.
export const CommandPalette: FC<CommandPaletteProps> = ({
  onClose,
  onNewScheduledTask,
}) => {
  const navigate = useNavigate();
  const createSession = useCreateSession();
  const { data: tasks = [] } = useTasks(true);
  const { data: workerData } = useWorkers();
  const workers = workerData?.workers ?? [];
  const defaultImage = workerData?.defaultImage ?? null;
  const [mode, setMode] = useState<Mode>('root');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const startSession = async (workerImage?: string): Promise<void> => {
    const task = await createSession.mutateAsync(
      workerImage ? { workerImage } : {},
    );
    onClose();
    navigate(`/tasks/${task.id}`);
  };

  const enterSessions = (): void => {
    setMode('sessions');
    setQuery('');
    setActive(0);
  };

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    if (mode === 'sessions') {
      return tasks
        .filter((t) => t.archivedAt === null)
        .map((t) => ({ task: t, label: taskLabel(t, 80) }))
        .filter(({ label }) => label.toLowerCase().includes(q))
        .map(({ task, label }) => ({
          id: task.id,
          label,
          icon: <TerminalRounded fontSize="small" />,
          run: () => {
            onClose();
            navigate(`/tasks/${task.id}`);
          },
        }));
    }
    const actions: Item[] = [
      ...workers.map((w) => ({
        id: `new-session-${w.image}`,
        label: `New session (${w.name})`,
        icon: <AddRounded fontSize="small" />,
        run: () => startSession(w.image),
      })),
      {
        id: 'open-session',
        label: 'Open session…',
        icon: <SearchRounded fontSize="small" />,
        run: enterSessions,
      },
      {
        id: 'new-scheduled',
        label: 'New scheduled task',
        icon: <ScheduleRounded fontSize="small" />,
        run: onNewScheduledTask,
      },
    ];
    return actions.filter((a) => a.label.toLowerCase().includes(q));
    // startSession/enterSessions/onNewScheduledTask are stable enough for the
    // palette's lifetime; the list only needs to recompute on input changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, query, tasks, workers, defaultImage]);

  const highlighted = Math.min(active, Math.max(items.length - 1, 0));

  const goBack = (): void => {
    setMode('root');
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[highlighted]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (mode === 'sessions') goBack();
      else onClose();
    } else if (e.key === 'Backspace' && mode === 'sessions' && query === '') {
      goBack();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: { sx: { position: 'absolute', top: 80, m: 0, borderRadius: 2 } },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {mode === 'sessions' ? (
          <ChevronLeftRounded
            fontSize="small"
            onClick={goBack}
            sx={{ color: 'text.secondary', cursor: 'pointer' }}
            aria-label="Back to actions"
          />
        ) : (
          <SearchRounded fontSize="small" sx={{ color: 'text.secondary' }} />
        )}
        <InputBase
          autoFocus
          fullWidth
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={
            mode === 'sessions' ? 'Search sessions…' : 'Type a command…'
          }
          inputProps={{
            'aria-label':
              mode === 'sessions' ? 'Search sessions' : 'Type a command',
          }}
          sx={{ fontSize: 15 }}
        />
      </Box>
      <List sx={{ py: 0.5, maxHeight: 360, overflow: 'auto' }}>
        {items.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 2, py: 1.5 }}
          >
            {mode === 'sessions'
              ? 'No matching sessions.'
              : 'No matching commands.'}
          </Typography>
        ) : (
          items.map((item, i) => (
            <ListItemButton
              key={item.id}
              selected={i === highlighted}
              onMouseMove={() => setActive(i)}
              onClick={item.run}
              sx={{ px: 2, py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                slotProps={{ primary: { noWrap: true, sx: { fontSize: 14 } } }}
              />
            </ListItemButton>
          ))
        )}
      </List>
    </Dialog>
  );
};
