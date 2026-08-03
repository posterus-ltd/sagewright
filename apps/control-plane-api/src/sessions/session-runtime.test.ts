import { describe, expect, it, vi } from 'vitest';

import { createSessionRuntime, type StartSessionInput } from './session-runtime';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// A controllable fake AgentDriver: runInteractive hands over a live exec via onSession
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
    driver: { runInteractive, complete } as never,
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
    const rt = createSessionRuntime({ agentDriver: f.driver });

    rt.start(startInput('s1'));

    expect(rt.isLive('s1')).toBe(true);
    expect(() => rt.resume('s1')).toThrow();
    expect(f.cmds[0]).toBeUndefined(); // first turn → default cmd (start-agent)
  });

  it('refuses a racing resume during the exec spawn window and starts only one turn', async () => {
    // A driver whose exec lands LATE (next tick), mirroring docker exec taking time to
    // resolve. The lock must be the synchronous `live` flag, not the async `exec` handle:
    // if it were exec-bound, two resumes firing inside the spawn window would both pass
    // the guard and start two concurrent turns on the same container.
    let turnCount = 0;
    let endFirst: ((v: number | null) => void) | null = null;
    const runInteractive = (_i: unknown, opts: { onSession?: (s: unknown) => void } = {}): Promise<number | null> => {
      turnCount += 1;
      const isFirst = turnCount === 1;
      setTimeout(() => opts.onSession?.({ write: vi.fn(), resize: vi.fn(async () => {}) }), 0); // exec lands async
      return new Promise<number | null>((res) => {
        if (isFirst) endFirst = res;
      });
    };
    const rt = createSessionRuntime({ agentDriver: { runInteractive, complete: vi.fn() } as never });

    rt.start(startInput('s1'));
    expect(rt.isLive('s1')).toBe(true); // live the instant the turn is claimed, before exec resolves
    await tick();
    (endFirst as ((v: number | null) => void) | null)?.(0); // first turn ends → DETACHED
    await tick();
    expect(rt.isLive('s1')).toBe(false);

    rt.resume('s1'); // claims the lock synchronously
    expect(() => rt.resume('s1')).toThrow(); // refused even though the resumed exec hasn't landed yet
    await tick();
    expect(turnCount).toBe(2); // start + one resume — NOT three
  });

  it('goes not-live after the turn ends; resume re-establishes with continue-agent', async () => {
    const f = fakeRunner();
    const rt = createSessionRuntime({ agentDriver: f.driver });

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
    const rt = createSessionRuntime({ agentDriver: f.driver });

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
    const rt = createSessionRuntime({ agentDriver: f.driver });

    rt.start(startInput('s1'));
    rt.write('s1', 'ls\n');
    rt.resize('s1', { cols: 80, rows: 24 });

    expect(f.sessions[0]!.write).toHaveBeenCalledWith('ls\n');
    expect(f.sessions[0]!.resize).toHaveBeenCalledWith({ cols: 80, rows: 24 });
  });

  it('ensure rebuilds a resting entry (post-restart) that attach and resume can use', () => {
    const f = fakeRunner();
    const rt = createSessionRuntime({ agentDriver: f.driver });

    expect(rt.has('s1')).toBe(false);
    rt.ensure(startInput('s1'));
    expect(rt.has('s1')).toBe(true);
    expect(rt.isLive('s1')).toBe(false); // resting — ensure never drives a turn

    const got: Buffer[] = [];
    rt.attach('s1', (b) => got.push(b));
    rt.resume('s1'); // resumes like any detached session
    expect(f.cmds[0]).toEqual(['continue-agent']);
    f.feed(Buffer.from('back'));
    expect(Buffer.concat(got).toString()).toBe('back');
  });

  it('ensure never clobbers an existing entry (idempotent under racing attaches)', () => {
    const f = fakeRunner();
    const rt = createSessionRuntime({ agentDriver: f.driver });

    rt.start(startInput('s1'));
    rt.ensure({ ...startInput('s1'), containerId: 'other' });

    expect(rt.isLive('s1')).toBe(true); // the live turn is untouched
    rt.write('s1', 'x');
    expect(f.sessions[0]!.write).toHaveBeenCalledWith('x');
  });

  it('complete delegates to the agent driver with the session context and drops the entry', async () => {
    const f = fakeRunner();
    const rt = createSessionRuntime({ agentDriver: f.driver });

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
