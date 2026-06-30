import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette } from './CommandPalette';

const task = (id: string, prompt: string | null) => ({
  id,
  kind: 'interactive',
  prompt,
  status: 'running',
  branch: null,
  prUrl: null,
  createdBy: 'u1',
  containerId: null,
  scheduledPromptId: null,
  archivedAt: null,
  createdAt: new Date().toISOString(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const renderPalette = (props?: { onClose?: () => void; onNewScheduledTask?: () => void }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(
    <CommandPalette onClose={props?.onClose ?? (() => {})} onNewScheduledTask={props?.onNewScheduledTask ?? (() => {})} />,
    { wrapper },
  );
};

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the root quick actions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])));
    renderPalette();

    expect(await screen.findByText('New session')).toBeTruthy();
    expect(screen.getByText('Open session…')).toBeTruthy();
    expect(screen.getByText('Schedule a task')).toBeTruthy();
  });

  it('lists a "New session (Name)" action per non-default worker; the default is the plain entry', async () => {
    const workers = {
      workers: [
        { id: 'opencode', image: 'opencode:latest', name: 'Opencode', description: '' },
        { id: 'codex', image: 'codex:latest', name: 'Codex', description: '' },
      ],
      defaultImage: 'opencode:latest',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('/api/workers') ? json(workers) : json([]))),
    );
    renderPalette();

    expect(await screen.findByText('New session')).toBeTruthy();
    expect(await screen.findByText('New session (Codex)')).toBeTruthy();
    // The default worker is represented by the plain "New session", not a parenthesized entry.
    expect(screen.queryByText('New session (Opencode)')).toBeNull();
  });

  it('filters the root actions by the search query', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])));
    renderPalette();

    fireEvent.change(await screen.findByLabelText('Type a command'), { target: { value: 'sched' } });

    expect(screen.getByText('Schedule a task')).toBeTruthy();
    expect(screen.queryByText('New session')).toBeNull();
  });

  it('creates a session and navigates when "New session" is chosen', async () => {
    const created = task('new-1', null);
    const fetchMock = vi.fn(async (_url: string, opts?: RequestInit) =>
      opts?.method === 'POST' ? json(created, 201) : json([]),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPalette();

    fireEvent.click(await screen.findByText('New session'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'POST' })),
    );
  });

  it('invokes the scheduled-task callback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])));
    const onNewScheduledTask = vi.fn();
    renderPalette({ onNewScheduledTask });

    fireEvent.click(await screen.findByText('Schedule a task'));

    expect(onNewScheduledTask).toHaveBeenCalledOnce();
  });

  it('switches to session search and filters existing sessions by prompt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([task('t1', 'fix the login bug'), task('t2', 'write release notes')])));
    renderPalette();

    fireEvent.click(await screen.findByText('Open session…'));

    // Both sessions show until the query narrows them.
    expect(await screen.findByText('fix the login bug')).toBeTruthy();
    expect(screen.getByText('write release notes')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: 'login' } });

    expect(screen.getByText('fix the login bug')).toBeTruthy();
    expect(screen.queryByText('write release notes')).toBeNull();
  });
});
