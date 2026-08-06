import type { StreamEvent } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app';

export const formatSseFrame = (e: StreamEvent): string =>
  `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`;

export const streamTaskEvents = async (params: {
  iterator: AsyncIterator<StreamEvent>;
  readSince: (afterSeq: number) => Promise<StreamEvent[]>;
  lastEventId: number;
  // May return a promise the caller awaits to honour write backpressure (drain).
  write: (frame: string) => void | Promise<void>;
}): Promise<void> => {
  const { iterator, readSince, write } = params;
  let lastSeq = params.lastEventId;

  // Replay stored events first (iterator already registered and buffering)
  const replay = await readSince(lastSeq);
  for (const e of replay) {
    await write(formatSseFrame(e));
    lastSeq = e.seq;
  }

  // Tail live events with dedupe by seq
  for (;;) {
    const { value, done } = await iterator.next();
    if (done) break;
    if (value.seq <= lastSeq) continue;
    await write(formatSseFrame(value));
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

    // Owner-only: don't open a live event stream for a session the requester doesn't own.
    const session = await deps.taskService.get(id);
    if (!session || session.createdBy !== req.userId) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    // Subscribe FIRST to start buffering live events before replay
    const iterator = deps.eventBus.subscribe(id)[Symbol.asyncIterator]();

    // Periodic SSE comment so idle connections (and intermediary proxies) stay open.
    const heartbeat = setInterval(() => {
      reply.raw.write(': hb\n\n');
    }, 15000);

    // Release subscriber + stop the heartbeat immediately on disconnect.
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      void iterator.return?.();
    });

    // Honour write backpressure: when the socket buffer is full, await 'drain' so a
    // slow client throttles us rather than ballooning Node's outgoing buffer.
    const write = (frame: string): void | Promise<void> => {
      if (reply.raw.write(frame)) return;
      return new Promise<void>((resolve) => reply.raw.once('drain', resolve));
    };

    await streamTaskEvents({
      iterator,
      readSince: (s) => deps.eventStore.readSince(id, s),
      lastEventId,
      write,
    });

    clearInterval(heartbeat);
    reply.raw.end();
  });
};
