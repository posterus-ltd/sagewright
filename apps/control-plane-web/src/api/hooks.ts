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
import { useCallback } from 'react';

import { useApiClient } from './ApiClientProvider';

// --- Auth & identity ---------------------------------------------------------

// The source of truth for the current user's role + forced-change state. The auth
// gate reads it live, so it must never be cached stale across a login/logout.
export const useMe = () => {
  const api = useApiClient();
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<MeResponse>('/api/me'), staleTime: 0 });
};

export const useChangePassword = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api.post('/api/change-password', input),
    // Clearing the flag server-side must re-drive the gate (mustChangePassword → false).
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
};

// --- User management (root/admin only) ---------------------------------------

export const useUsers = () => {
  const api = useApiClient();
  return useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/api/users') });
};

export const useCreateUser = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; role?: UserRole }) =>
      api.post<CreateUserResult>('/api/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useResetPassword = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ResetPasswordResult>(`/api/users/${encodeURIComponent(id)}/reset-password`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useSetUserRole = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      api.patch(`/api/users/${encodeURIComponent(id)}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useDeleteUser = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/users/${encodeURIComponent(id)}`),
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

export const useRunners = () => {
  const api = useApiClient();
  return useQuery({
    queryKey: ['runners'],
    queryFn: () => api.get<{ runners: RunnerImage[]; defaultImage: string | null }>('/api/runners'),
  });
};

// --- User settings -----------------------------------------------------------
// One generic CRUD surface for every per-user setting: read the whole object, patch any
// subset. Adding a setting needs no new hook — just a new field on UserSettings.

export const useUserSettings = () => {
  const api = useApiClient();
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get<UserSettings>('/api/settings') });
};

export const useUpdateUserSettings = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserSettings>) => api.patch<UserSettings>('/api/settings', patch),
    onSuccess: (settings) => {
      qc.setQueryData(['settings'], settings);
      // The runner list echoes the effective default image, so keep it in sync too.
      void qc.invalidateQueries({ queryKey: ['runners'] });
    },
  });
};

export const useTasks = (mine: boolean) => {
  const api = useApiClient();
  return useQuery({ queryKey: ['tasks', mine], queryFn: () => api.get<Session[]>(`/api/tasks${mine ? '?mine=1' : ''}`), refetchInterval: 5000 });
};

// Every session (including workflow parents/steps) for the galaxy visualization —
// unlike useTasks, not scoped to standalone sessions or a single user.
export const useTaskGraph = () => {
  const api = useApiClient();
  return useQuery({ queryKey: ['tasks', 'graph'], queryFn: () => api.get<Session[]>('/api/tasks/graph'), refetchInterval: 5000 });
};

