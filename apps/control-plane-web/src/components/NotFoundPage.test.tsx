import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/somewhere-lost' }),
}));

// Imported after the mocks are registered so the component picks them up.
import { NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  beforeEach(() => {
    navigate.mockReset();
    // usePrefersReducedMotion reads matchMedia, which jsdom doesn't implement.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  });

  it('shows the 404 heading and the attempted path', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('heading', { name: '404' })).toBeTruthy();
    expect(screen.getByText(/somewhere-lost/)).toBeTruthy();
  });

  it('navigates home when the button is clicked', () => {
    render(<NotFoundPage />);

    fireEvent.click(screen.getByRole('button', { name: /beam me home/i }));
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
