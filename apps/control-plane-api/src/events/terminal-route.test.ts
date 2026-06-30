import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';

import { bridgeAgentTerminal, bridgeTerminal, cmdForKind } from './terminal-route';
import type { TerminalSession } from '../tasks/docker-client';

// Minimal EventEmitter-ish fake WebSocket matching the bits bridgeTerminal uses.
class FakeSocket {
  readyState = 1;
  OPEN = 1;
  sent: unknown[] = [];
  closed: { code?: number } | null = null;
  private handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  on(ev: string, cb: (...a: unknown[]) => void) {
    (this.handlers[ev] ??= []).push(cb);
  }
  emit(ev: string, ...args: unknown[]) {
    (this.handlers[ev] ?? []).forEach((h) => h(...args));
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closed = { code };
  }
}

const fakeSession = () => {
  const stream = new PassThrough();
  const resize = vi.fn(async () => {});
  const close = vi.fn(() => stream.destroy());
  return { session: { stream, resize, close } as unknown as TerminalSession, stream, resize, close };
};

describe('cmdForKind', () => {
  it('maps agent → continue-agent and shell → bash', () => {
    expect(cmdForKind('agent')).toEqual(['continue-agent']);
    expect(cmdForKind('shell')).toEqual(['bash']);
  });
});

describe('bridgeTerminal', () => {
  it('forwards PTY output to the socket as it streams', () => {
    const socket = new FakeSocket();
    const { session, stream } = fakeSession();
    bridgeTerminal(socket as never, session);

    stream.write('hello');
    expect(socket.sent.map((b) => (b as Buffer).toString())).toContain('hello');
  });

  it('writes binary client frames to the PTY (keystrokes)', () => {
    const socket = new FakeSocket();
    const { session, stream } = fakeSession();
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    bridgeTerminal(socket as never, session);

    socket.emit('message', Buffer.from('ls\n'), true);
    expect(Buffer.concat(chunks).toString()).toBe('ls\n');
  });

  it('treats a JSON text frame as a resize control message', () => {
    const socket = new FakeSocket();
    const { session, resize } = fakeSession();
    bridgeTerminal(socket as never, session);

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 120, rows: 40 })), false);
    expect(resize).toHaveBeenCalledWith({ cols: 120, rows: 40 });
  });

  it('closes the PTY when the socket closes', () => {
    const socket = new FakeSocket();
    const { session, close } = fakeSession();
    bridgeTerminal(socket as never, session);

    socket.emit('close');
    expect(close).toHaveBeenCalled();
  });

  it('closes the socket when the PTY stream ends', async () => {
    const socket = new FakeSocket();
    const { session, stream } = fakeSession();
    bridgeTerminal(socket as never, session);

    stream.end();
    await new Promise((r) => setImmediate(r));
    expect(socket.closed).not.toBeNull();
  });
});

const fakeRuntime = (over: { live?: boolean } = {}) => {
  let sink: ((b: Buffer) => void) | null = null;
  let live = over.live ?? true;
  const detach = vi.fn(() => {
    sink = null;
  });
  return {
    runtime: {
      attach: (_id: string, s: (b: Buffer) => void) => {
        sink = s;
        return detach;
      },
      write: vi.fn(),
      resize: vi.fn(),
      isLive: () => live,
      resume: vi.fn(() => {
        live = true;
      }),
    },
    feed: (b: Buffer) => sink?.(b),
    detach,
    setLive: (v: boolean) => {
      live = v;
    },
  };
};

describe('bridgeAgentTerminal', () => {
  it('fans the runtime exec output to the socket (no continue-agent exec on attach)', () => {
    const socket = new FakeSocket();
    const f = fakeRuntime();
    bridgeAgentTerminal(socket as never, f.runtime as never, 's1');

    f.feed(Buffer.from('agent says hi'));
    expect(socket.sent.map((b) => (b as Buffer).toString())).toContain('agent says hi');
  });

  it('writes keystrokes to the live exec without resuming', () => {
    const socket = new FakeSocket();
    const f = fakeRuntime({ live: true });
    bridgeAgentTerminal(socket as never, f.runtime as never, 's1');

    socket.emit('message', Buffer.from('ls\n'), true);
    expect(f.runtime.resume).not.toHaveBeenCalled();
    expect(f.runtime.write).toHaveBeenCalledWith('s1', 'ls\n');
  });

  it('resumes the session when the first keystroke arrives with no live exec', () => {
    const socket = new FakeSocket();
    const f = fakeRuntime({ live: false });
    bridgeAgentTerminal(socket as never, f.runtime as never, 's1');

    socket.emit('message', Buffer.from('go\n'), true);
    expect(f.runtime.resume).toHaveBeenCalledWith('s1');
    expect(f.runtime.write).toHaveBeenCalledWith('s1', 'go\n');
  });

  it('detaches but does NOT destroy the exec when the socket closes', () => {
    const socket = new FakeSocket();
    const f = fakeRuntime();
    bridgeAgentTerminal(socket as never, f.runtime as never, 's1');

    socket.emit('close');
    expect(f.detach).toHaveBeenCalled();
  });

  it('treats a JSON text frame as a resize of the live PTY', () => {
    const socket = new FakeSocket();
    const f = fakeRuntime();
    bridgeAgentTerminal(socket as never, f.runtime as never, 's1');

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 120, rows: 40 })), false);
    expect(f.runtime.resize).toHaveBeenCalledWith('s1', { cols: 120, rows: 40 });
  });
});
