import { SessionStatus } from '@sagewright/shared';

import type { Palette } from '../theme/tokens';

/** True while the agent is still actively working the task — drives the pulsing
 *  glow animation; terminal/detached states render steady instead. */
export const isActiveStatus = (status: SessionStatus): boolean =>
  status === SessionStatus.QUEUED ||
  status === SessionStatus.PROVISIONING ||
  status === SessionStatus.RUNNING ||
  status === SessionStatus.PUSHING;

/** Star color per status, resolved from the active theme palette (not
 *  hardcoded) so dark/light mode recolors the galaxy along with the rest of
 *  the app — mirrors SESSION_STATUS_COLOR in StatusChip.tsx, but as real hex
 *  since three.js materials need actual colors, not MUI palette keys. */
export const starColor = (status: SessionStatus, palette: Palette): string => {
  switch (status) {
    case SessionStatus.DONE:
      return palette.success;
    case SessionStatus.FAILED:
    case SessionStatus.STOPPED:
      return palette.error;
    case SessionStatus.NEEDS_ASSISTANCE:
    case SessionStatus.MAX_ITERATIONS:
      return palette.warning;
    case SessionStatus.DETACHED:
      return palette.muted;
    default: // QUEUED, PROVISIONING, RUNNING, PUSHING
      return palette.info;
  }
};

/** True for statuses that should visually pop against the settled field: work
 *  still in flight, or a task stalled waiting on a human. */
export const starEmphasis = (status: SessionStatus): boolean =>
  isActiveStatus(status) || status === SessionStatus.NEEDS_ASSISTANCE;

const HUB_STAR_SIZE = 3;
const STANDARD_STAR_SIZE = 1;

/** Relative star size: workflow hub nodes render larger, anchoring their steps. */
export const starSize = (isHub: boolean): number => (isHub ? HUB_STAR_SIZE : STANDARD_STAR_SIZE);

/** Brightness encodes recency: the field literally fades into the past. Settled
 *  stars dim from full at "just now" to the floor at the fade horizon; the floor
 *  keeps history legible rather than deleting it from view. */
export const MIN_STAR_OPACITY = 0.35;
const RECENCY_FADE_HORIZON_MS = 30 * 86_400_000;

interface StarRecency {
  status: SessionStatus;
  createdAt: string;
  endedAt: string | null;
}

export const starOpacity = ({ status, createdAt, endedAt }: StarRecency, nowMs: number): number => {
  if (starEmphasis(status)) return 1;
  // Age counts from when the work last happened, not when it was queued.
  const lastActivity = Date.parse(endedAt ?? createdAt);
  const age = Math.max(0, nowMs - lastActivity);
  const fade = Math.min(1, age / RECENCY_FADE_HORIZON_MS);
  return 1 - fade * (1 - MIN_STAR_OPACITY);
};

const ATTENTION_PULSE_PERIOD_MS = 1100;
const ACTIVE_PULSE_PERIOD_MS = 2600;

/** Breathing period for stars that should read as alive; null for settled stars.
 *  A task stalled on a human beats faster than one that's merely working. */
export const pulsePeriodMs = (status: SessionStatus): number | null => {
  if (status === SessionStatus.NEEDS_ASSISTANCE) return ATTENTION_PULSE_PERIOD_MS;
  if (isActiveStatus(status)) return ACTIVE_PULSE_PERIOD_MS;
  return null;
};
