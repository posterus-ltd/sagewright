import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SessionKind, SessionOrigin, SessionStatus, TriggerType, WorkflowStepKind } from '@sagewright/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { createMcpToken } from '../auth/mcp-token';
import { canvasLayouts, scheduledPrompts, sessions, workflows } from '../db/schema';
import { fakeScheduler, makeTestApp } from '../test/make-test-app';
import { buildMcpServer, type McpCallerContext } from './mcp-server';
import type { AppDeps } from '../app';

// Connect an in-memory MCP client to a server bound to `ctx`, so tool calls exercise the
// real dispatch/validation/guardrails without the HTTP transport.
const connect = async (deps: AppDeps, ctx: McpCallerContext): Promise<Client> => {
  const server = buildMcpServer(deps, ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
};

// callTool returns a union (modern content result + legacy shape), so accept `unknown`
// and narrow here. `text0` is the first text block; our tools always return one.
const text0 = (res: unknown): string =>
  ((res as { content: { type: string; text: string }[] }).content)[0]!.text;
// A successful tool result's text block is a JSON string; an errored one is a plain message.
const resultJson = (res: unknown): unknown => JSON.parse(text0(res));
const isError = (res: unknown): boolean => (res as { isError?: boolean }).isError === true;

// Insert a session row directly (a caller/parent for spawn tests) and return its id.
const insertSession = async (
  db: Awaited<ReturnType<typeof makeTestApp>>['db'],
  createdBy: string,
  parentSessionId?: string,
): Promise<string> => {
  const [row] = await db
    .insert(sessions)
    .values({ kind: SessionKind.INTERACTIVE, createdBy, status: SessionStatus.RUNNING, parentSessionId: parentSessionId ?? null })
    .returning();
  return row!.id;
};

describe('mcp HTTP auth boundary', () => {
  it('rejects a request with no bearer token', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'POST', url: '/mcp', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a browser session cookie presented as a bearer (audience is pinned)', async () => {
    const { app } = await makeTestApp();
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'al', password: 'pw' } });
    const cookieJwt = login.cookies[0]!.value; // the vm_session JWT — audience 'sagewright'
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: `Bearer ${cookieJwt}` },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid MCP token past the guard (GET → 405 method-not-allowed)', async () => {
    const { app, deps, userId } = await makeTestApp();
    const token = await createMcpToken(deps.config.sessionSecret).sign({ userId: userId('al'), sessionId: 'sess-1' });
    const res = await app.inject({ method: 'GET', url: '/mcp', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(405);
  });

  it('rejects a valid token when the user has disabled MCP (403)', async () => {
    const { app, deps, userId } = await makeTestApp();
    // The token stays valid (30d), so the live per-user kill switch is what blocks it.
    await deps.userSettingsService.update(userId('al'), { mcpEnabled: false });
    const token = await createMcpToken(deps.config.sessionSecret).sign({ userId: userId('al'), sessionId: 'sess-1' });
    const res = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${token}` }, payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('mcp_disabled');
  });
});

describe('mcp tools', () => {
  it('lists the available tools', async () => {
    const { deps, userId } = await makeTestApp();
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'archive_session',
        'create_workflow',
        'get_canvas',
        'get_session',
        'list_runners',
        'list_sessions',
        'run_workflow',
        'schedule_job',
        'set_canvas',
        'spawn_interactive_session',
        'spawn_session',
        'spawn_shell',
      ],
    );
  });

  it('spawn_session creates a headless child under the caller session', async () => {
    const { db, deps, userId } = await makeTestApp();
    const caller = await insertSession(db, userId('al'));
    const client = await connect(deps, { userId: userId('al'), callerSessionId: caller });

    const res = await client.callTool({ name: 'spawn_session', arguments: { prompt: 'do a thing' } });
    const out = resultJson(res) as { sessionId: string; parentSessionId: string };
    expect(out.parentSessionId).toBe(caller);

    const [child] = await db.select().from(sessions).where(eq(sessions.id, out.sessionId)).limit(1);
    expect(child!.parentSessionId).toBe(caller);
    expect(child!.kind).toBe(SessionKind.HEADLESS);
    expect(child!.createdBy).toBe(userId('al'));
  });

  it('spawn_session rejects a missing or empty prompt', async () => {
    const { db, deps, userId } = await makeTestApp();
    const caller = await insertSession(db, userId('al'));
    const client = await connect(deps, { userId: userId('al'), callerSessionId: caller });

    // A headless child with no prompt would come up doing nothing, so the tool refuses it.
    const missing = await client.callTool({ name: 'spawn_session', arguments: {} });
    expect(isError(missing)).toBe(true);
    const empty = await client.callTool({ name: 'spawn_session', arguments: { prompt: '' } });
    expect(isError(empty)).toBe(true);

    // Nothing was persisted under the caller.
    const children = await db.select().from(sessions).where(eq(sessions.parentSessionId, caller));
    expect(children).toHaveLength(0);
  });

  it('spawn_session enforces the depth cap', async () => {
    const { db, deps, userId } = await makeTestApp();
    // A chain caller → c1 → c2 → c3: c3 has 3 ancestors, so a 4th generation is refused.
    const c0 = await insertSession(db, userId('al'));
    const c1 = await insertSession(db, userId('al'), c0);
    const c2 = await insertSession(db, userId('al'), c1);
    const c3 = await insertSession(db, userId('al'), c2);
    const client = await connect(deps, { userId: userId('al'), callerSessionId: c3 });

    const res = await client.callTool({ name: 'spawn_session', arguments: { prompt: 'too deep' } });
    expect(isError(res)).toBe(true);
    expect(text0(res)).toMatch(/depth limit/i);
  });

  it('schedule_job creates a scheduled prompt owned by the caller', async () => {
    const sync = vi.fn(async () => undefined);
    const { db, deps, userId } = await makeTestApp({ scheduler: fakeScheduler({ sync }) });
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });

    const res = await client.callTool({ name: 'schedule_job', arguments: { cron: '0 9 * * *', prompt: 'daily triage' } });
    const out = resultJson(res) as { id: string; cron: string };
    expect(out.cron).toBe('0 9 * * *');
    expect(sync).toHaveBeenCalled();

    const [row] = await db.select().from(scheduledPrompts).where(eq(scheduledPrompts.id, out.id)).limit(1);
    expect(row!.createdBy).toBe(userId('al'));
  });

  it('schedule_job rejects an invalid cron', async () => {
    const { deps, userId } = await makeTestApp({ scheduler: fakeScheduler({ isValidCron: () => false }) });
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });
    const res = await client.callTool({ name: 'schedule_job', arguments: { cron: 'nope', prompt: 'x' } });
    expect(isError(res)).toBe(true);
  });

  it('create_workflow persists a workflow owned by the caller', async () => {
    const { db, deps, userId } = await makeTestApp();
    const definition = {
      name: 'ship it',
      trigger: { type: TriggerType.MANUAL },
      maxIterations: 3,
      steps: [
        { key: 'build', name: 'Build', goal: 'do the work', runnerImage: 'w', kind: WorkflowStepKind.WORK },
        { key: 'check', name: 'Check', goal: 'validate', runnerImage: 'w', kind: WorkflowStepKind.VALIDATION },
      ],
    };
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });
    const res = await client.callTool({ name: 'create_workflow', arguments: { definition } });
    const out = resultJson(res) as { id: string; name: string };
    expect(out.name).toBe('ship it');

    const [row] = await db.select().from(workflows).where(eq(workflows.id, out.id)).limit(1);
    expect(row!.createdBy).toBe(userId('al'));
  });

  it('create_workflow rejects an unknown runner image', async () => {
    const { deps, userId } = await makeTestApp();
    const definition = {
      name: 'bad',
      trigger: { type: TriggerType.MANUAL },
      maxIterations: 1,
      steps: [{ key: 'check', name: 'Check', goal: 'validate', runnerImage: 'ghost:latest', kind: WorkflowStepKind.VALIDATION }],
    };
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });
    const res = await client.callTool({ name: 'create_workflow', arguments: { definition } });
    expect(isError(res)).toBe(true);
    expect(text0(res)).toMatch(/unknown runner image/i);
  });

  it('get_session hides another user\'s session', async () => {
    const { db, deps, userId } = await makeTestApp();
    const othersSession = await insertSession(db, userId('bob'));
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });
    const res = await client.callTool({ name: 'get_session', arguments: { id: othersSession } });
    expect(isError(res)).toBe(true);
    expect(text0(res)).toBe('not found');
  });

  it('list_runners returns the available runner images', async () => {
    const { deps, userId } = await makeTestApp();
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });
    const res = await client.callTool({ name: 'list_runners', arguments: {} });
    const out = resultJson(res) as { image: string }[];
    expect(out.some((r) => r.image === 'w')).toBe(true);
  });

  it('spawn_interactive_session creates a standalone delegated interactive session', async () => {
    const { db, deps, userId } = await makeTestApp();
    const caller = await insertSession(db, userId('al'));
    const client = await connect(deps, { userId: userId('al'), callerSessionId: caller });

    const res = await client.callTool({ name: 'spawn_interactive_session', arguments: { prompt: 'help me build' } });
    const out = resultJson(res) as { sessionId: string; kind: string };
    expect(out.kind).toBe(SessionKind.INTERACTIVE);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, out.sessionId)).limit(1);
    // Standalone (no parent, unlike spawn_session) so it shows in the Sessions list / canvas,
    // and tagged delegated.
    expect(row!.parentSessionId).toBeNull();
    expect(row!.origin).toBe(SessionOrigin.AGENT);
    expect(row!.createdBy).toBe(userId('al'));
  });

  it('spawn_shell creates a no-agent shell session carrying its command', async () => {
    const { db, deps, userId } = await makeTestApp();
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });

    const res = await client.callTool({ name: 'spawn_shell', arguments: { command: 'watch -n1 date' } });
    const out = resultJson(res) as { sessionId: string; kind: string; status: string };
    expect(out.kind).toBe(SessionKind.SHELL);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, out.sessionId)).limit(1);
    expect(row!.kind).toBe(SessionKind.SHELL);
    expect(row!.command).toBe('watch -n1 date');
    expect(row!.origin).toBe(SessionOrigin.AGENT);
    expect(row!.status).toBe(SessionStatus.RUNNING);
  });

  it('spawn_shell rejects a missing or empty command', async () => {
    const { deps, userId } = await makeTestApp();
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });
    expect(isError(await client.callTool({ name: 'spawn_shell', arguments: {} }))).toBe(true);
    expect(isError(await client.callTool({ name: 'spawn_shell', arguments: { command: '' } }))).toBe(true);
  });

  it('spawn_shell starts the command in a persistent tmux over docker exec', async () => {
    const capture = vi.fn(async (_id: string, _opts: { cmd: string[] }) => ({ exitCode: 0, stdout: '', stderr: '' }));
    const { deps, userId } = await makeTestApp({ containerExec: { capture } as never });
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });

    await client.callTool({ name: 'spawn_shell', arguments: { command: 'htop' } });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]![1].cmd).toEqual(['tmux', 'new-session', '-d', '-s', 'sagewright-shell', 'exec htop']);
  });

  it('a delegated session auto-archives when it stops', async () => {
    const { db, deps, userId } = await makeTestApp();
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });
    const res = await client.callTool({ name: 'spawn_shell', arguments: { command: 'sleep 1000' } });
    const { sessionId } = resultJson(res) as { sessionId: string };

    await deps.taskService.stop(sessionId);
    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    expect(row!.status).toBe(SessionStatus.STOPPED);
    // Short-lived delegated sessions leave a trace in history, archived, not in the active list.
    expect(row!.archivedAt).not.toBeNull();
  });

  it('spawn tools enforce the user-configurable active-session cap', async () => {
    const { db, deps, userId } = await makeTestApp();
    await deps.userSettingsService.update(userId('al'), { maxActiveSessions: 1 });
    // One active session already puts the user at the cap of 1.
    await insertSession(db, userId('al'));
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });

    const res = await client.callTool({ name: 'spawn_interactive_session', arguments: {} });
    expect(isError(res)).toBe(true);
    expect(text0(res)).toMatch(/too many active sessions/i);
  });

  it('archive_session archives your session and hides another user\'s', async () => {
    const { db, deps, userId } = await makeTestApp();
    const mine = await insertSession(db, userId('al'));
    const theirs = await insertSession(db, userId('bob'));
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });

    const ok = await client.callTool({ name: 'archive_session', arguments: { id: mine } });
    expect(isError(ok)).toBe(false);
    const [row] = await db.select().from(sessions).where(eq(sessions.id, mine)).limit(1);
    expect(row!.archivedAt).not.toBeNull();

    const denied = await client.callTool({ name: 'archive_session', arguments: { id: theirs } });
    expect(isError(denied)).toBe(true);
    expect(text0(denied)).toBe('not found');
  });

  it('set_canvas persists placements and get_canvas returns them', async () => {
    const { db, deps, userId } = await makeTestApp();
    const s = await insertSession(db, userId('al'));
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });

    const layout = { placements: [{ sessionId: s, x: 10, y: 20 }], viewport: { x: 0, y: 0, zoom: 1 } };
    const setRes = await client.callTool({ name: 'set_canvas', arguments: layout });
    expect(isError(setRes)).toBe(false);

    const getRes = await client.callTool({ name: 'get_canvas', arguments: {} });
    const out = resultJson(getRes) as { placements: { sessionId: string; x: number }[] };
    expect(out.placements).toHaveLength(1);
    expect(out.placements[0]!.sessionId).toBe(s);
  });

  it('set_canvas rejects a placement referencing a session you don\'t own', async () => {
    const { db, deps, userId } = await makeTestApp();
    const theirs = await insertSession(db, userId('bob'));
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });

    const layout = { placements: [{ sessionId: theirs, x: 0, y: 0 }], viewport: { x: 0, y: 0, zoom: 1 } };
    const res = await client.callTool({ name: 'set_canvas', arguments: layout });
    expect(isError(res)).toBe(true);
    // Nothing was persisted for the caller.
    const rows = await db.select().from(canvasLayouts).where(eq(canvasLayouts.userId, userId('al')));
    expect(rows).toHaveLength(0);
  });

  it('list_sessions returns the caller\'s standalone sessions with origin', async () => {
    const { db, deps, userId } = await makeTestApp();
    await insertSession(db, userId('al'));
    await insertSession(db, userId('bob')); // another user's — must not leak
    const client = await connect(deps, { userId: userId('al'), callerSessionId: 'sess-1' });

    const res = await client.callTool({ name: 'list_sessions', arguments: {} });
    const out = resultJson(res) as { id: string; origin: string }[];
    expect(out).toHaveLength(1);
    expect(out[0]!.origin).toBe(SessionOrigin.USER);
  });
});
