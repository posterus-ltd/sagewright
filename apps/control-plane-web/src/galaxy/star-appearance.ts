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
