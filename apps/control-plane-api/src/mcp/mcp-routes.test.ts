import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SessionKind, SessionStatus, TriggerType, WorkflowStepKind } from '@sagewright/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { createMcpToken } from '../auth/mcp-token';
import { scheduledPrompts, sessions, workflows } from '../db/schema';
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
      ['create_workflow', 'get_session', 'list_runners', 'run_workflow', 'schedule_job', 'spawn_session'],
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
});
