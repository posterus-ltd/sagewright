import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import {
  parseTerminalSize,
  sessionDir,
  terminalResizeSchema,
  SessionKind,
  SHELL_TMUX_SESSION,
  TerminalKind,
  type Session,
  type TerminalSize,
} from '@sagewright/shared';

import type { AppDeps } from '../app';
import type { SessionRuntime } from '../sessions/session-runtime';
import type { TerminalSession } from '../tasks/docker-client';

/**
 * The command each terminal flavour runs inside the container's workspace.
 *
 * `agent` resumes the harness interactively. The resume command is harness-specific
 * (opencode vs claude vs codex), so — like `start-agent` — it lives in a stable
 * per-runner script (`continue-agent`) baked into each image, keeping the control
 * plane harness-agnostic.
 */
export const cmdForKind = (kind: TerminalKind): string[] =>
  kind === TerminalKind.AGENT ? ['continue-agent'] : ['bash'];

/**
 * The PTY command a non-agent terminal opens for a session. A `shell`-kind session (a
 * no-agent CLI widget) attaches to the persistent tmux its command already runs in
 * (`new-session -A` re-creates it running the command if the box was restarted), so every
 * viewer sees the one live process. Any other session's Shell tab gets a scratch `bash`.
 */
export const shellPtyCmd = (task: Pick<Session, 'kind' | 'command'>): string[] =>
  task.kind === SessionKind.SHELL && task.command
    ? ['tmux', 'new-session', '-A', '-s', SHELL_TMUX_SESSION, `exec ${task.command}`]
    : ['bash'];

export const KEEPALIVE_MS = 30_000;

/** Periodic protocol-level ping so idle proxies (traefik fronts this stack) don't
 *  cut a quiet terminal socket; browsers answer pongs automatically. Cleared when
 *  the socket closes. */
export const keepAlive = (socket: WebSocket, intervalMs = KEEPALIVE_MS): void => {
  const timer = setInterval(() => {
    if (socket.readyState === socket.OPEN) socket.ping();
    else clearInterval(timer);
  }, intervalMs);
  socket.on('close', () => clearInterval(timer));
};

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

/**
 * Wire a browser WebSocket to a session's PERSISTENT agent exec via the runtime.
 * Unlike `bridgeTerminal`, the socket does not own the exec:
 *   - attach only fans live PTY bytes to this socket; closing the socket detaches it
 *     but leaves the agent running (DETACHED), so reopening the tab resumes the view;
 *   - a binary keystroke when no turn is live resumes the session (continue-agent);
 *   - resize control frames re-size the live PTY.
 */
export const bridgeAgentTerminal = (
  socket: WebSocket,
  runtime: Pick<SessionRuntime, 'attach' | 'write' | 'resize' | 'isLive' | 'resume'>,
  sessionId: string,
  initialSize?: TerminalSize,
): void => {
  const detach = runtime.attach(sessionId, (chunk: Buffer) => {
    if (socket.readyState === socket.OPEN) socket.send(chunk);
  });
  if (initialSize) runtime.resize(sessionId, initialSize);

  socket.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      // First keystroke into a detached session starts the next turn before writing it.
      if (!runtime.isLive(sessionId)) {
        try {
          runtime.resume(sessionId);
        } catch {
          // Lost the race to another attacher that resumed first — just write.
        }
      }
      runtime.write(sessionId, data.toString());
      return;
    }
    const parsed = terminalResizeSchema.safeParse(safeJson(data.toString()));
    if (parsed.success) runtime.resize(sessionId, { cols: parsed.data.cols, rows: parsed.data.rows });
  });

  // Detach only — the agent exec survives the socket so the session stays resumable.
  socket.on('close', () => detach());
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
    const kind = z.enum(TerminalKind).safeParse(query.kind ?? TerminalKind.SHELL);
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
    // Owner-only: a session belongs to its creator. Check before opening any PTY/attach
    // so another authenticated user can't hijack a session by guessing its id.
    if (task.createdBy !== req.userId) {
      socket.close(4403, 'forbidden');
      return;
    }
    if (!task.containerId) {
      socket.close(4409, 'no container for task');
      return;
    }

    keepAlive(socket);

    // Agent terminal: attach to the persistent runtime exec — no per-attach continue-agent,
    // and the socket closing never tears the agent down.
    if (kind.data === TerminalKind.AGENT) {
      // The runtime registry is in-process only: a detached session that predates this
      // process (control-plane restart) has no entry, and attaching to a missing entry
      // silently no-ops. Rebuild it from persistent state before bridging.
      if (!deps.sessionRuntime.has(task.id)) {
        const hydrated = await deps.sessionService.hydrateSession(task.id);
        if (hydrated) deps.sessionRuntime.ensure(hydrated);
      }
      bridgeAgentTerminal(socket, deps.sessionRuntime, task.id, initialSize);
      return;
    }

    // Shell: for a shell widget, attach to the persistent tmux running its CLI; otherwise a
    // throwaway bash PTY bound to this socket (closing it tears the bash down).
    let session: TerminalSession;
    try {
      session = await deps.containerTerminal.exec(task.containerId, {
        cmd: shellPtyCmd(task),
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
