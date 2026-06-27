import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewSessionButton } from './NewSessionButton';

const mutateAsync = vi.hoisted(() => vi.fn(async () => ({ id: 't1' })));
const workersData = vi.hoisted(() => ({
  current: {
    workers: [
      { id: 'opencode', image: 'sagewright-worker-opencode:latest', name: 'Opencode', description: 'Default' },
      { id: 'other', image: 'other:latest', name: 'Other', description: '' },
    ] as Array<{ id: string; image: string; name: string; description: string }>,
    defaultImage: 'sagewright-worker-opencode:latest' as string | null,
  },
}));

vi.mock('../api/hooks', () => ({
  useWorkers: () => ({ data: workersData.current }),
  useCreateSession: () => ({ mutateAsync, isPending: false }),
}));

describe('NewSessionButton', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    workersData.current = {
      workers: [
        { id: 'opencode', image: 'sagewright-worker-opencode:latest', name: 'Opencode', description: 'Default' },
        { id: 'other', image: 'other:latest', name: 'Other', description: '' },
      ],
      defaultImage: 'sagewright-worker-opencode:latest',
    };
  });

  it('renders the primary "New session" button', () => {
    render(<NewSessionButton onCreated={() => {}} />);
    expect(screen.getByText('New session')).toBeTruthy();
  });

  it('clicking primary launches the default worker explicitly and calls onCreated', async () => {
    const onCreated = vi.fn();
    render(<NewSessionButton onCreated={onCreated} />);

    fireEvent.click(screen.getByText('New session'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ workerImage: 'sagewright-worker-opencode:latest' });
      expect(onCreated).toHaveBeenCalledWith({ id: 't1' });
    });
  });

  it('opening the caret menu shows both worker names; the default is marked selected', () => {
    render(<NewSessionButton onCreated={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'more options' }));

    expect(screen.getByText('Opencode')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();

    // The default option should be marked aria-selected="true"
    const defaultItem = screen.getByText('Opencode').closest('[aria-selected="true"]');
    expect(defaultItem).not.toBeNull();
  });

  it('selecting "Other" calls mutateAsync with the correct workerImage and then onCreated', async () => {
    const onCreated = vi.fn();
    render(<NewSessionButton onCreated={onCreated} />);

    fireEvent.click(screen.getByRole('button', { name: 'more options' }));
    fireEvent.click(screen.getByText('Other'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ workerImage: 'other:latest' });
      expect(onCreated).toHaveBeenCalledWith({ id: 't1' });
    });
  });

  it('disables the button when there are no worker images', () => {
    workersData.current = { workers: [], defaultImage: 'sagewright-worker-opencode:latest' };
    render(<NewSessionButton onCreated={() => {}} />);

    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    buttons.forEach((btn) => expect(btn.disabled).toBe(true));

    fireEvent.click(screen.getByText('New session'));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('launches the top worker when the configured default is not an available image', async () => {
    workersData.current = {
      workers: [
        { id: 'alpha', image: 'alpha:latest', name: 'Alpha', description: '' },
        { id: 'beta', image: 'beta:latest', name: 'Beta', description: '' },
      ],
      // Operator fallback that was never built — must not be launched.
      defaultImage: 'sagewright-worker-opencode:latest',
    };
    render(<NewSessionButton onCreated={() => {}} />);

    fireEvent.click(screen.getByText('New session'));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ workerImage: 'alpha:latest' });
    });
  });
});
