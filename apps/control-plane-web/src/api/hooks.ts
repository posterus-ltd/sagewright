import {
  RepoStatus,
  type CanvasLayout,
  type CreateScheduledPromptInput,
  type CreateSessionInput,
  type RepoWithStatus,
  type ScheduledPrompt,
  type Session,
  type UpdateWorkflowInput,
  type WorkerImage,
  type Workflow,
  type WorkflowInput,
  type WorkflowRun,
  type WorkflowRunDetail,
} from '@sagewright/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from './client';

export type GithubStatus =
  | { connected: false }
  | {
      connected: true;
      source: 'pat' | 'oauth';
      login: string;
      name: string | null;
      email: string;
      scopes: string[];
      missingRepoScope: boolean;
      updatedAt: string;
    };

export const useWorkers = () =>
  useQuery({
    queryKey: ['workers'],
    queryFn: () => apiClient.get<{ workers: WorkerImage[]; defaultImage: string | null }>('/api/workers'),
  });

export const useSetDefaultWorker = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (image: string) => apiClient.put('/api/settings/default-worker', { image }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workers'] }),
  });
};

export const useTasks = (mine: boolean) =>
  useQuery({ queryKey: ['tasks', mine], queryFn: () => apiClient.get<Session[]>(`/api/tasks${mine ? '?mine=1' : ''}`), refetchInterval: 5000 });

// Every session (including workflow parents/steps) for the galaxy visualization —
// unlike useTasks, not scoped to standalone sessions or a single user.
export const useTaskGraph = () =>
  useQuery({ queryKey: ['tasks', 'graph'], queryFn: () => apiClient.get<Session[]>('/api/tasks/graph'), refetchInterval: 5000 });

export const useTask = (id: string) =>
  useQuery({ queryKey: ['task', id], queryFn: () => apiClient.get<Session>(`/api/tasks/${id}`) });

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
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

// The user's canvas arrangement (session placements + viewport). Served as an
// empty layout when nothing is stored, so the query never 404s.
export const useCanvasLayout = () =>
  useQuery({ queryKey: ['canvas-layout'], queryFn: () => apiClient.get<CanvasLayout>('/api/canvas-layout') });

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
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 2000 : false),
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
