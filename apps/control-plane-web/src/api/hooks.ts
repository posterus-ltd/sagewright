import {
  GithubCredentialSource,
  RepoStatus,
  SessionStatus,
  type CanvasLayout,
  type CanvasLayoutResponse,
  type CreateScheduledPromptInput,
  type CreateSessionInput,
  type CreateUserResult,
  type MeResponse,
  type RepoWithStatus,
  type ResetPasswordResult,
  type ScheduledPrompt,
  type Session,
  type UpdateWorkflowInput,
  type RunnerImage,
  type User,
  type UserRole,
  type UserSettings,
  type Workflow,
  type WorkflowInput,
  type WorkflowRun,
  type WorkflowRunDetail,
} from '@sagewright/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from './client';

// --- Auth & identity ---------------------------------------------------------

// The source of truth for the current user's role + forced-change state. The auth
// gate reads it live, so it must never be cached stale across a login/logout.
export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: () => apiClient.get<MeResponse>('/api/me'), staleTime: 0 });

export const useChangePassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiClient.post('/api/change-password', input),
    // Clearing the flag server-side must re-drive the gate (mustChangePassword → false).
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
};

// --- User management (root/admin only) ---------------------------------------

export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: () => apiClient.get<User[]>('/api/users') });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; role?: UserRole }) =>
      apiClient.post<CreateUserResult>('/api/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useResetPassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<ResetPasswordResult>(`/api/users/${encodeURIComponent(id)}/reset-password`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useSetUserRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      apiClient.patch(`/api/users/${encodeURIComponent(id)}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useDeleteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/users/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export type GithubStatus =
  | { connected: false }
  | {
      connected: true;
      source: GithubCredentialSource;
      login: string;
      name: string | null;
      email: string;
      scopes: string[];
      missingRepoScope: boolean;
      updatedAt: string;
    };

export const useRunners = () =>
  useQuery({
    queryKey: ['runners'],
    queryFn: () => apiClient.get<{ runners: RunnerImage[]; defaultImage: string | null }>('/api/runners'),
  });

// --- User settings -----------------------------------------------------------
// One generic CRUD surface for every per-user setting: read the whole object, patch any
// subset. Adding a setting needs no new hook — just a new field on UserSettings.

export const useUserSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => apiClient.get<UserSettings>('/api/settings') });

export const useUpdateUserSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserSettings>) => apiClient.patch<UserSettings>('/api/settings', patch),
    onSuccess: (settings) => {
      qc.setQueryData(['settings'], settings);
      // The runner list echoes the effective default image, so keep it in sync too.
      void qc.invalidateQueries({ queryKey: ['runners'] });
    },
  });
};

export const useTasks = (mine: boolean) =>
  useQuery({ queryKey: ['tasks', mine], queryFn: () => apiClient.get<Session[]>(`/api/tasks${mine ? '?mine=1' : ''}`), refetchInterval: 5000 });

// Every session (including workflow parents/steps) for the galaxy visualization —
// unlike useTasks, not scoped to standalone sessions or a single user.
export const useTaskGraph = () =>
  useQuery({ queryKey: ['tasks', 'graph'], queryFn: () => apiClient.get<Session[]>('/api/tasks/graph'), refetchInterval: 5000 });

