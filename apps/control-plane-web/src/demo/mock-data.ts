import {
  DEFAULT_USER_SETTINGS,
  EMPTY_CANVAS_LAYOUT,
  RepoStatus,
  SessionKind,
  SessionOrigin,
  SessionStatus,
  TriggerType,
  UserRole,
  WorkflowStepKind,
  type CanvasLayoutResponse,
  type MeResponse,
  type RepoWithStatus,
  type RunnerImage,
  type ScheduledPrompt,
  type Session,
  type UserSettings,
  type Workflow,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkspacesResponse,
} from '@sagewright/shared';

/**
 * The single source of mock data for the embedded `<sagewright-demo>` showcase: the fake
 * identity, the network-latency knob, and every seed object the in-memory store is built
 * from. Everything here is a plain object literal so the demo is easy to reshape — edit
 * the data in one file, and the store (`store.ts`), mock REST client (`api.ts`), director
 * (`director.ts`), and streams (`streams.ts`) pick it up. None of it is imported by the
 * SPA, so it all tree-shakes out of the real app bundle.
 */

// --- Fake identity / config --------------------------------------------------

/** The fake, always-signed-in identity the demo runs as (no real auth server). */
export const DEMO_USER_ID = 'demo-user-0000';
export const DEMO_USER_NAME = 'explorer';

export const DEMO_USER: MeResponse = {
  id: DEMO_USER_ID,
  username: DEMO_USER_NAME,
  role: UserRole.USER,
  mustChangePassword: false,
};

/** Roughly how long a mocked REST call "takes", to keep the UI feeling networked. */
export const DEMO_LATENCY_MS = 160;

// --- Seed data ---------------------------------------------------------------

// Everything is timed relative to load so the Galaxy's "recent activity" window and
// the Overview's "this week" metrics have something to show. (App runtime — the
// Date.now() ban applies only to Workflow orchestration scripts, not app code.)
const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

const RUNNER = {
  claude: 'sagewright-runner-claude-code:latest',
  opencode: 'sagewright-runner-opencode:latest',
  codex: 'sagewright-runner-codex:latest',
  pi: 'sagewright-runner-pi:latest',
} as const;

export const demoRunners: RunnerImage[] = [
  { id: 'claude-code', image: RUNNER.claude, name: 'Claude Code', description: "Anthropic's Claude Code CLI" },
  { id: 'opencode', image: RUNNER.opencode, name: 'opencode', description: 'The opencode agent harness' },
  { id: 'codex', image: RUNNER.codex, name: 'Codex', description: "OpenAI's Codex CLI" },
  { id: 'pi', image: RUNNER.pi, name: 'Pi', description: 'A minimal built-in harness' },
];

export const demoDefaultRunnerImage = RUNNER.claude;

// A few teammates so the fleet-wide Overview and Galaxy read like a real team, not one user.
const TEAM = [
  { id: DEMO_USER_ID, name: DEMO_USER_NAME },
  { id: 'u-mira', name: 'mira' },
  { id: 'u-devon', name: 'devon' },
  { id: 'u-sol', name: 'sol' },
] as const;

/** Fill every required Session field so callers only specify what differs. */
const session = (over: Partial<Session> & Pick<Session, 'id'>): Session => ({
  kind: SessionKind.INTERACTIVE,
  name: null,
  prompt: null,
  command: null,
  origin: SessionOrigin.USER,
  runnerImage: RUNNER.claude,
  status: SessionStatus.RUNNING,
  branch: null,
  prUrl: null,
  createdBy: DEMO_USER_ID,
  createdByName: DEMO_USER_NAME,
  containerId: 'demo-ctr-' + over.id,
  scheduledPromptId: null,
  parentSessionId: null,
  workflowId: null,
  workflowStepKey: null,
  currentStepKey: null,
  iteration: null,
  error: null,
  archivedAt: null,
  startedAt: iso(20 * MIN),
  endedAt: null,
  createdAt: iso(25 * MIN),
  updatedAt: iso(30_000),
  ...over,
});

// --- Showcase sessions (Sessions list + Canvas widgets) ----------------------
// `hero` is the one a visitor opens first: a live interactive agent terminal.
export const HERO_SESSION_ID = 's-hero';

