import { EMPTY_WORKSPACES, workspacesSchema, type Workspaces, type WorkspacesResponse } from '@sagewright/shared';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { workspaces } from '../db/schema';

interface WorkspacesServiceDeps {
  db: Db;
}

/** Stores one workspaces blob (named tiling layouts + which is active) per user, keyed by
 *  `userId`. One row per user; reads fall back to an empty blob so the client never has to
 *  special-case "never saved". The tiling analogue of the canvas-layout service. */
export const createWorkspacesService = (deps: WorkspacesServiceDeps) => ({
  /** The user's saved workspaces with their last-changed time (null if never saved), or an
   *  empty blob. `updatedAt` lets the board detect an out-of-band rewrite (e.g. an agent's
   *  set_workspaces over MCP) and re-seed live. */
  get: async (userId: string): Promise<WorkspacesResponse> => {
    const [row] = await deps.db.select().from(workspaces).where(eq(workspaces.userId, userId)).limit(1);
    if (!row) return { ...EMPTY_WORKSPACES, updatedAt: null };
    return { ...workspacesSchema.parse(row.blob), updatedAt: row.updatedAt.toISOString() };
  },

  /** Validate and upsert the user's workspaces. Throws if the shape is invalid;
   *  the route surfaces that as a 400. */
  set: async (userId: string, blob: Workspaces): Promise<void> => {
    const valid = workspacesSchema.parse(blob);
    await deps.db
      .insert(workspaces)
      .values({ userId, blob: valid })
      .onConflictDoUpdate({ target: workspaces.userId, set: { blob: valid, updatedAt: new Date() } });
  },
});

export type WorkspacesService = ReturnType<typeof createWorkspacesService>;
