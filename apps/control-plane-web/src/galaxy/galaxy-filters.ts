import type { Session } from '@sagewright/shared';

// Mirrors the Sessions page's Active/Archived and Mine/All toggles, but as pure
// client-side lenses — /api/tasks/graph already returns every session.

/** Archived sessions are hidden by default, never gone — same principle as the
 *  time window. */
export enum GalaxyView {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/** The galaxy defaults to the whole fleet (its job is the project-wide read);
 *  'mine' narrows to the sessions the current user started. */
export enum GalaxyScope {
  MINE = 'mine',
  ALL = 'all',
}

export const filterSessionsByView = (sessions: Session[], view: GalaxyView): Session[] =>
  sessions.filter((s) => (view === GalaxyView.ARCHIVED ? s.archivedAt !== null : s.archivedAt === null));

export const filterSessionsByScope = (
  sessions: Session[],
  scope: GalaxyScope,
  userId: string | null,
): Session[] => (scope === GalaxyScope.ALL ? sessions : sessions.filter((s) => s.createdBy === userId));