const showcaseSessions: Session[] = [
  session({
    id: HERO_SESSION_ID,
    prompt: 'Refactor the auth module to use Result types instead of throwing',
    runnerImage: RUNNER.claude,
    branch: 'agent/auth-result-types',
    status: SessionStatus.RUNNING,
  }),
  session({
    id: 's-pagination',
    prompt: 'Add cursor pagination to GET /api/sessions and update the client hook',
    runnerImage: RUNNER.opencode,
    branch: 'agent/sessions-pagination',
    status: SessionStatus.RUNNING,
  }),
  session({
    id: 's-flaky',
    prompt: 'Track down and fix the flaky galaxy force-layout test',
    runnerImage: RUNNER.claude,
    status: SessionStatus.DETACHED,
    branch: 'agent/flaky-galaxy-test',
    updatedAt: iso(9 * MIN),
  }),
  session({
    id: 's-migrate',
    prompt: 'Migrate the settings page off deprecated MUI Grid props',
    runnerImage: RUNNER.codex,
    status: SessionStatus.NEEDS_ASSISTANCE,
    createdBy: 'u-mira',
    createdByName: 'mira',
  }),
  session({
    id: 's-shipped-1',
    prompt: 'Bump dependencies and regenerate the lockfile',
    kind: SessionKind.SCHEDULED,
    origin: SessionOrigin.AGENT,
    runnerImage: RUNNER.opencode,
    status: SessionStatus.DONE,
    branch: 'agent/dep-bumps',
    prUrl: 'https://github.com/posterus-ltd/sagewright/pull/412',
    startedAt: iso(3 * HOUR),
    endedAt: iso(3 * HOUR - 8 * MIN),
    createdAt: iso(3 * HOUR + MIN),
    updatedAt: iso(3 * HOUR - 8 * MIN),
  }),
  session({
    id: 's-shipped-2',
    prompt: 'Add an OpenGraph image to the landing page',
    runnerImage: RUNNER.claude,
    status: SessionStatus.DONE,
    branch: 'agent/og-image',
    prUrl: 'https://github.com/posterus-ltd/sagewright/pull/408',
    createdBy: 'u-devon',
    createdByName: 'devon',
    startedAt: iso(6 * HOUR),
    endedAt: iso(6 * HOUR - 14 * MIN),
    createdAt: iso(6 * HOUR + MIN),
    updatedAt: iso(6 * HOUR - 14 * MIN),
  }),
  session({
    id: 's-failed-1',
    prompt: 'Enable strict TypeScript across the workspace',
    runnerImage: RUNNER.codex,
    status: SessionStatus.FAILED,
    error: 'Validation failed after 3 iterations: 214 type errors remaining',
    createdBy: 'u-sol',
    createdByName: 'sol',
    startedAt: iso(2 * HOUR),
    endedAt: iso(2 * HOUR - 22 * MIN),
    createdAt: iso(2 * HOUR + MIN),
    updatedAt: iso(2 * HOUR - 22 * MIN),
  }),
];

// --- Workflow (definition + one in-flight run + its step sessions) -----------
export const DEMO_WORKFLOW_ID = 'wf-pr-from-spec';
export const DEMO_RUN_ID = 'run-pr-from-spec-1';

const workflowDefinition: WorkflowDefinition = {
  name: 'PR from spec',
  trigger: { type: TriggerType.MANUAL },
  maxIterations: 3,
  steps: [
    {
      key: 'plan',
      name: 'Plan (BDD + SDD)',
      goal: 'Turn the feature spec into a step-by-step implementation plan with tests first.',
      runnerImage: RUNNER.claude,
      kind: WorkflowStepKind.WORK,
    },
    {
      key: 'implement',
      name: 'Implement',
      goal: 'Implement the plan on a fresh branch, keeping changes small and cohesive.',
      runnerImage: RUNNER.opencode,
      kind: WorkflowStepKind.WORK,
    },
    {
      key: 'validate',
      name: 'Validate',
      goal: 'Run the test suite and type checks; loop back to implement on failure.',
      runnerImage: RUNNER.claude,
      kind: WorkflowStepKind.VALIDATION,
      onFailureGoTo: 'implement',
      validateCommands: ['npm exec nx -- run-many -t test', 'npm exec nx -- run-many -t typecheck'],
    },
  ],
};

