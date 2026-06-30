import { describe, expect, it, vi } from 'vitest';

import { createSessionRuntime, type StartSessionInput } from './session-runtime';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// A controllable fake AgentRunner: runInteractive hands over a live exec via onSession
// and stays pending until endTurn() resolves it (mirroring a turn ending). It exposes
// the onData tee so the test can push PTY bytes through the runtime's fan-out.
const fakeRunner = () => {
  let resolveTurn: ((v: number | null) => void) | null = null;
  let onData: ((b: Buffer) => void) | undefined;
  const sessions: { write: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn> }[] = [];
  const cmds: (string[] | undefined)[] = [];
  const runInteractive = (_input: unknown, opts: { cmd?: string[]; onSession?: (s: unknown) => void; onData?: (b: Buffer) => void } = {}) => {
    cmds.push(opts.cmd);
    const session = { write: vi.fn(), resize: vi.fn(async () => {}) };
    sessions.push(session);
    opts.onSession?.(session);
    onData = opts.onData;
    return new Promise<number | null>((res) => {
      resolveTurn = res;
    });
  };
  const complete = vi.fn(async () => undefined);
  return {
    runner: { runInteractive, complete } as never,
    endTurn: () => resolveTurn?.(0),
    feed: (b: Buffer) => onData?.(b),
    sessions,
    cmds,
    complete,
  };
};

const startInput = (sessionId: string): StartSessionInput => ({
  sessionId,
  containerId: 'c1',
  manifest: [],
  sessionDir: '/v',
});

describe('session-runtime', () => {
  it('starts one live exec per session and refuses resume while live (the attach lock)', () => {
    const f = fakeRunner();
    const rt = createSessionRuntime({ agentRunner: f.runner });

    rt.start(startInput('s1'));

    expect(rt.isLive('s1')).toBe(true);
    expect(() => rt.resume('s1')).toThrow();
    expect(f.cmds[0]).toBeUndefined(); // first turn → default cmd (start-agent)
  });

  it('goes not-live after the turn ends; resume re-establishes with continue-agent', async () => {
    const f = fakeRunner();
    const rt = createSessionRuntime({ agentRunner: f.runner });

    rt.start(startInput('s1'));
    f.endTurn();
    await tick();
    expect(rt.isLive('s1')).toBe(false);

    rt.resume('s1');
    expect(rt.isLive('s1')).toBe(true);
    expect(f.cmds[1]).toEqual(['continue-agent']);
  });

  it('fans live PTY bytes to attached sinks; detaching one stops its feed but keeps the exec alive', () => {
    const f = fakeRunner();
    const rt = createSessionRuntime({ agentRunner: f.runner });

    rt.start(startInput('s1'));
    const got: Buffer[] = [];
    const detach = rt.attach('s1', (b) => got.push(b));

    f.feed(Buffer.from('hello'));
    expect(Buffer.concat(got).toString()).toBe('hello');

    detach();
    f.feed(Buffer.from('world'));
    expect(Buffer.concat(got).toString()).toBe('hello'); // no bytes after detach
    expect(rt.isLive('s1')).toBe(true); // detaching a viewer never kills the exec
  });

  it('routes write and resize to the live exec', () => {
    const f = fakeRunner();
    const rt = createSessionRuntime({ agentRunner: f.runner });

    rt.start(startInput('s1'));
    rt.write('s1', 'ls\n');
    rt.resize('s1', { cols: 80, rows: 24 });

    expect(f.sessions[0]!.write).toHaveBeenCalledWith('ls\n');
    expect(f.sessions[0]!.resize).toHaveBeenCalledWith({ cols: 80, rows: 24 });
  });

  it('complete delegates to the agent runner with the session context and drops the entry', async () => {
    const f = fakeRunner();
    const rt = createSessionRuntime({ agentRunner: f.runner });

    rt.start({
      sessionId: 's1',
      containerId: 'c1',
      manifest: [{ slug: 'a', url: 'u', defaultBranch: 'main', path: '/v/a' }],
      sessionDir: '/v',
      githubIdentity: { login: 'o', name: null, email: 'e' },
    });
    await rt.complete('s1');

    expect(f.complete).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 's1', containerId: 'c1', githubIdentity: { login: 'o', name: null, email: 'e' } }),
    );
    expect(rt.isLive('s1')).toBe(false);
  });
});
