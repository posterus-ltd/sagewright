import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../test/make-test-app';

type App = Awaited<ReturnType<typeof makeTestApp>>['app'];

const login = async (app: App, displayName = 'al') => {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { displayName, password: 'pw' } });
  const cookie = res.cookies[0];
  return { cookie: `${cookie!.name}=${cookie!.value}` };
};

// The fake worker registry exposes a single image, 'w'.
const definition = {
  name: 'Implementation',
  trigger: { type: 'manual' as const },
  maxIterations: 3,
  steps: [
    { key: 'plan', name: 'Plan', kind: 'work' as const, workerImage: 'w', goal: 'Plan it.' },
    { key: 'implement', name: 'Implement', kind: 'work' as const, workerImage: 'w', goal: 'Build it.' },
    {
      key: 'validate',
      name: 'Validate',
      kind: 'validation' as const,
      workerImage: 'w',
      goal: 'Check it.',
      onFailureGoTo: 'implement',
      validateCommands: ['echo ok'],
    },
  ],
};

describe('workflow routes', () => {
  it('creates, lists, and fetches a workflow', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);

    const created = await app.inject({ method: 'POST', url: '/api/workflows', headers, payload: { definition } });
    expect(created.statusCode).toBe(201);
    const wf = created.json();
    expect(wf.name).toBe('Implementation');
    expect(wf.enabled).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/api/workflows', headers });
    expect(list.json()).toHaveLength(1);

    const got = await app.inject({ method: 'GET', url: `/api/workflows/${wf.id}`, headers });
    expect(got.json().definition.steps).toHaveLength(3);
  });

  it('rejects a definition with an unknown worker image', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const bad = { ...definition, steps: [{ ...definition.steps[0], workerImage: 'ghost' }, definition.steps[2]] };
    const res = await app.inject({ method: 'POST', url: '/api/workflows', headers, payload: { definition: bad } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a definition with no validation step', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const bad = { ...definition, steps: [{ key: 'plan', name: 'Plan', kind: 'work', workerImage: 'w', goal: 'g' }] };
    const res = await app.inject({ method: 'POST', url: '/api/workflows', headers, payload: { definition: bad } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an onFailureGoTo that names no step', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const bad = { ...definition, steps: [{ ...definition.steps[2], onFailureGoTo: 'nope' }] };
    const res = await app.inject({ method: 'POST', url: '/api/workflows', headers, payload: { definition: bad } });
    expect(res.statusCode).toBe(400);
  });

  it('updates and deletes a workflow', async () => {
    const { app } = await makeTestApp();
    const headers = await login(app);
    const wf = (await app.inject({ method: 'POST', url: '/api/workflows', headers, payload: { definition } })).json();

    const upd = await app.inject({ method: 'PUT', url: `/api/workflows/${wf.id}`, headers, payload: { enabled: false } });
    expect(upd.json().enabled).toBe(false);

    expect((await app.inject({ method: 'DELETE', url: `/api/workflows/${wf.id}`, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/workflows/${wf.id}`, headers })).statusCode).toBe(404);
  });

  it('triggers a run via the runner and returns it', async () => {
    let startedWith: { id: string; input?: string } | null = null;
    const { app } = await makeTestApp({
      workflowRunner: {
        start: async (id: string, _createdBy: string, input?: string) => {
          startedWith = { id, input };
          return {
            id: 'run-1',
            workflowId: id,
            status: 'running' as const,
            branch: 'workflow/run-1',
            prUrl: null,
            currentStepKey: 'plan',
            iteration: 0,
            createdBy: 'al',
            createdAt: new Date().toISOString(),
          };
        },
      } as never,
    });
    const headers = await login(app);
    const wf = (await app.inject({ method: 'POST', url: '/api/workflows', headers, payload: { definition } })).json();

    const run = await app.inject({
      method: 'POST',
      url: `/api/workflows/${wf.id}/run`,
      headers,
      payload: { input: 'feature requirements' },
    });
    expect(run.statusCode).toBe(201);
    expect(run.json().status).toBe('running');
    expect(startedWith).toEqual({ id: wf.id, input: 'feature requirements' });
  });

  it('requires auth', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'GET', url: '/api/workflows' })).statusCode).toBe(401);
  });
});
