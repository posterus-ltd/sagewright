import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateAsync = vi.fn();
const enqueueSnackbar = vi.fn();

vi.mock('../api/hooks', () => ({ useChangePassword: () => ({ mutateAsync, isPending: false }) }));
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar }) }));

// Imported after the mocks are registered so the component picks them up.
import { ChangePasswordForm } from './ChangePasswordForm';

const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

const fillValid = (): void => {
  type('Current password', 'old-pass1');
  type('New password', 'new-pass1');
  type('Confirm new password', 'new-pass1');
};

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    enqueueSnackbar.mockReset();
  });

  it('keeps submit disabled until the current password and a valid new pair are entered', () => {
    render(<ChangePasswordForm submitLabel="Update password" />);
    const button = screen.getByRole('button', { name: 'Update password' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    type('Current password', 'old-pass1');
    type('New password', 'new-pass1');
    // Confirm still empty → the pair is invalid.
    expect(button.disabled).toBe(true);

    type('Confirm new password', 'new-pass1');
    expect(button.disabled).toBe(false);
  });

  it('will not submit a new password that fails the requirements', () => {
    render(<ChangePasswordForm submitLabel="Update password" />);
    type('Current password', 'old-pass1');
    // Long enough but no digit — invalid, so the button stays disabled.
    type('New password', 'letters-only');
    type('Confirm new password', 'letters-only');
    expect((screen.getByRole('button', { name: 'Update password' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits the current and new passwords and calls onSuccess', async () => {
    mutateAsync.mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();
    render(<ChangePasswordForm submitLabel="Update password" onSuccess={onSuccess} />);

    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ currentPassword: 'old-pass1', newPassword: 'new-pass1' }),
    );
    expect(enqueueSnackbar).toHaveBeenCalledWith('Password updated', { variant: 'success' });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('shows an error and does not call onSuccess when the change fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('bad current'));
    const onSuccess = vi.fn();
    render(<ChangePasswordForm submitLabel="Update password" onSuccess={onSuccess} />);

    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith(
        'Could not change password — check your current password',
        { variant: 'error' },
      ),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('renders extra actions passed by the caller', () => {
    render(<ChangePasswordForm submitLabel="Set password & continue" actions={<button type="button">Sign out</button>} />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set password & continue' })).toBeTruthy();
  });
});