// Poll only while a session is launching (queued/provisioning) so it advances to
// running — and gains its real containerId — on the detail page and canvas widget, which
// created it before its container was up. Once running, streaming/PTY takes over and we
// stop polling, preserving the cheap fetch-once behavior for the rest of its life.
export const useTask = (id: string) =>
  useQuery({
    queryKey: ['task', id],
    queryFn: () => apiClient.get<Session>(`/api/tasks/${id}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === SessionStatus.QUEUED || status === SessionStatus.PROVISIONING ? 1500 : false;
    },
  });

// Repos carry live reconcile status; poll faster while any clone is in flight.
export const useRepos = () =>
  useQuery({
    queryKey: ['repos'],
    queryFn: () => apiClient.get<RepoWithStatus[]>('/api/repos'),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === RepoStatus.CLONING) ? 2000 : false),
  });

export const useSaveRepos = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (urls: string[]) => apiClient.put<RepoWithStatus[]>('/api/repos', { urls }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  });
};

export const useGithubStatus = () =>
  useQuery({ queryKey: ['github-status'], queryFn: () => apiClient.get<GithubStatus>('/api/github/status') });

export const useSaveGithubToken = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => apiClient.put('/api/github/token', { token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['github-status'] }),
  });
};

export const useDisconnectGithub = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.del('/api/github'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['github-status'] }),
  });
};

export const useCreateSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionInput = {}) => apiClient.post<Session>('/api/tasks', input),
    // The session comes back already launching (queued/provisioning); seed the detail-page
    // cache so navigating to it (or dropping its canvas widget) shows the launching state
    // with no fetch flash, then poll it to running via useTask's refetchInterval.
    onSuccess: (task) => {
      qc.setQueryData(['task', task.id], task);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useUpdateTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string | null }) =>
      apiClient.patch<Session>(`/api/tasks/${id}`, { name }),
    onSuccess: (task) => {
      qc.setQueryData(['task', task.id], task);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useStopTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/tasks/${id}/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

export const useArchiveTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/tasks/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

export const useDeleteTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

// The user's canvas arrangement (session placements + viewport + updatedAt). Served as
// an empty layout when nothing is stored, so the query never 404s. Polled so an agent
// arranging the canvas over MCP (set_canvas) shows up live; `updatedAt` lets the board
// tell an agent/other-tab rewrite apart from its own echoed save.
export const useCanvasLayout = () =>
  useQuery({
    queryKey: ['canvas-layout'],
    queryFn: () => apiClient.get<CanvasLayoutResponse>('/api/canvas-layout'),
    refetchInterval: 2500,
    refetchOnWindowFocus: true,
  });

export const useUpdateCanvasLayout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (layout: CanvasLayout) => apiClient.put('/api/canvas-layout', layout),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas-layout'] }),
  });
};

export const useScheduledPrompts = () =>
  useQuery({ queryKey: ['scheduled-prompts'], queryFn: () => apiClient.get<ScheduledPrompt[]>('/api/scheduled-prompts') });

export const useCreateScheduledPrompt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduledPromptInput) => apiClient.post<ScheduledPrompt>('/api/scheduled-prompts', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-prompts'] }),
  });
};

export const useUpdateScheduledPrompt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<CreateScheduledPromptInput>) =>
      apiClient.put<ScheduledPrompt>(`/api/scheduled-prompts/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-prompts'] }),
  });
};

export const useDeleteScheduledPrompt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/scheduled-prompts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-prompts'] }),
  });
};

export const useWorkflows = () =>
  useQuery({ queryKey: ['workflows'], queryFn: () => apiClient.get<Workflow[]>('/api/workflows') });

export const useCreateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkflowInput) => apiClient.post<Workflow>('/api/workflows', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
};

export const useUpdateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & UpdateWorkflowInput) =>
      apiClient.put<Workflow>(`/api/workflows/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
};

export const useDeleteWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/workflows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
};

export const useRunWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: string }) =>
      apiClient.post<WorkflowRun>(`/api/workflows/${id}/run`, { input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-runs'] }),
  });
};

export const useWorkflowRuns = (workflowId?: string) =>
  useQuery({
    queryKey: ['workflow-runs', workflowId ?? 'all'],
    queryFn: () => apiClient.get<WorkflowRun[]>(`/api/workflows/runs${workflowId ? `?workflowId=${workflowId}` : ''}`),
    refetchInterval: 5000,
  });

// A run's detail (definition + step tasks). Poll while the run is still executing
// so the graph animates step transitions; stop once it reaches a terminal status.
export const useWorkflowRun = (id: string) =>
  useQuery({
    queryKey: ['workflow-run', id],
    queryFn: () => apiClient.get<WorkflowRunDetail>(`/api/workflows/runs/${id}`),
    refetchInterval: (query) => (query.state.data?.status === SessionStatus.RUNNING ? 2000 : false),
  });

// The per-user custom .env. The list view is masked; reveal is fetched on demand
// (not cached) so plaintext secrets only travel when the user explicitly asks.
export const useUserEnv = () =>
  useQuery({ queryKey: ['user-env'], queryFn: () => apiClient.get<{ env: string }>('/api/user-env') });

export const revealUserEnv = () => apiClient.get<{ env: string }>('/api/user-env/reveal');

export const useUpdateUserEnv = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (env: string) => apiClient.put('/api/user-env', { env }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-env'] }),
  });
};
