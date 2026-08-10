import { z } from 'zod';

/** Where a single session widget sits on the canvas. `width`/`height` are
 *  present once the user resizes a node; absent nodes fall back to a default. */
export const sessionPlacementSchema = z.object({
  sessionId: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  /** Custom widget border color (hex). Absent → theme default (`divider`). */
  borderColor: z.string().optional(),
});
export type SessionPlacement = z.infer<typeof sessionPlacementSchema>;

/** Pan/zoom of the canvas, so a reload restores the same framing. */
export const canvasViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});
export type CanvasViewport = z.infer<typeof canvasViewportSchema>;

/** A user's whole canvas: which sessions are placed, where, and the framing.
 *  Persisted as one JSON blob per user (mirrors the user-env pattern). */
export const canvasLayoutSchema = z.object({
  placements: z.array(sessionPlacementSchema),
  viewport: canvasViewportSchema,
});
export type CanvasLayout = z.infer<typeof canvasLayoutSchema>;

/** Served when a user has never arranged their canvas. */
export const EMPTY_CANVAS_LAYOUT: CanvasLayout = {
  placements: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

/** The GET response: the layout plus when it last changed. `updatedAt` lets the canvas
 *  detect an out-of-band rewrite (e.g. an agent arranging it over MCP) and re-seed live,
 *  without it being part of the PUT contract (clients save bare `CanvasLayout`). */
export const canvasLayoutResponseSchema = canvasLayoutSchema.extend({
  updatedAt: z.string().nullable(),
});
export type CanvasLayoutResponse = z.infer<typeof canvasLayoutResponseSchema>;
