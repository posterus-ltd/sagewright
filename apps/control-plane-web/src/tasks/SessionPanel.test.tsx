import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogProvider } from '../components/ConfirmDialogProvider';
import { SessionPanel } from './SessionPanel';

const task = {
  id: 't1',
  mode: 'interactive',
  prompt: 'fix the bug',
  status: 'queued',
  branch: null,
  prUrl: null,
  createdBy: 'al',
  containerId: null,
  scheduledPromptId: null,
  archivedAt: null,
  createdAt: new Date().toISOString(),
};

// Minimal EventSource stub — useTaskStream opens one on mount.
class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener() {}
  close() {}
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
    </QueryClientProvider>
  );
};

describe('SessionPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('EventSource', FakeEventSource as never);
  });

  it('disables the terminals and explains why when the session has no running container', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    render(<SessionPanel taskId="t1" />, { wrapper });

    // Agent tab is selected by default; with no container it shows the unavailable note.
    await waitFor(() => expect(screen.getByText(/agent terminal is unavailable/i)).toBeTruthy());
    expect((screen.getByRole('tab', { name: 'Agent' }) as HTMLButtonElement).disabled).toBe(true);
    // Stop appears once the (non-terminal) task has loaded; await its async render.
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeTruthy();
  });

  it('defaults to the log view once the session has stopped', async () => {
    // A stopped (terminal) session has no container, so the agent/shell PTYs are gone —
    // neither can be the active tab, so the panel falls back to the log instead of opening
    // on the disabled agent tab with its "unavailable" note.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...task, status: 'done' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    render(<SessionPanel taskId="t1" />, { wrapper });

    const logTab = await screen.findByRole('tab', { name: 'Log' });
    await waitFor(() => expect(logTab.getAttribute('aria-selected')).toBe('true'));
    expect(screen.queryByText(/agent terminal is unavailable/i)).toBeNull();
  });

  it('confirms before stopping, then invokes onStopped once the request succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    const onStopped = vi.fn();

    render(<SessionPanel taskId="t1" onStopped={onStopped} />, { wrapper });

    // Clicking Stop only opens the confirmation — it does not stop on its own.
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    const dialog = await screen.findByRole('dialog');
    expect(onStopped).not.toHaveBeenCalled();

    // Confirming inside the dialog triggers the stop request.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(onStopped).toHaveBeenCalledTimes(1));
  });

  it('does not stop when the confirmation is cancelled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    const onStopped = vi.fn();

    render(<SessionPanel taskId="t1" onStopped={onStopped} />, { wrapper });

    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onStopped).not.toHaveBeenCalled();
  });

  it('hides the stop control once the session has reached a terminal status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...task, status: 'stopped' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    render(<SessionPanel taskId="t1" />, { wrapper });

    await screen.findByRole('tab', { name: 'Agent' });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('hides the status badge and stop control in compact (widget) mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    render(<SessionPanel taskId="t1" compact />, { wrapper });

    await screen.findByRole('tab', { name: 'Agent' });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    // The verbose 'queued' status badge is gone; only the live/done/failed indicator remains.
    expect(screen.queryByText('queued')).toBeNull();
  });

  it('toggles fullscreen on the detail route via the fullscreen control', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    render(<SessionPanel taskId="t1" />, { wrapper });

    const enter = await screen.findByRole('button', { name: /enter fullscreen/i });
    fireEvent.click(enter);

    // Once expanded the control flips to its exit affordance.
    const exit = await screen.findByRole('button', { name: /exit fullscreen/i });
    fireEvent.click(exit);

    expect(await screen.findByRole('button', { name: /enter fullscreen/i })).toBeTruthy();
  });

  it('hides the fullscreen control in compact (widget) mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    render(<SessionPanel taskId="t1" compact />, { wrapper });

    await screen.findByRole('tab', { name: 'Agent' });
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });
});
