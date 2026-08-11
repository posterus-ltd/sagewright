import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogProvider } from '../components/ConfirmDialogProvider';
import { UserPreferencesProvider } from '../preferences/UserPreferencesProvider';
import { SessionPanel } from './SessionPanel';

// xterm needs a real renderer; stub the terminal components so live sessions
// (which mount them) can render under jsdom.
vi.mock('./Terminal', () => ({ Terminal: () => <div data-testid="terminal" /> }));
vi.mock('./TranscriptTerminal', () => ({ TranscriptTerminal: () => <div data-testid="transcript" /> }));

const task = {
  id: 't1',
  kind: 'interactive',
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
      <UserPreferencesProvider>
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </UserPreferencesProvider>
    </QueryClientProvider>
  );
};

describe('SessionPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('EventSource', FakeEventSource as never);
  });

  it('shows a launching spinner while the session is queued/provisioning', async () => {
    // The base fixture is 'queued': a just-created session hasn't got a container yet, so
    // the body shows a launching spinner rather than the "no running container" note.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    render(<SessionPanel taskId="t1" />, { wrapper });

    expect(await screen.findByText(/launching session/i)).toBeTruthy();
    expect(screen.queryByText(/agent terminal is unavailable/i)).toBeNull();
    // Stop still appears — a launching (non-terminal) session is stoppable.
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeTruthy();
  });

  it('disables the terminals and explains why when a running session has no container', async () => {
    // A non-terminal session that isn't launching but has lost its container (e.g. running
    // with the box gone) falls through to the unavailable note, not the launching spinner.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...task, status: 'running' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    render(<SessionPanel taskId="t1" />, { wrapper });

    // Agent tab is selected by default; with no container it shows the unavailable note.
    await waitFor(() => expect(screen.getByText(/agent terminal is unavailable/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Agent' }) as HTMLButtonElement).disabled).toBe(true);
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

    const logTab = await screen.findByRole('button', { name: 'Log' });
    await waitFor(() => expect(logTab.getAttribute('aria-pressed')).toBe('true'));
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

    await screen.findByRole('button', { name: 'Agent' });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('hides the status badge and stop control in compact (widget) mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    render(<SessionPanel taskId="t1" compact />, { wrapper });

    await screen.findByRole('button', { name: 'Agent' });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    // The verbose 'queued' status badge is gone; only the live/done/failed indicator remains.
    expect(screen.queryByText('queued')).toBeNull();
    // The quick actions bar is still there, inline next to the view switcher —
    // CSS reveals the controls cluster on hover, which jsdom can't exercise.
    expect(screen.getByRole('toolbar', { name: 'Quick actions' })).toBeTruthy();
  });

  it.each(['scheduled', 'workflow_step'])(
    'shows the transcript tab (not agent) for a headless %s session',
    async (kind) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify({ ...task, kind }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
        ),
      );

      render(<SessionPanel taskId="t1" />, { wrapper });

      expect(await screen.findByRole('button', { name: 'Transcript' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Agent' })).toBeNull();
    },
  );

  it('toggles fullscreen on the detail route via the fullscreen control', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    render(<SessionPanel taskId="t1" />, { wrapper });

    const fullscreen = await screen.findByRole('button', { name: /^fullscreen$/i });
    fireEvent.click(fullscreen);

    const stillFullscreen = await screen.findByRole('button', { name: /^fullscreen$/i });
    fireEvent.click(stillFullscreen);

    expect(await screen.findByRole('button', { name: /^fullscreen$/i })).toBeTruthy();
  });

  it('shows the quick actions bar on the detail route, with input actions disabled while no PTY is live', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    render(<SessionPanel taskId="t1" />, { wrapper });

    await screen.findByRole('toolbar', { name: 'Quick actions' });
    // No running container → nothing can be typed into the agent PTY.
    expect((screen.getByRole('button', { name: 'Surprise me' }) as HTMLButtonElement).disabled).toBe(true);
    // Customizing is not input, so it stays available.
    expect((screen.getByRole('button', { name: 'Customize quick actions' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('hides the quick actions bar for headless sessions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...task, kind: 'scheduled' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    render(<SessionPanel taskId="t1" />, { wrapper });

    await screen.findByRole('button', { name: 'Transcript' });
    expect(screen.queryByRole('toolbar', { name: 'Quick actions' })).toBeNull();
  });

  it('hides the fullscreen control in compact (widget) mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(task), { status: 200, headers: { 'content-type': 'application/json' } })),
    );

    render(<SessionPanel taskId="t1" compact />, { wrapper });

    await screen.findByRole('button', { name: 'Agent' });
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });
});
