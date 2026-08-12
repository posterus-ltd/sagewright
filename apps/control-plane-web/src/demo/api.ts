import {
  SessionKind,
  SessionOrigin,
  SessionStatus,
  type CanvasLayout,
  type CreateScheduledPromptInput,
  type CreateSessionInput,
  type ScheduledPrompt,
  type Session,
  type UserSettings,
  type Workflow,
  type WorkflowInput,
  type WorkflowRunDetail,
} from '@sagewright/shared';

import { DEMO_LATENCY_MS, DEMO_USER_ID, DEMO_USER_NAME } from './mock-data';
import type { DemoStore } from './store';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Standalone sessions are what the Sessions list + Overview show; workflow parents and
// their steps live only in the Galaxy graph and the workflow views.
const STANDALONE_KINDS = new Set<SessionKind>([
  SessionKind.INTERACTIVE,
  SessionKind.HEADLESS,
  SessionKind.SCHEDULED,
  SessionKind.SHELL,
]);
const isStandalone = (s: Session): boolean => STANDALONE_KINDS.has(s.kind);
const byNewest = (a: Session, b: Session): number => b.createdAt.localeCompare(a.createdAt);

let seq = 0;
const newId = (): string => `demo-${Date.now().toString(36)}-${(seq += 1)}`;

/** Drive a freshly-created session through its launch lifecycle so the detail page /
 *  canvas widget animate queued → provisioning → running, matching `useTask` polling. */
const scheduleLaunch = (store: DemoStore, id: string): void => {
  const find = (): Session | undefined => store.sessions.find((s) => s.id === id);
  setTimeout(() => {
    const s = find();
    if (s && s.status === SessionStatus.QUEUED) s.status = SessionStatus.PROVISIONING;
  }, 700);
  setTimeout(() => {
    const s = find();
    if (s && s.status === SessionStatus.PROVISIONING) {
      s.status = SessionStatus.RUNNING;
      s.containerId = 'demo-ctr-' + id;
      s.startedAt = new Date().toISOString();
      s.updatedAt = new Date().toISOString();
    }
  }, 1900);
};

const runDetail = (store: DemoStore, id: string): WorkflowRunDetail | undefined => {
  const run = store.runs.find((r) => r.id === id);
  if (!run) return undefined;
  const wf = store.workflows.find((w) => w.id === run.workflowId);
  if (!wf) return undefined;
  const steps = store.sessions
    .filter((s) => s.parentSessionId === id && s.kind === SessionKind.WORKFLOW_STEP)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { ...run, definition: wf.definition, steps };
};

/**
 * Resolve one request against the store. Returns the response body (or `undefined`
 * for 204-like mutations). Deliberately total: an unmatched route resolves a benign
 * empty value rather than throwing, so no demo screen can white-out on a stray call.
 */
