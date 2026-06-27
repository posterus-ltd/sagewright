import { z } from 'zod';

export const inboundMessageSchema = z.object({ id: z.string(), body: z.string().min(1) });
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const postMessageSchema = z.object({ body: z.string().min(1) });
export type PostMessageInput = z.infer<typeof postMessageSchema>;
