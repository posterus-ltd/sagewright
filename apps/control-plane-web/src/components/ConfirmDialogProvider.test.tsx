import { Button } from '@mui/material';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ButtonType, ConfirmDialogProvider, useConfirmation } from './ConfirmDialogProvider';

const Trigger = ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel?: () => void }) => {
  const { confirm } = useConfirmation();
  return (
    <Button
      onClick={() =>
        confirm({
          title: 'Stop this session?',
          content: 'Stopping ends the running container.',
          buttons: [
            { label: 'Cancel', onClick: onCancel },
            { label: 'Stop', type: ButtonType.DANGER, onClick: onConfirm },
          ],
        })
      }
    >
      Open
    </Button>
  );
};

describe('ConfirmDialogProvider', () => {
  it('opens the dialog and runs the chosen button onClick, then closes', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialogProvider>
        <Trigger onConfirm={onConfirm} />
      </ConfirmDialogProvider>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Stop this session?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('runs the cancel button onClick without running confirm', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialogProvider>
        <Trigger onConfirm={onConfirm} onCancel={onCancel} />
      </ConfirmDialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('throws if useConfirmation is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger onConfirm={vi.fn()} />)).toThrow(/ConfirmDialogProvider/);
    spy.mockRestore();
  });
});
