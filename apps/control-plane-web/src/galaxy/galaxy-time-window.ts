import { isTerminalStatus, type Session } from '@sagewright/shared';

/** The galaxy's default read is "what's happening lately"; full history stays one
 *  click away behind the all-time option — hidden by default, never deleted. */
export enum GalaxyTimeWindow {
  DAYS_30 = '30d',
  DAYS_90 = '90d',
  ALL = 'all',
}

const DAY_MS = 86_400_000;

export const GALAXY_TIME_WINDOWS: readonly { value: GalaxyTimeWindow; label: string; days: number | null }[] = [
  { value: GalaxyTimeWindow.DAYS_30, label: '30 days', days: 30 },
  { value: GalaxyTimeWindow.DAYS_90, label: '90 days', days: 90 },
  { value: GalaxyTimeWindow.ALL, label: 'All time', days: null },
];

export const DEFAULT_GALAXY_TIME_WINDOW: GalaxyTimeWindow = GalaxyTimeWindow.DAYS_30;

/** A session counts as activity inside the window if it started there, finished
 *  there, or is still alive — a non-terminal session is "now" whatever its age. */
export const filterSessionsByWindow = (
  sessions: Session[],
  window: GalaxyTimeWindow,
  nowMs: number,
): Session[] => {
  const days = GALAXY_TIME_WINDOWS.find((w) => w.value === window)?.days ?? null;
  if (days === null) return sessions;
  const cutoff = nowMs - days * DAY_MS;
  return sessions.filter(
    (s) =>
      !isTerminalStatus(s.status) ||
      Date.parse(s.createdAt) >= cutoff ||
      (s.endedAt !== null && Date.parse(s.endedAt) >= cutoff),
  );
};
