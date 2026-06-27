import type { StreamEvent } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app';

export const formatSseFrame = (e: StreamEvent): string =>
  `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`;

export const streamTaskEvents = async (params: {
  iterator: AsyncIterator<StreamEvent>;
  readSince: (afterSeq: number) => Promise<StreamEvent[]>;
  lastEventId: number;
  write: (frame: string) => void;
}): Promise<void> => {
  const { iterator, readSince, write } = params;
  let lastSeq = params.lastEventId;

  // Replay stored events first (iterator already registered and buffering)
  const replay = await readSince(lastSeq);
  for (const e of replay) {
    write(formatSseFrame(e));
    lastSeq = e.seq;
  }

  // Tail live events with dedupe by seq
  for (;;) {
    const { value, done } = await iterator.next();
    if (done) break;
    if (value.seq <= lastSeq) continue;
    write(formatSseFrame(value));
    lastSeq = value.seq;
  }
};

export const registerStreamRoute = (app: FastifyInstance, deps: AppDeps): void => {
  app.get('/api/tasks/:id/stream', { preHandler: app.requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rawLastEventId =
      (req.headers['last-event-id'] as string | undefined) ??
      (req.query as { lastEventId?: string }).lastEventId ??
      '0';
    const lastEventId = Number.isFinite(Number(rawLastEventId)) ? Number(rawLastEventId) : 0;

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    // Subscribe FIRST to start buffering live events before replay
    const iterator = deps.eventBus.subscribe(id)[Symbol.asyncIterator]();

    // Release subscriber immediately on disconnect
    req.raw.on('close', () => {
      void iterator.return?.();
    });

    await streamTaskEvents({
      iterator,
      readSince: (s) => deps.eventStore.readSince(id, s),
      lastEventId,
      write: (f) => reply.raw.write(f),
    });

    reply.raw.end();
  });
};
