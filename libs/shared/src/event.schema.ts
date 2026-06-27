import { z } from 'zod';

import { EventType } from './enums';

export const streamEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  type: z.nativeEnum(EventType),
  payload: z.record(z.unknown()),
  createdAt: z.string(),
});
export type StreamEvent = z.infer<typeof streamEventSchema>;

export const ingestEventSchema = z.object({
  type: z.nativeEnum(EventType),
  payload: z.record(z.unknown()),
});
export type IngestEvent = z.infer<typeof ingestEventSchema>;
