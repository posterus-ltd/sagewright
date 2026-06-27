import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ScheduledPromptsPage,
  absoluteNextRun,
  relativeToNextRun,
} from './ScheduledPromptsPage';

const renderPage = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<ScheduledPromptsPage />, { wrapper: Wrapper });
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('relativeToNextRun', () => {
  // 6am "now" against a daily-9am cron is exactly three hours out. Both croner
  // and luxon read the same injected instant, so the result is timezone-stable.
  const now = new Date(2026, 5, 26, 6, 0, 0);

  it('describes the next execution relative to now', () => {
    expect(relativeToNextRun('0 9 * * *', now)).toBe('in 3 hours');
  });

  it('returns a dash when the cron is empty or invalid', () => {
    expect(relativeToNextRun('', now)).toBe('—');
    expect(relativeToNextRun('not a cron', now)).toBe('—');
  });
});

describe('absoluteNextRun', () => {
  const now = new Date(2026, 5, 26, 6, 0, 0);

  it('formats the next execution as a concrete date and time', () => {
    const result = absoluteNextRun('0 9 * * *', now);
    // The exact wording is locale-dependent, but it must name the day and a
    // 9-o'clock time — not a relative phrase.
    expect(result).toContain('2026');
    expect(result).toMatch(/9:00/);
    expect(result).not.toMatch(/^in /);
  });

  it('returns a dash when the cron is empty or invalid', () => {
    expect(absoluteNextRun('', now)).toBe('—');
    expect(absoluteNextRun('not a cron', now)).toBe('—');
  });
});

describe('ScheduledPromptsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists existing scheduled prompts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse([
          {
            id: 'p1',
            cron: '0 9 * * *',
            prompt: 'Daily standup',
            enabled: true,
            lastRunAt: null,
            createdAt: '',
          },
        ]),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('0 9 * * *')).toBeTruthy());
    expect(screen.getByText('Daily standup')).toBeTruthy();
  });

  it('shows the absolute next-run time in the column', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse([
          {
            id: 'p1',
            cron: '0 9 * * *',
            prompt: 'Daily standup',
            enabled: true,
            lastRunAt: null,
            createdAt: '',
          },
        ]),
      ),
    );

    const { container } = renderPage();

    // The cell now renders an absolute clock time (HH:MM); the relative
    // countdown lives in the hover tooltip, not the cell text.
    await waitFor(() => {
      const cell = container.querySelector(
        '.MuiDataGrid-row [data-field="nextRun"]',
      );
      expect(cell?.textContent).toMatch(/\d{1,2}:\d{2}/);
      expect(cell?.textContent).not.toMatch(/^in /);
    });
  });

  it('creates a scheduled prompt through the add dialog', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({
          id: 'p2',
          cron: '0 0 * * *',
          prompt: 'Nightly',
          enabled: true,
          lastRunAt: null,
          createdAt: '',
        });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    fireEvent.click(
      screen.getByRole('button', { name: /new scheduled task/i }),
    );

    fireEvent.change(screen.getByRole('textbox', { name: /cron/i }), {
      target: { value: '0 0 * * *' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Nightly' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/scheduled-prompts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            cron: '0 0 * * *',
            prompt: 'Nightly',
            enabled: true,
          }),
        }),
      ),
    );
  });

  it('creates a scheduled prompt with the selected worker', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/workers') {
        return jsonResponse({
          workers: [
            { id: 'codex', image: 'sagewright-worker-codex:latest', name: 'Codex', description: 'OpenAI Codex harness' },
          ],
          defaultImage: null,
        });
      }
      if (init?.method === 'POST') {
        return jsonResponse({
          id: 'p3',
          cron: '0 0 * * *',
          prompt: 'Nightly',
          enabled: true,
          workerImage: 'sagewright-worker-codex:latest',
          lastRunAt: null,
          createdAt: '',
        });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /new scheduled task/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /cron/i }), {
      target: { value: '0 0 * * *' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Nightly' },
    });

    // Pin a specific worker for this task instead of inheriting the default.
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: /worker/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'Codex' }));

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/scheduled-prompts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            cron: '0 0 * * *',
            prompt: 'Nightly',
            enabled: true,
            workerImage: 'sagewright-worker-codex:latest',
          }),
        }),
      ),
    );
  });

  it('shows the worker name for a scheduled prompt in the list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/workers') {
          return jsonResponse({
            workers: [
              { id: 'codex', image: 'sagewright-worker-codex:latest', name: 'Codex', description: '' },
            ],
            defaultImage: null,
          });
        }
        return jsonResponse([
          {
            id: 'p1',
            cron: '0 9 * * *',
            prompt: 'Daily standup',
            enabled: true,
            workerImage: 'sagewright-worker-codex:latest',
            lastRunAt: null,
            createdAt: '',
          },
        ]);
      }),
    );

    renderPage();

    // The list resolves the stored image ref to the worker's friendly name.
    await waitFor(() => expect(screen.getByText('Codex')).toBeTruthy());
  });

  it('toggles a scheduled prompt off via the status switch', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return jsonResponse({
          id: 'p1',
          cron: '0 9 * * *',
          prompt: 'Daily standup',
          enabled: false,
          lastRunAt: null,
          createdAt: '',
        });
      }
      return jsonResponse([
        {
          id: 'p1',
          cron: '0 9 * * *',
          prompt: 'Daily standup',
          enabled: true,
          lastRunAt: null,
          createdAt: '',
        },
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    const toggle = await screen.findByRole('switch', { name: /toggle p1/i });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/scheduled-prompts/p1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ enabled: false }),
        }),
      ),
    );
  });

  it('reflects a disabled prompt as an off switch in a dimmed row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse([
          {
            id: 'p1',
            cron: '0 9 * * *',
            prompt: 'Daily standup',
            enabled: false,
            lastRunAt: null,
            createdAt: '',
          },
        ]),
      ),
    );

    const { container } = renderPage();

    const toggle = await screen.findByRole('switch', { name: /toggle p1/i });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(container.querySelector('.MuiDataGrid-row.disabled')).toBeTruthy();
  });

  it('edits a scheduled prompt through the edit dialog', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return jsonResponse({
          id: 'p1',
          cron: '0 8 * * *',
          prompt: 'Updated',
          enabled: true,
          lastRunAt: null,
          createdAt: '',
        });
      }
      return jsonResponse([
        {
          id: 'p1',
          cron: '0 9 * * *',
          prompt: 'Daily standup',
          enabled: true,
          lastRunAt: null,
          createdAt: '',
        },
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /edit p1/i })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: /edit p1/i }));

    // Dialog opens pre-filled with the existing values.
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(
      'Daily standup',
    );

    fireEvent.change(screen.getByRole('textbox', { name: /cron/i }), {
      target: { value: '0 8 * * *' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/scheduled-prompts/p1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ cron: '0 8 * * *', prompt: 'Updated' }),
        }),
      ),
    );
  });
});