export const demoWorkflow: Workflow = {
  id: DEMO_WORKFLOW_ID,
  name: workflowDefinition.name,
  definition: workflowDefinition,
  enabled: true,
  createdBy: DEMO_USER_ID,
  createdAt: iso(5 * DAY),
};

export const demoWorkflowRun: WorkflowRun = {
  id: DEMO_RUN_ID,
  workflowId: DEMO_WORKFLOW_ID,
  status: SessionStatus.RUNNING,
  branch: 'workflow/' + DEMO_RUN_ID,
  prUrl: null,
  currentStepKey: 'implement',
  iteration: 1,
  error: null,
  createdBy: DEMO_USER_ID,
  createdAt: iso(12 * MIN),
};

// The workflow parent session (kind=workflow) + its step children (kind=workflow_step).
// These appear in the Galaxy (via /api/tasks/graph) and drive the run detail view.
const workflowSessions: Session[] = [
  session({
    id: DEMO_RUN_ID,
    kind: SessionKind.WORKFLOW,
    name: 'PR from spec',
    origin: SessionOrigin.USER,
    runnerImage: null,
    status: SessionStatus.RUNNING,
    branch: 'workflow/' + DEMO_RUN_ID,
    workflowId: DEMO_WORKFLOW_ID,
    currentStepKey: 'implement',
    iteration: 1,
    createdAt: iso(12 * MIN),
    startedAt: iso(12 * MIN),
    updatedAt: iso(20_000),
  }),
  session({
    id: DEMO_RUN_ID + '-plan',
    kind: SessionKind.WORKFLOW_STEP,
    prompt: workflowDefinition.steps[0]!.goal,
    runnerImage: RUNNER.claude,
    status: SessionStatus.DONE,
    parentSessionId: DEMO_RUN_ID,
    workflowStepKey: 'plan',
    iteration: 1,
    createdAt: iso(12 * MIN),
    startedAt: iso(12 * MIN),
    endedAt: iso(9 * MIN),
    updatedAt: iso(9 * MIN),
  }),
  session({
    id: DEMO_RUN_ID + '-implement',
    kind: SessionKind.WORKFLOW_STEP,
    prompt: workflowDefinition.steps[1]!.goal,
    runnerImage: RUNNER.opencode,
    status: SessionStatus.RUNNING,
    parentSessionId: DEMO_RUN_ID,
    workflowStepKey: 'implement',
    iteration: 1,
    createdAt: iso(9 * MIN),
    startedAt: iso(9 * MIN),
    updatedAt: iso(15_000),
  }),
];

// --- Galaxy filler: a believable spread of past work across runners ----------
const GALAXY_STATUSES: SessionStatus[] = [
  SessionStatus.DONE,
  SessionStatus.DONE,
  SessionStatus.DONE,
  SessionStatus.RUNNING,
  SessionStatus.FAILED,
  SessionStatus.STOPPED,
  SessionStatus.DETACHED,
];
const GALAXY_RUNNERS = [RUNNER.claude, RUNNER.opencode, RUNNER.codex, RUNNER.pi];
const GALAXY_PROMPTS = [
  'Fix the N+1 query in the repo list endpoint',
  'Add ret/reconnect backoff to the terminal socket',
  'Write BDD specs for the scheduler',
  'Tidy the Dockerfile layers for the runner image',
  'Document the MCP surface in the README',
  'Add a health check to the control plane',
  'Cache the runner image list for 30s',
  'Extract the status chip into shared UI',
  'Harden the login rate limiter',
  'Add keyboard nav to the command palette',
];

