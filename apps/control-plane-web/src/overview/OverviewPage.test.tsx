import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SessionStatus, type Session } from '@sagewright/shared';
import { DateTime } from 'luxon';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OverviewPage } from './OverviewPage';
import { UserPreferencesProvider } from '../preferences/UserPreferencesProvider';

const navigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

// The component reads the real wall clock, so fixtures anchor to it rather
// than a fixed date — otherwise they'd silently fall outside the trailing
// 7-day window the metrics sections filter on.
const recently = (daysAgo: number): string =>
  DateTime.now().minus({ days: daysAgo }).toISO()!;

const task = (overrides: Partial<Session> = {}): Session => ({
  id: 't1',
  kind: 'interactive',
  name: 'A session',
  prompt: null,
  workerImage: null,
  status: SessionStatus.RUNNING,
  branch: null,
  prUrl: null,
  createdBy: 'alice',
  containerId: null,
  scheduledPromptId: null,
  parentSessionId: null,
  workflowId: null,
  workflowStepKey: null,
  currentStepKey: null,
  iteration: null,
  error: null,
  archivedAt: null,
  startedAt: null,
  endedAt: null,
  createdAt: recently(1),
  updatedAt: recently(1),
  ...overrides,
});

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const stubApi = (tasks: Session[], workers: { id: string; image: string; name: string; description: string }[] = []) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/workers'))
        return jsonResponse({ workers, defaultImage: null });
      return jsonResponse(tasks);
    }),
  );
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
  return render(<OverviewPage />, { wrapper: Wrapper });
};

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
  });

  it('shows status group counts across every user, excluding archived sessions', async () => {
    stubApi([
      task({ id: 't1', status: SessionStatus.RUNNING, createdBy: 'alice' }),
      task({ id: 't2', status: SessionStatus.RUNNING, createdBy: 'bob' }),
      task({ id: 't3', status: SessionStatus.NEEDS_ASSISTANCE }),
      task({ id: 't4', status: SessionStatus.DONE, archivedAt: recently(1) }),
    ]);
    renderPage();

    // Counts default to 0 before the fetch resolves, so wait on the loaded
    // value rather than a label that's present from the very first render.
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy()); // Running count
    // Archived session excluded — "Done" tile (status-group, not throughput) stays at 0.
    const doneLabel = screen.getByText('Done');
    expect(doneLabel.previousSibling?.textContent).toBe('0');
  });

  it('lists sessions needing attention and navigates to the task on click', async () => {
    stubApi([
      task({ id: 't1', name: 'Stuck session', status: SessionStatus.NEEDS_ASSISTANCE }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Stuck session')).toBeTruthy());
    fireEvent.click(screen.getByText('Stuck session'));
    expect(navigate).toHaveBeenCalledWith('/tasks/t1');
  });

  it('shows an empty state when nothing needs attention', async () => {
    stubApi([task({ id: 't1', status: SessionStatus.RUNNING })]);
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('Nothing needs attention right now.'),
      ).toBeTruthy(),
    );
  });

  it('summarizes this week’s throughput and success rate', async () => {
    stubApi([
      task({ id: 't1', status: SessionStatus.DONE, endedAt: recently(1) }),
      task({ id: 't2', status: SessionStatus.DONE, endedAt: recently(2) }),
      task({ id: 't3', status: SessionStatus.FAILED, endedAt: recently(1) }),
    ]);
    renderPage();

    // "Failed" also labels a status-group tile elsewhere on the page, so scope
    // these queries to the "This week" section to avoid an ambiguous match.
    const section = (
      await screen.findByText('This week (last 7 days)')
    ).closest('.MuiStack-root') as HTMLElement;
    await waitFor(() => expect(within(section).getByText('67%')).toBeTruthy());
    expect(within(section).getByText('Completed').previousSibling?.textContent).toBe('2');
    expect(within(section).getByText('Failed').previousSibling?.textContent).toBe('1');
  });

  it('lists recently shipped PRs with a link out, and navigates on click', async () => {
    stubApi([
      task({
        id: 't1',
        name: 'Shipped session',
        status: SessionStatus.DONE,
        prUrl: 'https://github.com/acme/repo/pull/42',
        endedAt: recently(1),
      }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Shipped session')).toBeTruthy());
    expect(screen.getByRole('link', { name: 'View PR' })).toHaveProperty(
      'href',
      'https://github.com/acme/repo/pull/42',
    );
    fireEvent.click(screen.getByText('Shipped session'));
    expect(navigate).toHaveBeenCalledWith('/tasks/t1');
  });

  it('shows an empty state when nothing has shipped', async () => {
    stubApi([task({ id: 't1', status: SessionStatus.RUNNING })]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByText('No PRs shipped yet.')).toBeTruthy(),
    );
  });

  it('tallies worker utilization and teammate activity over the last week', async () => {
    stubApi(
      [
        task({ id: 't1', createdBy: 'alice', workerImage: 'sagewright-worker-claude-code' }),
        task({ id: 't2', createdBy: 'alice', workerImage: 'sagewright-worker-claude-code' }),
        task({ id: 't3', createdBy: 'bob', workerImage: 'sagewright-worker-codex' }),
      ],
      [
        { id: 'claude-code', image: 'sagewright-worker-claude-code', name: 'Claude Code', description: '' },
        { id: 'codex', image: 'sagewright-worker-codex', name: 'Codex', description: '' },
      ],
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Claude Code')).toBeTruthy());
    expect(screen.getByText('Claude Code').nextSibling?.textContent).toBe('2');
    expect(screen.getByText('alice').nextSibling?.textContent).toBe('2');
    expect(screen.getByText('bob').nextSibling?.textContent).toBe('1');
  });
});
