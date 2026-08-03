import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { SessionStatus, type Session } from '@sagewright/shared';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionsListPage } from './SessionsListPage';
import { PREFERENCES_STORAGE_KEY } from '../preferences/model';
import { UserPreferencesProvider } from '../preferences/UserPreferencesProvider';

const navigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

const task = (overrides: Partial<Session>): Session => ({
  id: 't1',
  kind: 'interactive',
  name: 'My session',
  prompt: null,
  runnerImage: null,
  status: SessionStatus.RUNNING,
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

// Serves the tasks list plus the runners lookup the RunnerChip needs; mutations
// echo a task back. Pass a recorder to assert on specific calls.
const stubApi = (
  tasks: Session[],
  onCall?: (url: string, init?: RequestInit) => void,
) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    onCall?.(url, init);
    if (url.startsWith('/api/runners'))
      return jsonResponse({ runners: [], defaultImage: null });
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
    vi.unstubAllEnvs();
    navigate.mockReset();
    localStorage.clear();
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

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

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

  it('omits the delete button when the build disallows session deletion', async () => {
    vi.stubEnv('VITE_ALLOW_SESSION_DELETION', 'false');
    stubApi([task({ id: 't1', name: 'Archived one', archivedAt: '2026-01-01' })]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

    await waitFor(() => expect(screen.getByText('Archived one')).toBeTruthy());
    const row = screen
      .getByText('Archived one')
      .closest('.MuiDataGrid-row') as HTMLElement;
    expect(
      within(row).queryByRole('button', { name: /delete session/i }),
    ).toBeNull();
  });

  it('switches from mine to all sessions via the scope toggle', async () => {
    const fetchMock = stubApi([task({ id: 't1', name: 'My session' })]);
    renderPage();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tasks?mine=1',
        expect.anything(),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/tasks', expect.anything()),
    );
  });

  it('only shows the owner column in all-sessions scope', async () => {
    stubApi([task({ id: 't1', name: 'My session' })]);
    renderPage();

    await waitFor(() => expect(screen.getByText('My session')).toBeTruthy());
    expect(
      screen.queryByRole('columnheader', { name: /owner/i }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() =>
      expect(
        screen.getByRole('columnheader', { name: /owner/i }),
      ).toBeTruthy(),
    );
  });

  it('hides actions on sessions owned by other users in all scope', async () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ displayName: 'u1' }),
    );
    stubApi([
      task({ id: 't1', name: 'My session', createdBy: 'u1' }),
      task({ id: 't2', name: 'Their session', createdBy: 'u2' }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('My session')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(screen.getByText('Their session')).toBeTruthy());

    const ownRow = screen
      .getByText('My session')
      .closest('.MuiDataGrid-row') as HTMLElement;
    const otherRow = screen
      .getByText('Their session')
      .closest('.MuiDataGrid-row') as HTMLElement;

    expect(
      within(ownRow).getByRole('button', { name: /rename session/i }),
    ).toBeTruthy();
    expect(
      within(otherRow).queryByRole('button', { name: /rename session/i }),
    ).toBeNull();
  });
});