// Poll only while a session is launching (queued/provisioning) so it advances to
// running — and gains its real containerId — on the detail page and canvas widget, which
// created it before its container was up. Once running, streaming/PTY takes over and we
// stop polling, preserving the cheap fetch-once behavior for the rest of its life.
export const useTask = (id: string) => {
  const api = useApiClient();
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => api.get<Session>(`/api/tasks/${id}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === SessionStatus.QUEUED || status === SessionStatus.PROVISIONING ? 1500 : false;
    },
  });
};

// Repos carry live reconcile status; poll faster while any clone is in flight.
export const useRepos = () => {
  const api = useApiClient();
  return useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get<RepoWithStatus[]>('/api/repos'),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === RepoStatus.CLONING) ? 2000 : false),
  });
};

export const useSaveRepos = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (urls: string[]) => api.put<RepoWithStatus[]>('/api/repos', { urls }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  });
};

export const useGithubStatus = () => {
  const api = useApiClient();
  return useQuery({ queryKey: ['github-status'], queryFn: () => api.get<GithubStatus>('/api/github/status') });
};

export const useSaveGithubToken = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.put('/api/github/token', { token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['github-status'] }),
  });
};

export const useDisconnectGithub = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del('/api/github'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['github-status'] }),
  });
};

export const useCreateSession = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionInput = {}) => api.post<Session>('/api/tasks', input),
    // The session comes back already launching (queued/provisioning). Seed the caches so the
    // UI reflects it immediately: the detail page (['task', id]) shows the launching state
    // with no fetch flash, and every task list (['tasks', …]) that feeds the sessions grid
    // and the canvas gains the row right away. Seeding the list is what lets a freshly
    // dropped canvas widget survive — the board prunes any node whose session isn't in the
    // list, which otherwise wouldn't include this one until the next 5s refetch. Cancel any
    // in-flight list fetch first so a stale response can't clobber the optimistic entry.
    onSuccess: async (task) => {
      qc.setQueryData(['task', task.id], task);
      await qc.cancelQueries({ queryKey: ['tasks'] });
      qc.setQueriesData<Session[]>({ queryKey: ['tasks'] }, (old) =>
        old && !old.some((t) => t.id === task.id) ? [task, ...old] : old,
      );
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useUpdateTask = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string | null }) =>
      api.patch<Session>(`/api/tasks/${id}`, { name }),
    onSuccess: (task) => {
      qc.setQueryData(['task', task.id], task);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useStopTask = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/tasks/${id}/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

export const useArchiveTask = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/tasks/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

export const useDeleteTask = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

// The user's canvas arrangement (session placements + viewport + updatedAt). Served as
// an empty layout when nothing is stored, so the query never 404s. Polled so an agent
// arranging the canvas over MCP (set_canvas) shows up live; `updatedAt` lets the board
// tell an agent/other-tab rewrite apart from its own echoed save.
export const useCanvasLayout = () => {
  const api = useApiClient();
  return useQuery({
    queryKey: ['canvas-layout'],
    queryFn: () => api.get<CanvasLayoutResponse>('/api/canvas-layout'),
    refetchInterval: 2500,
    refetchOnWindowFocus: true,
  });
};

export const useUpdateCanvasLayout = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (layout: CanvasLayout) => api.put('/api/canvas-layout', layout),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas-layout'] }),
  });
};

export const useScheduledPrompts = () => {
  const api = useApiClient();
  return useQuery({ queryKey: ['scheduled-prompts'], queryFn: () => api.get<ScheduledPrompt[]>('/api/scheduled-prompts') });
};

export const useCreateScheduledPrompt = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduledPromptInput) => api.post<ScheduledPrompt>('/api/scheduled-prompts', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-prompts'] }),
  });
};

export const useUpdateScheduledPrompt = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<CreateScheduledPromptInput>) =>
      api.put<ScheduledPrompt>(`/api/scheduled-prompts/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-prompts'] }),
  });
};

export const useDeleteScheduledPrompt = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/scheduled-prompts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-prompts'] }),
  });
};

export const useWorkflows = () => {
  const api = useApiClient();
  return useQuery({ queryKey: ['workflows'], queryFn: () => api.get<Workflow[]>('/api/workflows') });
};

export const useCreateWorkflow = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkflowInput) => api.post<Workflow>('/api/workflows', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
};

export const useUpdateWorkflow = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & UpdateWorkflowInput) =>
      api.put<Workflow>(`/api/workflows/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
};

export const useDeleteWorkflow = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/workflows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
};

export const useRunWorkflow = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: string }) =>
      api.post<WorkflowRun>(`/api/workflows/${id}/run`, { input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-runs'] }),
  });
};

export const useWorkflowRuns = (workflowId?: string) => {
  const api = useApiClient();
  return useQuery({
    queryKey: ['workflow-runs', workflowId ?? 'all'],
    queryFn: () => api.get<WorkflowRun[]>(`/api/workflows/runs${workflowId ? `?workflowId=${workflowId}` : ''}`),
    refetchInterval: 5000,
  });
};

// A run's detail (definition + step tasks). Poll while the run is still executing
// so the graph animates step transitions; stop once it reaches a terminal status.
export const useWorkflowRun = (id: string) => {
  const api = useApiClient();
  return useQuery({
    queryKey: ['workflow-run', id],
    queryFn: () => api.get<WorkflowRunDetail>(`/api/workflows/runs/${id}`),
    refetchInterval: (query) => (query.state.data?.status === SessionStatus.RUNNING ? 2000 : false),
  });
};

// The per-user custom .env. The list view is masked; reveal is fetched on demand
// (not cached) so plaintext secrets only travel when the user explicitly asks.
export const useUserEnv = () => {
  const api = useApiClient();
  return useQuery({ queryKey: ['user-env'], queryFn: () => api.get<{ env: string }>('/api/user-env') });
};

export const useRevealUserEnv = () => {
  const api = useApiClient();
  return useCallback(() => api.get<{ env: string }>('/api/user-env/reveal'), [api]);
};

export const useUpdateUserEnv = () => {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (env: string) => api.put('/api/user-env', { env }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-env'] }),
  });
};
