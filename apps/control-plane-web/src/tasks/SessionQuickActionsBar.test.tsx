import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserPreferencesProvider } from '../preferences/UserPreferencesProvider';
import { PREFERENCES_STORAGE_KEY } from '../preferences/model';
import { SessionQuickActionsBar } from './SessionQuickActionsBar';

// Minimal Web Speech API stand-in — jsdom ships none, so tests drive the
// callbacks by hand through the captured instance.
class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  continuous = false;
  interimResults = true;
  lang = '';
  onresult: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn();
  abort = vi.fn();
  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <UserPreferencesProvider>{children}</UserPreferencesProvider>
);

const storedQuickActions = (): string[] | undefined =>
  (JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}') as {
    sessionQuickActions?: string[];
  }).sessionQuickActions;

describe('SessionQuickActionsBar', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    FakeSpeechRecognition.instances = [];
  });

  it('types the prompt into the terminal when an action is clicked', () => {
    const onTerminalInput = vi.fn();
    render(
      <SessionQuickActionsBar isTerminalInputAvailable onTerminalInput={onTerminalInput} />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Surprise me' }));

    expect(onTerminalInput).toHaveBeenCalledTimes(1);
    const [typed] = onTerminalInput.mock.calls[0] as [string];
    expect(typed.startsWith('Surprise me')).toBe(true);
    // Prompts submit themselves — they end with Enter.
    expect(typed.endsWith('\r')).toBe(true);
  });

  it('sends bare keys for accept and reject', () => {
    const onTerminalInput = vi.fn();
    render(
      <SessionQuickActionsBar isTerminalInputAvailable onTerminalInput={onTerminalInput} />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(onTerminalInput).toHaveBeenNthCalledWith(1, '\r');
    expect(onTerminalInput).toHaveBeenNthCalledWith(2, '\u001b');
  });

  it('disables every action while terminal input is unavailable', () => {
    render(
      <SessionQuickActionsBar isTerminalInputAvailable={false} onTerminalInput={vi.fn()} />,
      { wrapper },
    );

    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('removes an action via the customize popover and persists the preference', async () => {
    render(
      <SessionQuickActionsBar isTerminalInputAvailable onTerminalInput={vi.fn()} />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Customize quick actions' }));
    const checkbox = screen.getByRole('checkbox', { name: 'Show Execute' });
    fireEvent.click(checkbox);
    // Close the popover — its modal hides the toolbar from queries while open.
    fireEvent.keyDown(checkbox, { key: 'Escape' });

    const toolbar = await screen.findByRole('toolbar', { name: 'Quick actions' });
    expect(within(toolbar).queryByRole('button', { name: 'Execute' })).toBeNull();
    expect(storedQuickActions()).not.toContain('execute');
  });

  it('reorders actions via the customize popover', async () => {
    render(
      <SessionQuickActionsBar isTerminalInputAvailable onTerminalInput={vi.fn()} />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Customize quick actions' }));
    const moveUp = screen.getByRole('button', { name: 'Move Plan a spec up' });
    fireEvent.click(moveUp);
    // Close the popover — its modal hides the toolbar from queries while open.
    fireEvent.keyDown(moveUp, { key: 'Escape' });

    const toolbar = await screen.findByRole('toolbar', { name: 'Quick actions' });
    const [first] = within(toolbar).getAllByRole('button');
    expect(first?.getAttribute('aria-label')).toBe('Plan a spec');
    expect(storedQuickActions()?.[0]).toBe('plan-spec');
  });

  it('disables dictation when the browser has no speech recognition', () => {
    render(
      <SessionQuickActionsBar isTerminalInputAvailable onTerminalInput={vi.fn()} />,
      { wrapper },
    );

    expect((screen.getByRole('button', { name: 'Dictate' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('types final transcripts into the terminal while dictating', () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition as never);
    const onTerminalInput = vi.fn();
    render(
      <SessionQuickActionsBar isTerminalInputAvailable onTerminalInput={onTerminalInput} />,
      { wrapper },
    );

    const mic = screen.getByRole('button', { name: 'Dictate' });
    fireEvent.click(mic);

    const recognition = FakeSpeechRecognition.instances[0];
    expect(recognition?.start).toHaveBeenCalledTimes(1);
    expect(mic.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      recognition?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'hello agent' } }],
      });
    });
    expect(onTerminalInput).toHaveBeenCalledWith('hello agent');

    // The engine ending (silence timeout) resets the toggle.
    act(() => recognition?.onend?.());
    expect(mic.getAttribute('aria-pressed')).toBe('false');
  });
});
