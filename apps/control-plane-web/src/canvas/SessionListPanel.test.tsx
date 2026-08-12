import { type Session } from '@sagewright/shared';
import { SessionStatus } from '@sagewright/shared';
import type { Node } from '@xyflow/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SessionNodeData } from './canvas-actions';
import { SessionListPanel } from './SessionListPanel';

const node = (id: string, borderColor?: string): Node<SessionNodeData> =>
  ({
    id,
    type: 'session',
    position: { x: 0, y: 0 },
    data: { sessionId: id, borderColor },
  }) as Node<SessionNodeData>;

const task = (id: string, name: string, status: SessionStatus): Session =>
  ({ id, name, status }) as Session;

const nodes = [node('a', '#3fb950'), node('b', '#58a6ff')];
const tasks = [
  task('a', 'Alpha session', SessionStatus.RUNNING),
  task('b', 'Beta session', SessionStatus.DONE),
];

describe('SessionListPanel', () => {
  it('renders a row per session with its name and status chip', () => {
    render(<SessionListPanel nodes={nodes} tasks={tasks} onSelect={vi.fn()} />);

    expect(screen.getByText('Alpha session')).toBeTruthy();
    expect(screen.getByText('Beta session')).toBeTruthy();
    expect(screen.getByText(SessionStatus.RUNNING)).toBeTruthy();
    expect(screen.getByText(SessionStatus.DONE)).toBeTruthy();
  });

  it('calls onSelect with the session id when a row is clicked', () => {
    const onSelect = vi.fn();
    render(
      <SessionListPanel nodes={nodes} tasks={tasks} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByText('Beta session'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('collapses and expands the list via the header toggle', () => {
    render(<SessionListPanel nodes={nodes} tasks={tasks} onSelect={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /collapse session list/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(
      screen
        .getByRole('button', { name: /expand session list/i })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('renders nothing when the board is empty', () => {
    const { container } = render(
      <SessionListPanel nodes={[]} tasks={tasks} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
