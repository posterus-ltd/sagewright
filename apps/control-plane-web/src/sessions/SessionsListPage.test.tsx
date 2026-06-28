import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { TaskStatus, type Task } from '@sagewright/shared';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionsListPage } from './SessionsListPage';
import { UserPreferencesProvider } from '../preferences/UserPreferencesProvider';

const navigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

const task = (overrides: Partial<Task>): Task => ({
  id: 't1',
  mode: 'interactive',
  name: 'My session',
  prompt: null,
  workerImage: null,
  status: TaskStatus.RUNNING,
  branch: null,
  prUrl: null,
  createdBy: 'u1',
  containerId: null,
  scheduledPromptId: null,
  archivedAt: null,
  createdAt: '',
  ...overrides,
});

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

// Serves the tasks list plus the workers lookup the WorkerChip needs; mutations
// echo a task back. Pass a recorder to assert on specific calls.
const stubApi = (
  tasks: Task[],
  onCall?: (url: string, init?: RequestInit) => void,
) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    onCall?.(url, init);
    if (url.startsWith('/api/workers'))
      return jsonResponse({ workers: [], defaultImage: null });
    if (init && init.method && init.method !== 'GET')
      return jsonResponse(tasks[0]);
    return jsonResponse(tasks);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderPage = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <UserPreferencesProvider>{children}</UserPreferencesProvider>
    </QueryClientProvider>
  );
  return render(<SessionsListPage />, { wrapper: Wrapper });
};

describe('SessionsListPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
  });

  it('lists active sessions and navigates on row click', async () => {
    stubApi([task({ id: 't1', name: 'My session' })]);
    renderPage();

    await waitFor(() => expect(screen.getByText('My session')).toBeTruthy());
    fireEvent.click(screen.getByText('My session'));
    expect(navigate).toHaveBeenCalledWith('/tasks/t1');
  });

  it('renames a session inline', async () => {
    const fetchMock = stubApi([task({ id: 't1', name: 'Old name' })]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Old name')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /rename session/i }));

    const input = screen.getByRole('textbox', { name: /session name/i });
    fireEvent.change(input, { target: { value: 'New name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tasks/t1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'New name' }),
        }),
      ),
    );
    // Renaming the row should not also navigate into it.
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers a permanent delete on the archived tab', async () => {
    const fetchMock = stubApi([
      task({ id: 't1', name: 'Archived one', archivedAt: '2026-01-01' }),
    ]);
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: /archived/i }));

    await waitFor(() => expect(screen.getByText('Archived one')).toBeTruthy());
    const row = screen
      .getByText('Archived one')
      .closest('.MuiDataGrid-row') as HTMLElement;
    fireEvent.click(
      within(row).getByRole('button', { name: /delete session/i }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tasks/t1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
