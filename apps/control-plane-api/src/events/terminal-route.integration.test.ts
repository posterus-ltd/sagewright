import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { WebSocket } from 'ws';

import { SessionStatus } from '@sagewright/shared';

import { sessions } from '../db/schema';
import { createSessionRuntime } from '../sessions/session-runtime';
import { makeTestApp } from '../test/make-test-app';

const once = (ws: WebSocket, ev: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    ws.once(ev, resolve);
    ws.once('error', reject);
  });

describe('terminal route (live websocket)', () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  const boot = async () => {
    const stream = new PassThrough();
    const exec = vi.fn(async () => ({ stream, resize: vi.fn(async () => {}), close: () => stream.destroy() }));
    const { app } = await makeTestApp({ containerTerminal: { exec } });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address() as { port: number };
    close = async () => {
      await app.close();
    };

    // login → cookie
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'al', password: 'pw' } });
    const c = login.cookies[0];
    const cookie = `${c!.name}=${c!.value}`;

    // interactive session (default spawner gives containerId 'test-container')
    const task = (
      await app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie }, payload: {} })
    ).json();

    return { port: addr.port, cookie, taskId: task.id, stream, exec, app };
  };

  it('rejects attaching to a session owned by another user (4403)', async () => {
    const { port, taskId, app } = await boot();
    // A different authenticated user must not be able to attach by guessing the id.
    const other = (
      await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'mallory', password: 'pw' } })
    ).cookies[0];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/tasks/${taskId}/terminal?kind=shell`, {
      headers: { cookie: `${other!.name}=${other!.value}` },
    });
    const code = await new Promise<number>((resolve, reject) => {
      ws.once('close', (c: number) => resolve(c));
      ws.once('error', reject);
    });
    expect(code).toBe(4403);
  });

  it('rejects an unauthenticated upgrade', async () => {
    const { port, taskId } = await boot();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/tasks/${taskId}/terminal?kind=shell`);
    await expect(once(ws, 'open')).rejects.toBeTruthy();
  });

  it('bridges PTY output and keystrokes for an authenticated user', async () => {
    const { port, cookie, taskId, stream, exec } = await boot();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/tasks/${taskId}/terminal?kind=shell`, {
      headers: { cookie },
    });
    ws.binaryType = 'arraybuffer';
    await once(ws, 'open');

    // server → client
    const got = once(ws, 'message');
    stream.write('PROMPT$ ');
    expect(Buffer.from((await got) as ArrayBuffer).toString()).toBe('PROMPT$ ');

    // client → server (keystrokes as binary)
    const written = new Promise<string>((resolve) => stream.once('data', (d: Buffer) => resolve(d.toString())));
    ws.send(Buffer.from('ls\n'));
    expect(await written).toBe('ls\n');

    expect(exec).toHaveBeenCalledWith('test-container', expect.objectContaining({ cmd: ['bash'] }));
    ws.close();
  });

  it('forwards the initial terminal size from the query so the shell PTY is born sized', async () => {
    const { port, cookie, taskId, exec } = await boot();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/tasks/${taskId}/terminal?kind=shell&cols=137&rows=42`, {
      headers: { cookie },
    });
    await once(ws, 'open');

    // The PTY exec runs after the (now DB-backed) auth preHandler resolves — a few
    // event-loop turns after the socket upgrades — so wait for it rather than asserting
    // on the open tick (mirrors the deadline-poll in the hydration test below).
    await vi.waitFor(() =>
      expect(exec).toHaveBeenCalledWith(
        'test-container',
        expect.objectContaining({ cmd: ['bash'], initialSize: { cols: 137, rows: 42 } }),
      ),
    );
    ws.close();
  });

  it('attaches an agent terminal to the runtime instead of exec-ing continue-agent', async () => {
    const { port, cookie, taskId, exec } = await boot();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/tasks/${taskId}/terminal?kind=agent`, {
      headers: { cookie },
    });
    await once(ws, 'open');

    // The persistent agent exec is owned by the runtime — the terminal route must NOT
    // open its own continue-agent PTY on attach (that was the per-attach exec bug).
    expect(exec).not.toHaveBeenCalled();
    ws.close();
  });

  it('hydrates a detached session that predates this process and resumes it on the first keystroke', async () => {
    // Simulates a control-plane restart: the session row + container exist, but the
    // in-process runtime registry has no entry for it.
    const runInteractive = vi.fn(async () => 0);
    const sessionRuntime = createSessionRuntime({
      agentDriver: { runInteractive, complete: async () => {} } as never,
    });
    const stream = new PassThrough();
    const exec = vi.fn(async () => ({ stream, resize: vi.fn(async () => {}), close: () => stream.destroy() }));
    const { app, db, userId } = await makeTestApp({ sessionRuntime, containerTerminal: { exec } });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address() as { port: number };
    close = async () => {
      await app.close();
    };
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'al', password: 'pw' } });
    const c = login.cookies[0];

    const [row] = await db
      .insert(sessions)
      .values({ kind: 'interactive', status: SessionStatus.DETACHED, createdBy: userId('al'), containerId: 'c-restart' })
      .returning();

    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/api/tasks/${row!.id}/terminal?kind=agent`, {
      headers: { cookie: `${c!.name}=${c!.value}` },
    });
    await once(ws, 'open');

    // The keystroke must land on a rebuilt runtime entry and resume a turn. Re-send
    // until it does — the server bridges the socket asynchronously after the upgrade,
    // so an instant first keystroke can race the message-listener registration.
    const deadline = Date.now() + 2000;
    while (runInteractive.mock.calls.length === 0 && Date.now() < deadline) {
      ws.send(Buffer.from('hi\n'));
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(runInteractive).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: row!.id, containerId: 'c-restart' }),
      expect.objectContaining({ cmd: ['continue-agent'] }),
    );
    ws.close();
  });

  it('omits initialSize when the query carries no usable dimensions', async () => {
    const { port, cookie, taskId, exec } = await boot();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/tasks/${taskId}/terminal?kind=shell`, {
      headers: { cookie },
    });
    await once(ws, 'open');

    await vi.waitFor(() => expect(exec).toHaveBeenCalled());
    expect((exec.mock.calls[0] as unknown as [unknown, { initialSize?: unknown }])[1].initialSize).toBeUndefined();
    ws.close();
  });
});
