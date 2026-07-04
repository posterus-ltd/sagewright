import { Box, Link as MuiLink, Stack, Typography } from '@mui/material';
import { SessionStatus, sessionLabel, type Session } from '@sagewright/shared';
import { DateTime } from 'luxon';
import { useMemo, type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { useTasks, useWorkers } from '../api/hooks';
import { Header } from '../components/Header';
import { MainContainer } from '../components/MainContainer';
import { StatusChip } from '../components/StatusChip';
import { WorkerChip } from '../components/WorkerChip';
import {
  METRICS_WINDOW_DAYS,
  recentlyShipped,
  throughputStats,
  workerUtilization,
} from './metrics';
import {
  groupCounts,
  STATUS_GROUP_COLOR,
  STATUS_GROUP_LABEL,
} from './status-groups';

// Sessions whose status needs a human to look at them right now.
const NEEDS_ATTENTION_STATUSES = new Set<SessionStatus>([
  SessionStatus.NEEDS_ASSISTANCE,
  SessionStatus.FAILED,
]);

const RECENTLY_SHIPPED_LIMIT = 5;

interface StatTileProps {
  label: string;
  count: number | string;
  color: 'success' | 'error' | 'warning' | 'info' | 'default';
}

const StatTile: FC<StatTileProps> = ({ label, count, color }) => (
  <Box
    sx={{
      flex: '1 1 140px',
      minWidth: 140,
      p: 2,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1.5,
      borderLeft: '3px solid',
      borderLeftColor: color === 'default' ? 'divider' : `${color}.main`,
    }}
  >
    <Typography variant="h4" sx={{ fontWeight: 600 }}>
      {count}
    </Typography>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
  </Box>
);

const AttentionRow: FC<{ session: Session; onClick: () => void }> = ({
  session,
  onClick,
}) => (
  <Stack
    direction="row"
    spacing={1.5}
    onClick={onClick}
    sx={{
      alignItems: 'center',
      p: 1.5,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1.5,
      cursor: 'pointer',
      '&:hover': { bgcolor: 'action.hover' },
    }}
  >
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography noWrap sx={{ fontWeight: 500 }}>
        {sessionLabel(session, 80)}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {session.createdBy}
      </Typography>
    </Box>
    <WorkerChip image={session.workerImage} />
    <StatusChip status={session.status} />
  </Stack>
);

const ShippedRow: FC<{ session: Session; onClick: () => void }> = ({
  session,
  onClick,
}) => (
  <Stack
    direction="row"
    spacing={1.5}
    sx={{
      alignItems: 'center',
      p: 1.5,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1.5,
    }}
  >
    <Box
      onClick={onClick}
      sx={{
        flex: 1,
        minWidth: 0,
        cursor: 'pointer',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      <Typography noWrap sx={{ fontWeight: 500 }}>
        {sessionLabel(session, 80)}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {session.createdBy}
      </Typography>
    </Box>
    <WorkerChip image={session.workerImage} />
    {session.prUrl && (
      <MuiLink href={session.prUrl} target="_blank" rel="noreferrer">
        View PR
      </MuiLink>
    )}
  </Stack>
);

// Inline count chips shared by the worker-utilization and busiest-teammates
// sections — same "label · count" bordered pill in both places.
const CountChips: FC<{ items: { label: string; count: number }[] }> = ({
  items,
}) => (
  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
    {items.map(({ label, count }) => (
      <Box
        key={label}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
        }}
      >
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {count}
        </Typography>
      </Box>
    ))}
  </Stack>
);

const Section: FC<{
  title: string;
  empty: boolean;
  emptyMessage: string;
  children: ReactNode;
}> = ({ title, empty, emptyMessage, children }) => (
  <Stack spacing={1.5}>
    <Typography variant="h6">{title}</Typography>
    {empty ? (
      <Typography variant="body2" color="text.secondary">
        {emptyMessage}
      </Typography>
    ) : (
      children
    )}
  </Stack>
);

export const OverviewPage: FC = () => {
  // No `mine` filter — this page is a fleet-wide view across every user.
  const { data: sessions = [] } = useTasks(false);
  const { data: workersData } = useWorkers();
  const navigate = useNavigate();
  const now = DateTime.now();

  // Archived sessions are SessionsListPage's job; the "right now" sections
  // below stay focused on what's currently active across the team.
  const active = useMemo(
    () => sessions.filter((s) => s.archivedAt === null),
    [sessions],
  );

  const counts = useMemo(() => groupCounts(active), [active]);

  const needsAttention = useMemo(
    () => active.filter((s) => NEEDS_ATTENTION_STATUSES.has(s.status)),
    [active],
  );

  // The sections below cover recent *history*, not current state, so they
  // read from every session — archiving hides a finished session from the
  // personal list, it doesn't erase what it did.
  const throughput = useMemo(
    () => throughputStats(sessions, METRICS_WINDOW_DAYS, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions],
  );

  const shipped = useMemo(
    () => recentlyShipped(sessions, RECENTLY_SHIPPED_LIMIT),
    [sessions],
  );

  const workerName = (image: string): string =>
    workersData?.workers.find((w) => w.image === image)?.name ?? image;

  const workerTally = useMemo(
    () =>
      workerUtilization(sessions, METRICS_WINDOW_DAYS, now).map(
        ({ key, count }) => ({
          label: workerName(key),
          count,
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, workersData],
  );

  return (
    <MainContainer>
      <Stack spacing={3}>
        <Header
          title="Overview"
          subtitle="Every agent active across the team right now"
        />

        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {counts.map(({ group, count }) => (
            <StatTile
              key={group}
              label={STATUS_GROUP_LABEL[group]}
              count={count}
              color={STATUS_GROUP_COLOR[group]}
            />
          ))}
        </Stack>

        <Section
          title="Needs attention"
          empty={needsAttention.length === 0}
          emptyMessage="Nothing needs attention right now."
        >
          <Stack spacing={1}>
            {needsAttention.map((s) => (
              <AttentionRow
                key={s.id}
                session={s}
                onClick={() => navigate(`/tasks/${s.id}`)}
              />
            ))}
          </Stack>
        </Section>

        <Section
          title={`This week (last ${METRICS_WINDOW_DAYS} days)`}
          empty={false}
          emptyMessage=""
        >
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <StatTile
              label="Completed"
              count={throughput.completed}
              color="success"
            />
            <StatTile label="Failed" count={throughput.failed} color="error" />
            <StatTile
              label="Success rate"
              count={
                throughput.successRatePct === null
                  ? '—'
                  : `${throughput.successRatePct}%`
              }
              color="info"
            />
          </Stack>
        </Section>

        <Section
          title="Recently shipped"
          empty={shipped.length === 0}
          emptyMessage="No PRs shipped yet."
        >
          <Stack spacing={1}>
            {shipped.map((s) => (
              <ShippedRow
                key={s.id}
                session={s}
                onClick={() => navigate(`/tasks/${s.id}`)}
              />
            ))}
          </Stack>
        </Section>

        <Section
          title="Worker utilization"
          empty={workerTally.length === 0}
          emptyMessage="No sessions in the last week."
        >
          <CountChips items={workerTally} />
        </Section>
      </Stack>
    </MainContainer>
  );
};
