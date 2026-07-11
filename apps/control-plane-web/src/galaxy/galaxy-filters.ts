import type { Session } from '@sagewright/shared';

// Mirrors the Sessions page's Active/Archived and Mine/All toggles, but as pure
// client-side lenses — /api/tasks/graph already returns every session.

/** Archived sessions are hidden by default, never gone — same principle as the
 *  time window. */
export type GalaxyView = 'active' | 'archived';

/** The galaxy defaults to the whole fleet (its job is the project-wide read);
 *  'mine' narrows to the sessions the current user started. */
export type GalaxyScope = 'mine' | 'all';

export const filterSessionsByView = (sessions: Session[], view: GalaxyView): Session[] =>
  sessions.filter((s) => (view === 'archived' ? s.archivedAt !== null : s.archivedAt === null));

export const filterSessionsByScope = (
  sessions: Session[],
  scope: GalaxyScope,
  displayName: string | null,
): Session[] => (scope === 'all' ? sessions : sessions.filter((s) => s.createdBy === displayName));
