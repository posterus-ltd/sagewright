import { SessionStatus, type Session } from '@sagewright/shared';
import { DateTime } from 'luxon';

// The trailing window "this week" figures cover. A plain constant rather than
// a user setting — revisit if a toggle turns out to be worth the complexity.
export const METRICS_WINDOW_DAYS = 7;

const TERMINAL_OUTCOME_STATUSES = new Set<SessionStatus>([
  SessionStatus.DONE,
  SessionStatus.FAILED,
  SessionStatus.STOPPED,
  SessionStatus.MAX_ITERATIONS,
]);

// endedAt is set on every terminal transition we've seen, but fall back to
// updatedAt for any path that doesn't (or for events emitted before it did).
const endTime = (session: Session): string | null =>
  session.endedAt ?? session.updatedAt;

const within = (iso: string | null, since: DateTime): boolean =>
  iso !== null && DateTime.fromISO(iso) >= since;

export interface ThroughputStats {
  completed: number;
  failed: number;
  // null when nothing finished in the window — a rate would be meaningless.
  successRatePct: number | null;
}

/** Completion throughput over the trailing window. Considers every session
 *  regardless of archive state — archiving only hides a finished session
 *  from the personal list, it doesn't erase its history. */
export const throughputStats = (
  sessions: Session[],
  days: number,
  now: DateTime,
): ThroughputStats => {
  const since = now.minus({ days });
  const terminal = sessions.filter(
    (s) => TERMINAL_OUTCOME_STATUSES.has(s.status) && within(endTime(s), since),
  );
  const completed = terminal.filter(
    (s) => s.status === SessionStatus.DONE,
  ).length;
  const failed = terminal.length - completed;
  return {
    completed,
    failed,
    successRatePct:
      terminal.length === 0
        ? null
        : Math.round((completed / terminal.length) * 100),
  };
};

export interface Tally {
  key: string;
  count: number;
}

/** Session counts per runner image over the trailing window, busiest first. */
export const runnerUtilization = (
  sessions: Session[],
  days: number,
  now: DateTime,
): Tally[] => tally(sessions, days, now, (s) => s.runnerImage);

const tally = (
  sessions: Session[],
  days: number,
  now: DateTime,
  keyOf: (s: Session) => string | null,
): Tally[] => {
  const since = now.minus({ days });
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (!within(s.createdAt, since)) continue;
    const key = keyOf(s);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
};

/** Sessions with a shipped PR, most recently finished first. */
export const recentlyShipped = (
  sessions: Session[],
  limit: number,
): Session[] =>
  sessions
    .filter((s) => s.prUrl !== null)
    .sort((a, b) => (endTime(b) ?? '').localeCompare(endTime(a) ?? ''))
    .slice(0, limit);
