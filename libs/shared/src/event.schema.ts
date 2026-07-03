import { z } from 'zod';

import { EventType } from './enums';

export const streamEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  type: z.enum(EventType),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type StreamEvent = z.infer<typeof streamEventSchema>;

export const ingestEventSchema = z.object({
  type: z.enum(EventType),
  payload: z.record(z.string(), z.unknown()),
});
export type IngestEvent = z.infer<typeof ingestEventSchema>;
