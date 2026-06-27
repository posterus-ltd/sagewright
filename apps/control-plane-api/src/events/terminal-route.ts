import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  parseTerminalSize,
  sessionDir,
  terminalKindSchema,
  terminalResizeSchema,
  type TerminalKind,
} from '@sagewright/shared';

import type { AppDeps } from '../app';
import type { TerminalSession } from '../tasks/docker-client';

/**
 * The command each terminal flavour runs inside the container's workspace.
 *
 * `agent` resumes the harness interactively. The resume command is harness-specific
 * (opencode vs claude vs codex), so — like `start-agent` — it lives in a stable
 * per-worker script (`continue-agent`) baked into each image, keeping the control
 * plane harness-agnostic.
 */
export const cmdForKind = (kind: TerminalKind): string[] =>
  kind === 'agent' ? ['continue-agent'] : ['bash'];

/**
 * Wire a browser WebSocket to a container PTY session.
 *   - client → server: binary frames are keystrokes (written to the PTY);
 *     text frames are JSON control messages ({type:'resize',cols,rows}).
 *   - server → client: raw PTY bytes are forwarded as binary frames.
 */
export const bridgeTerminal = (socket: WebSocket, session: TerminalSession): void => {
  const { stream, resize, close } = session;

  stream.on('data', (chunk: Buffer) => {
    if (socket.readyState === socket.OPEN) socket.send(chunk);
  });
  stream.on('end', () => socket.close());
  stream.on('error', () => socket.close(4500, 'stream error'));

  socket.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      stream.write(data);
      return;
    }
    const parsed = terminalResizeSchema.safeParse(safeJson(data.toString()));
    if (parsed.success) void resize({ cols: parsed.data.cols, rows: parsed.data.rows });
  });

  socket.on('close', () => close());
};

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export const registerTerminalRoute = (app: FastifyInstance, deps: AppDeps): void => {
  app.get('/api/tasks/:id/terminal', { websocket: true, preHandler: app.requireUser }, async (socket, req) => {
    const { id } = req.params as { id: string };
    const query = req.query as { kind?: string; cols?: string; rows?: string };
    const kind = terminalKindSchema.safeParse(query.kind ?? 'shell');
    if (!kind.success) {
      socket.close(1008, 'invalid kind');
      return;
    }
    const initialSize = parseTerminalSize(query);

    const task = await deps.taskService.get(id);
    if (!task) {
      socket.close(4404, 'task not found');
      return;
    }
    if (!task.containerId) {
      socket.close(4409, 'no container for task');
      return;
    }

    let session: TerminalSession;
    try {
      session = await deps.containerTerminal.exec(task.containerId, {
        cmd: cmdForKind(kind.data),
        workingDir: sessionDir(task.id),
        env: ['TERM=xterm-256color'],
        initialSize,
      });
    } catch {
      socket.close(4500, 'failed to open terminal');
      return;
    }

    bridgeTerminal(socket, session);
  });
};
