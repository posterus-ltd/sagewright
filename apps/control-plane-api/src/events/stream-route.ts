import type { StreamEvent } from '@sagewright/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app';

export const formatSseFrame = (e: StreamEvent): string =>
  `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`;

export const streamTaskEvents = async (params: {
  iterator: AsyncIterator<StreamEvent>;
  // Streamed row-by-row (a server-side cursor in prod) so a large transcript is never
  // buffered whole. Registered before the live iterator so no live event is missed.
  replay: AsyncIterator<StreamEvent>;
  lastEventId: number;
  // May return a promise the caller awaits to honour write backpressure (drain).
  write: (frame: string) => void | Promise<void>;
}): Promise<void> => {
  const { iterator, replay, write } = params;
  let lastSeq = params.lastEventId;

  // Replay stored events first, one at a time (iterator already registered and buffering).
  for (;;) {
    const { value, done } = await replay.next();
    if (done) break;
    await write(formatSseFrame(value));
    lastSeq = value.seq;
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

    // Subscribe FIRST to start buffering live events before replay. The replay cursor
    // streams the stored tail row-by-row (bounded heap) and holds a pooled DB client for
    // its lifetime — so it MUST be released on disconnect (below), or a client leaks.
    const iterator = deps.eventBus.subscribe(id)[Symbol.asyncIterator]();
    const replay = deps.eventStore.streamSince(id, lastEventId)[Symbol.asyncIterator]();

    let closed = false;

    // Periodic SSE comment so idle connections (and intermediary proxies) stay open.
    const heartbeat = setInterval(() => {
      reply.raw.write(': hb\n\n');
    }, 15000);

    // Release subscriber + replay cursor and stop the heartbeat immediately on disconnect.
    // Returning the replay iterator aborts its for-await, which destroys the cursor and
    // frees its pooled client; `closed` also unblocks a write parked on 'drain'.
    req.raw.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
      void replay.return?.();
      void iterator.return?.();
    });

    // Honour write backpressure: when the socket buffer is full, await 'drain' so a
    // slow client throttles us rather than ballooning Node's outgoing buffer. Resolve on
    // disconnect too, so a client that vanishes mid-replay never wedges the loop (which
    // would leave the cursor's DB client checked out).
    const write = (frame: string): void | Promise<void> => {
      if (closed) return;
      if (reply.raw.write(frame)) return;
      return new Promise<void>((resolve) => {
        const settle = (): void => {
          reply.raw.off('drain', settle);
          req.raw.off('close', settle);
          resolve();
        };
        reply.raw.once('drain', settle);
        req.raw.once('close', settle);
      });
    };

    await streamTaskEvents({ iterator, replay, lastEventId, write });

    clearInterval(heartbeat);
    if (!closed) reply.raw.end();
  });
};
