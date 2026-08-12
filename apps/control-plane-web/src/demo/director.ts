import { SessionKind, SessionOrigin, SessionStatus, type Session } from '@sagewright/shared';

import { DEMO_RUN_ID, DEMO_USER_ID, DEMO_USER_NAME, DEMO_WORKFLOW_ID } from './mock-data';
import type { DemoStore } from './store';

type Timer = ReturnType<typeof setTimeout>;

const nowIso = (): string => new Date().toISOString();
let dirSeq = 0;

const GALAXY_RUNNERS = [
  'sagewright-runner-claude-code:latest',
  'sagewright-runner-opencode:latest',
  'sagewright-runner-codex:latest',
  'sagewright-runner-pi:latest',
];
const GALAXY_PROMPTS = [
  'Add a retry to the webhook dispatcher',
  'Split the settings form into sections',
  'Profile the galaxy render loop',
  'Backfill tests for the cron parser',
  'Trim the runner image size',
];

const spawnGalaxyStar = (store: DemoStore): void => {
  const i = dirSeq++;
  const now = nowIso();
  const star: Session = {
    id: `g-live-${i}`,
    kind: SessionKind.INTERACTIVE,
    name: null,
    prompt: GALAXY_PROMPTS[i % GALAXY_PROMPTS.length] ?? null,
    command: null,
    origin: SessionOrigin.USER,
    runnerImage: GALAXY_RUNNERS[i % GALAXY_RUNNERS.length] ?? null,
    status: SessionStatus.RUNNING,
    branch: `agent/live-${i}`,
    prUrl: null,
    createdBy: DEMO_USER_ID,
    createdByName: DEMO_USER_NAME,
    containerId: `demo-ctr-live-${i}`,
    scheduledPromptId: null,
    parentSessionId: null,
    workflowId: null,
    workflowStepKey: null,
    currentStepKey: null,
    iteration: null,
    error: null,
    archivedAt: null,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.sessions.push(star);
};

/** Complete the oldest still-running galaxy filler star, so the field keeps turning. */
const retireOneStar = (store: DemoStore): void => {
  const running = store.sessions.find(
    (s) => (s.id.startsWith('g-') || s.id.startsWith('g-live-')) && s.status === SessionStatus.RUNNING,
  );
  if (running) {
    running.status = SessionStatus.DONE;
    running.endedAt = nowIso();
    running.updatedAt = nowIso();
  }
};

/**
 * Run a small scripted storyline against the store so the app's existing react-query
 * polling makes the demo feel live: the in-flight workflow steps forward and ships a
 * PR, the hero session keeps ticking, and the galaxy quietly churns. Returns a cleanup
 * that clears every timer — called from the web component's disconnectedCallback.
 */
export const startDemoDirector = (store: DemoStore): (() => void) => {
  const timers: Timer[] = [];
  const at = (ms: number, fn: () => void): void => {
    timers.push(setTimeout(fn, ms));
  };
  const every = (ms: number, fn: () => void): void => {
    timers.push(setInterval(fn, ms));
  };

  // --- Workflow storyline: implement → validate (fail once) → validate → ship ---
  at(11_000, () => {
    const impl = store.sessions.find((s) => s.id === `${DEMO_RUN_ID}-implement`);
    if (impl) { impl.status = SessionStatus.DONE; impl.endedAt = nowIso(); impl.updatedAt = nowIso(); }
    // Add the validate step, running.
    store.sessions.push({
      ...store.sessions.find((s) => s.id === `${DEMO_RUN_ID}-implement`)!,
      id: `${DEMO_RUN_ID}-validate`,
      workflowStepKey: 'validate',
      runnerImage: GALAXY_RUNNERS[0] ?? null,
      status: SessionStatus.RUNNING,
      prompt: 'Run the suite and type checks; loop back on failure.',
      createdAt: nowIso(),
      startedAt: nowIso(),
      endedAt: null,
      updatedAt: nowIso(),
    });
    const parent = store.sessions.find((s) => s.id === DEMO_RUN_ID);
    if (parent) { parent.currentStepKey = 'validate'; parent.updatedAt = nowIso(); }
    const run = store.runs.find((r) => r.id === DEMO_RUN_ID);
    if (run) run.currentStepKey = 'validate';
  });

  at(22_000, () => {
    // Validation passes; the run ships a PR and completes.
    const validate = store.sessions.find((s) => s.id === `${DEMO_RUN_ID}-validate`);
    if (validate) { validate.status = SessionStatus.DONE; validate.endedAt = nowIso(); validate.updatedAt = nowIso(); }
    const prUrl = 'https://github.com/posterus-ltd/sagewright/pull/420';
    const parent = store.sessions.find((s) => s.id === DEMO_RUN_ID);
    if (parent) {
      parent.status = SessionStatus.DONE;
      parent.prUrl = prUrl;
      parent.endedAt = nowIso();
      parent.updatedAt = nowIso();
    }
    const run = store.runs.find((r) => r.id === DEMO_RUN_ID);
    if (run) { run.status = SessionStatus.DONE; run.prUrl = prUrl; run.currentStepKey = 'validate'; }
    // Nudge the scheduled "deps" task so its lastRunAt looks fresh.
    const deps = store.scheduledPrompts.find((p) => p.id === 'sched-deps');
    if (deps) deps.lastRunAt = nowIso();
    void DEMO_WORKFLOW_ID;
  });

  // --- Ambient galaxy churn ---
  every(9_000, () => {
    retireOneStar(store);
    spawnGalaxyStar(store);
  });

  // --- Keep the hero session's heartbeat fresh so it never looks stale ---
  every(15_000, () => {
    const hero = store.sessions.find((s) => s.id === 's-hero');
    if (hero && hero.status === SessionStatus.RUNNING) hero.updatedAt = nowIso();
  });

  return () => {
    for (const t of timers) {
      clearTimeout(t);
      clearInterval(t);
    }
  };
};
