import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSaveRepos, useTasks, useUpdateCanvasLayout } from './hooks';

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('useTasks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns tasks data from the api', async () => {
    const mockTasks = [
      {
        id: 'task-1',
        kind: 'interactive',
        prompt: null,
        status: 'queued',
        branch: null,
        prUrl: null,
        createdBy: 'user-1',
        containerId: null,
        scheduledPromptId: null,
        createdAt: new Date().toISOString(),
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(mockTasks), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    const { result } = renderHook(() => useTasks(true), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockTasks);
  });
});

describe('useSaveRepos', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('issues a PUT with the URL list to the repos endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveRepos(), { wrapper: createWrapper() });
    await result.current.mutateAsync(['https://github.com/a/b']);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/repos',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ urls: ['https://github.com/a/b'] }) }),
    );
  });
});

describe('useUpdateCanvasLayout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('issues a PUT with the layout to the canvas-layout endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const layout = { placements: [{ sessionId: 's1', x: 1, y: 2 }], viewport: { x: 0, y: 0, zoom: 1 } };
    const { result } = renderHook(() => useUpdateCanvasLayout(), { wrapper: createWrapper() });
    await result.current.mutateAsync(layout);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/canvas-layout',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(layout) }),
    );
  });
});

