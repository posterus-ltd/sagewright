import {
  type CanvasLayoutResponse,
  type MeResponse,
  type RepoWithStatus,
  type RunnerImage,
  type ScheduledPrompt,
  type Session,
  type UserSettings,
  type Workflow,
  type WorkflowRun,
  type WorkspacesResponse,
} from '@sagewright/shared';

import {
  DEMO_USER,
  allDemoSessions,
  demoCanvasLayout,
  demoDefaultRunnerImage,
  demoRepos,
  demoRunners,
  demoScheduledPrompts,
  demoSettings,
  demoWorkflow,
  demoWorkflowRun,
  demoWorkspaces,
} from './mock-data';

/**
 * The in-memory backing store for demo mode. The mock API client (`demo/api.ts`)
 * reads and writes it; the director (`demo/director.ts`) mutates it on a timer, and
 * the app's existing react-query polling surfaces those changes — so the demo feels
 * live with no server. One mutable master `sessions` list feeds every view:
 * `/api/tasks` (standalone), `/api/tasks/graph` (everything, incl. workflow
 * parents/steps), and `/api/tasks/:id`.
 */
export interface DemoStore {
  sessions: Session[];
  workflows: Workflow[];
  runs: WorkflowRun[];
  scheduledPrompts: ScheduledPrompt[];
  repos: RepoWithStatus[];
  runners: RunnerImage[];
  defaultRunnerImage: string | null;
  canvasLayout: CanvasLayoutResponse;
  workspaces: WorkspacesResponse;
  settings: UserSettings;
  me: MeResponse;
}

export const createDemoStore = (): DemoStore => ({
  // Clone the fixture arrays/objects so mutations never leak back into the seed
  // module (keeps repeated store creation — e.g. in tests — deterministic).
  sessions: allDemoSessions.map((s) => ({ ...s })),
  workflows: [{ ...demoWorkflow }],
  runs: [{ ...demoWorkflowRun }],
  scheduledPrompts: demoScheduledPrompts.map((p) => ({ ...p })),
  repos: demoRepos.map((r) => ({ ...r })),
  runners: demoRunners.map((r) => ({ ...r })),
  defaultRunnerImage: demoDefaultRunnerImage,
  canvasLayout: {
    placements: demoCanvasLayout.placements.map((p) => ({ ...p })),
    viewport: { ...demoCanvasLayout.viewport },
    updatedAt: new Date().toISOString(),
  },
  workspaces: {
    workspaces: demoWorkspaces.workspaces.map((w) => structuredClone(w)),
    activeWorkspaceId: demoWorkspaces.activeWorkspaceId,
    updatedAt: new Date().toISOString(),
  },
  settings: { ...demoSettings },
  me: { ...DEMO_USER },
});

// Lazily-created process singleton. Kept behind a function (not a top-level const)
// so `demo/store.ts` has no module side effects and the whole demo data layer
// tree-shakes cleanly out of the SPA build (which imports nothing from `demo/`).
let instance: DemoStore | null = null;
export const demoStore = (): DemoStore => (instance ??= createDemoStore());

/** Test-only: drop the singleton so each test starts from a fresh seed. */
export const __resetDemoStore = (): void => {
  instance = null;
};