const route = (store: DemoStore, method: string, rawPath: string, body?: unknown): unknown => {
  const qIdx = rawPath.indexOf('?');
  const pathname = qIdx >= 0 ? rawPath.slice(0, qIdx) : rawPath;
  const query = qIdx >= 0 ? rawPath.slice(qIdx + 1) : '';
  const parts = pathname.split('/').filter(Boolean); // e.g. ['api','tasks','graph']
  const p = parts.slice(1); // drop 'api'
  const seg = (i: number): string | undefined => p[i];
  const mine = new URLSearchParams(query).get('mine') === '1';

  // --- identity / config ---
  if (method === 'GET' && p.join('/') === 'me') return store.me;
  if (method === 'GET' && seg(0) === 'users') return [{ ...store.me, createdAt: new Date().toISOString() }];
  if (method === 'GET' && seg(0) === 'runners')
    return { runners: store.runners, defaultImage: store.defaultRunnerImage };
  if (method === 'GET' && seg(0) === 'settings') return store.settings;
  if (method === 'PATCH' && seg(0) === 'settings') {
    store.settings = { ...store.settings, ...(body as Partial<UserSettings>) };
    return store.settings;
  }

  // --- tasks / sessions ---
  if (seg(0) === 'tasks') {
    // /api/tasks/graph — every session (standalone + workflow parents/steps)
    if (method === 'GET' && seg(1) === 'graph') return [...store.sessions];
    // /api/tasks/:id/stop | /archive
    if (method === 'POST' && seg(1) && seg(2) === 'stop') {
      const s = store.sessions.find((x) => x.id === seg(1));
      if (s) { s.status = SessionStatus.STOPPED; s.endedAt = new Date().toISOString(); s.containerId = null; }
      return undefined;
    }
    if (method === 'POST' && seg(1) && seg(2) === 'archive') {
      const s = store.sessions.find((x) => x.id === seg(1));
      if (s) s.archivedAt = new Date().toISOString();
      return undefined;
    }
    // /api/tasks/:id
    if (seg(1)) {
      const s = store.sessions.find((x) => x.id === seg(1));
      if (method === 'GET') return s;
      if (method === 'PATCH') {
        if (s) { s.name = (body as { name: string | null }).name; s.updatedAt = new Date().toISOString(); }
        return s;
      }
      if (method === 'DELETE') {
        store.sessions = store.sessions.filter((x) => x.id !== seg(1));
        return undefined;
      }
    }
    // GET /api/tasks(?mine=1) — standalone sessions
    if (method === 'GET') {
      return store.sessions
        .filter(isStandalone)
        .filter((s) => (mine ? s.createdBy === DEMO_USER_ID : true))
        .sort(byNewest);
    }
    // POST /api/tasks — create + launch
    if (method === 'POST') {
      const input = (body ?? {}) as CreateSessionInput;
      const now = new Date().toISOString();
      const created: Session = {
        id: newId(),
        kind: SessionKind.INTERACTIVE,
        name: null,
        prompt: input.prompt ?? null,
        command: null,
        origin: SessionOrigin.USER,
        runnerImage: input.runnerImage ?? store.defaultRunnerImage,
        status: SessionStatus.QUEUED,
        branch: null,
        prUrl: null,
        createdBy: DEMO_USER_ID,
        createdByName: DEMO_USER_NAME,
        containerId: null,
        scheduledPromptId: null,
        parentSessionId: null,
        workflowId: null,
        workflowStepKey: null,
        currentStepKey: null,
        iteration: null,
        error: null,
        archivedAt: null,
        startedAt: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store.sessions.unshift(created);
      scheduleLaunch(store, created.id);
      return created;
    }
  }

  // --- canvas layout ---
  if (seg(0) === 'canvas-layout') {
    if (method === 'GET') return store.canvasLayout;
    if (method === 'PUT') {
      const layout = body as CanvasLayout;
      store.canvasLayout = { ...layout, updatedAt: new Date().toISOString() };
      return undefined;
    }
  }

  // --- scheduled prompts ---
  if (seg(0) === 'scheduled-prompts') {
    if (method === 'GET') return [...store.scheduledPrompts];
    if (method === 'POST') {
      const input = body as CreateScheduledPromptInput;
      const created: ScheduledPrompt = {
        id: newId(),
        cron: input.cron,
        prompt: input.prompt,
        enabled: input.enabled ?? true,
        runnerImage: input.runnerImage ?? null,
        lastRunAt: null,
        createdAt: new Date().toISOString(),
      };
      store.scheduledPrompts.unshift(created);
      return created;
    }
    if (method === 'PUT' && seg(1)) {
      const existing = store.scheduledPrompts.find((x) => x.id === seg(1));
      if (existing) Object.assign(existing, body as Partial<ScheduledPrompt>);
      return existing;
    }
    if (method === 'DELETE' && seg(1)) {
      store.scheduledPrompts = store.scheduledPrompts.filter((x) => x.id !== seg(1));
      return undefined;
    }
  }

  // --- workflows + runs ---
  if (seg(0) === 'workflows') {
    // /api/workflows/runs(...) and /api/workflows/runs/:id
    if (seg(1) === 'runs') {
      if (method === 'GET' && seg(2)) return runDetail(store, seg(2)!);
      if (method === 'GET') {
        const wfId = new URLSearchParams(query).get('workflowId');
        return store.runs.filter((r) => (wfId ? r.workflowId === wfId : true));
      }
    }
    // /api/workflows/:id/run
    if (method === 'POST' && seg(1) && seg(2) === 'run') {
      const now = new Date().toISOString();
      const run = { id: newId(), workflowId: seg(1)!, status: SessionStatus.RUNNING, branch: null, prUrl: null, currentStepKey: null, iteration: 1, error: null, createdBy: DEMO_USER_ID, createdAt: now };
      store.runs.unshift(run);
      return run;
    }
    // /api/workflows/:id  (PUT/DELETE) and /api/workflows (GET/POST)
    if (method === 'GET' && !seg(1)) return [...store.workflows];
    if (method === 'POST' && !seg(1)) {
      const input = body as WorkflowInput;
      const created: Workflow = {
        id: newId(),
        name: input.definition.name,
        definition: input.definition,
        enabled: input.enabled ?? true,
        createdBy: DEMO_USER_ID,
        createdAt: new Date().toISOString(),
      };
      store.workflows.unshift(created);
      return created;
    }
    if (method === 'PUT' && seg(1)) {
      const existing = store.workflows.find((x) => x.id === seg(1));
      if (existing) {
        const patch = body as Partial<WorkflowInput>;
        if (patch.definition) { existing.definition = patch.definition; existing.name = patch.definition.name; }
        if (patch.enabled !== undefined) existing.enabled = patch.enabled;
      }
      return existing;
    }
    if (method === 'DELETE' && seg(1)) {
      store.workflows = store.workflows.filter((x) => x.id !== seg(1));
      store.runs = store.runs.filter((r) => r.workflowId !== seg(1));
      return undefined;
    }
  }

  // --- repos + github + env (Settings surface — benign, out of the showcase) ---
  if (seg(0) === 'repos') {
    if (method === 'GET') return [...store.repos];
    if (method === 'PUT') return [...store.repos];
  }
  if (seg(0) === 'github') {
    if (method === 'GET' && seg(1) === 'status') return { connected: false };
    return undefined;
  }
  if (seg(0) === 'user-env') return { env: '' };
  if (p.join('/') === 'change-password' || p.join('/') === 'login' || p.join('/') === 'logout') return store.me;

  // Unknown route: benign empty so nothing white-screens. Warn in dev only.
  if (import.meta.env.DEV) console.warn(`[demo] unhandled ${method} /${p.join('/')}`);
  return undefined;
};

/**
 * An in-memory drop-in for the real fetch API client, backed by the seeded demo store.
 * Matches the `{ get, post, patch, put, del }` shape so every existing hook works
 * unchanged. Adds a small latency so react-query's loading states still flash.
 */
export const createDemoApiClient = (store: DemoStore) => {
  const handle = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    await delay(DEMO_LATENCY_MS);
    return route(store, method, path, body) as T;
  };
  return {
    get: <T>(path: string) => handle<T>('GET', path),
    post: <T>(path: string, body?: unknown) => handle<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => handle<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => handle<T>('PUT', path, body),
    del: <T>(path: string) => handle<T>('DELETE', path),
  };
};
