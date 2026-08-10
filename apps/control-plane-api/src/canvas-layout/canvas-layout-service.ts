import { canvasLayoutSchema, EMPTY_CANVAS_LAYOUT, type CanvasLayout, type CanvasLayoutResponse } from '@sagewright/shared';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { canvasLayouts } from '../db/schema';

interface CanvasLayoutServiceDeps {
  db: Db;
}

/** Stores one canvas layout (session placements + viewport) per user, keyed by
 *  `userId`. One row per user; reads fall back
 *  to an empty layout so the client never has to special-case "never saved". */
export const createCanvasLayoutService = (deps: CanvasLayoutServiceDeps) => ({
  /** The user's saved layout with its last-changed time (null if never saved), or an empty
   *  layout. `updatedAt` lets the canvas detect an out-of-band rewrite (e.g. an agent
   *  arranging it over MCP) and re-seed live. */
  get: async (userId: string): Promise<CanvasLayoutResponse> => {
    const [row] = await deps.db.select().from(canvasLayouts).where(eq(canvasLayouts.userId, userId)).limit(1);
    if (!row) return { ...EMPTY_CANVAS_LAYOUT, updatedAt: null };
    return { ...canvasLayoutSchema.parse(row.layout), updatedAt: row.updatedAt.toISOString() };
  },

  /** Validate and upsert the user's layout. Throws if the shape is invalid;
   *  the route surfaces that as a 400. */
  set: async (userId: string, layout: CanvasLayout): Promise<void> => {
    const valid = canvasLayoutSchema.parse(layout);
    await deps.db
      .insert(canvasLayouts)
      .values({ userId, layout: valid })
      .onConflictDoUpdate({ target: canvasLayouts.userId, set: { layout: valid, updatedAt: new Date() } });
  },
});

export type CanvasLayoutService = ReturnType<typeof createCanvasLayoutService>;