const galaxySessions: Session[] = Array.from({ length: 48 }, (_, i) => {
  const status = GALAXY_STATUSES[i % GALAXY_STATUSES.length]!;
  const runner = GALAXY_RUNNERS[i % GALAXY_RUNNERS.length]!;
  const member = TEAM[i % TEAM.length]!;
  const createdMsAgo = (i % 20) * (0.5 * DAY) + (i % 5) * HOUR + 3 * MIN;
  const done = status === SessionStatus.DONE || status === SessionStatus.FAILED || status === SessionStatus.STOPPED;
  return session({
    id: `g-${i}`,
    kind: i % 6 === 0 ? SessionKind.SCHEDULED : SessionKind.INTERACTIVE,
    origin: i % 6 === 0 ? SessionOrigin.AGENT : SessionOrigin.USER,
    prompt: GALAXY_PROMPTS[i % GALAXY_PROMPTS.length],
    runnerImage: runner,
    status,
    createdBy: member.id,
    createdByName: member.name,
    prUrl: status === SessionStatus.DONE && i % 3 === 0 ? `https://github.com/posterus-ltd/sagewright/pull/${300 + i}` : null,
    branch: `agent/task-${i}`,
    createdAt: iso(createdMsAgo + 4 * MIN),
    startedAt: iso(createdMsAgo + 3 * MIN),
    endedAt: done ? iso(createdMsAgo) : null,
    updatedAt: iso(done ? createdMsAgo : (i % 3) * MIN + 20_000),
  });
});

/** The complete master list of sessions the store is seeded with. */
export const allDemoSessions: Session[] = [
  ...showcaseSessions,
  ...workflowSessions,
  ...galaxySessions,
];

// --- Canvas layout: place the live interactive widgets ------------------------
export const demoCanvasLayout: CanvasLayoutResponse = {
  placements: [
    { sessionId: HERO_SESSION_ID, x: 0, y: 0, width: 720, height: 460 },
    { sessionId: 's-pagination', x: 780, y: 0, width: 720, height: 460 },
    { sessionId: 's-flaky', x: 390, y: 520, width: 720, height: 460 },
  ],
  viewport: { x: 40, y: 40, zoom: 0.6 },
  updatedAt: iso(2 * MIN),
};

// --- Workspaces: two hand-built tiling layouts over the live interactive sessions ---------
export const demoWorkspaces: WorkspacesResponse = {
  workspaces: [
    {
      // A 2-pane column: hero on top, pagination below.
      id: 'ws-review',
      name: 'Review',
      tree: { direction: 'column', first: HERO_SESSION_ID, second: 's-pagination', splitPercentage: 55 },
    },
    {
      // A 2×2 grid: three live sessions plus one empty pane to fill.
      id: 'ws-triage',
      name: 'Triage grid',
      tree: {
        direction: 'row',
        first: { direction: 'column', first: HERO_SESSION_ID, second: 's-flaky', splitPercentage: 50 },
        second: { direction: 'column', first: 's-pagination', second: 'empty:demo-slot', splitPercentage: 50 },
        splitPercentage: 50,
      },
    },
  ],
  activeWorkspaceId: 'ws-review',
  updatedAt: iso(2 * MIN),
};

export const demoScheduledPrompts: ScheduledPrompt[] = [
  {
    id: 'sched-triage',
    cron: '0 9 * * 1-5',
    prompt: 'Triage new issues: label, dedupe, and draft a first response.',
    enabled: true,
    runnerImage: RUNNER.claude,
    lastRunAt: iso(20 * HOUR),
    createdAt: iso(30 * DAY),
  },
  {
    id: 'sched-deps',
    cron: '0 6 * * 1',
    prompt: 'Bump dependencies, run the suite, and open a PR if green.',
    enabled: true,
    runnerImage: RUNNER.opencode,
    lastRunAt: iso(3 * HOUR),
    createdAt: iso(21 * DAY),
  },
  {
    id: 'sched-report',
    cron: '0 17 * * 5',
    prompt: 'Summarize the week: merged PRs, open risks, and next-week focus.',
    enabled: false,
    runnerImage: RUNNER.claude,
    lastRunAt: null,
    createdAt: iso(14 * DAY),
  },
];

export const demoRepos: RepoWithStatus[] = [
  {
    id: 'repo-sagewright',
    url: 'https://github.com/posterus-ltd/sagewright',
    slug: 'sagewright',
    defaultBranch: 'main',
    status: RepoStatus.PRESENT,
    error: null,
    createdAt: iso(60 * DAY),
  },
];

export const demoSettings: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  defaultRunnerImage: demoDefaultRunnerImage,
};

export const emptyCanvasLayout = EMPTY_CANVAS_LAYOUT;
