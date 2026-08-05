import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const login = vi.fn();
const navigate = vi.fn();
const enqueueSnackbar = vi.fn();

vi.mock('./useAuth', () => ({ useAuth: () => ({ login }) }));
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar }) }));

// Imported after the mocks are registered so the component picks them up.
import { LoginPage } from './LoginPage';

const typeInto = (label: RegExp, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset();
    navigate.mockReset();
    enqueueSnackbar.mockReset();
  });

  it('renders the sign-in form and the marketing panel', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/username/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
    // Branding is present so mobile users (form-only) still see the wordmark.
    expect(screen.getAllByText(/sagewright/i).length).toBeGreaterThan(0);
  });

  it('logs in with the entered credentials and navigates home on success', async () => {
    login.mockResolvedValueOnce(undefined);
    render(<LoginPage />);

    typeInto(/username/i, 'ada');
    typeInto(/password/i, 'hunter2');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('ada', 'hunter2'));
    expect(navigate).toHaveBeenCalledWith('/');
    expect(enqueueSnackbar).not.toHaveBeenCalled();
  });

  it('shows an error and stays put when login fails', async () => {
    login.mockRejectedValueOnce(new Error('nope'));
    render(<LoginPage />);

    typeInto(/username/i, 'ada');
    typeInto(/password/i, 'wrong');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith('Login failed', { variant: 'error' }),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('disables sign in until both fields have non-whitespace content', () => {
    render(<LoginPage />);
    const button = screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    typeInto(/username/i, 'ada');
    expect(button.disabled).toBe(true);

    typeInto(/password/i, '   ');
    expect(button.disabled).toBe(true);
  });

  it('submits on enter once the required fields are plausible', async () => {
    login.mockResolvedValueOnce(undefined);
    render(<LoginPage />);

    typeInto(/username/i, 'ada');
    typeInto(/password/i, 'hunter2');
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }).closest('form') as HTMLFormElement);

    await waitFor(() => expect(login).toHaveBeenCalledWith('ada', 'hunter2'));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('does not attempt to log in when submitted with blank or whitespace-only fields', () => {
    render(<LoginPage />);
    const form = screen.getByRole('button', { name: /sign in/i }).closest('form') as HTMLFormElement;

    fireEvent.submit(form);
    expect(login).not.toHaveBeenCalled();

    typeInto(/username/i, '   ');
    typeInto(/password/i, '   ');
    fireEvent.submit(form);
    expect(login).not.toHaveBeenCalled();
  });
});
