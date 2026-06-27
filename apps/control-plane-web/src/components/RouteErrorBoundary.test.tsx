import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RouteErrorBoundary } from './RouteErrorBoundary';

/** A route element that throws on render to trip the router error path. */
const Boom = (): never => {
  throw new Error('kaboom from route');
};

/** Render a memory router whose route throws, guarded by RouteErrorBoundary. */
const renderThrowingRoute = () => {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Boom />,
      errorElement: <RouteErrorBoundary />,
    },
  ]);
  return render(<RouterProvider router={router} />);
};

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    // react-router logs the caught error; silence it to keep output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the fallback when a route element throws', () => {
    renderThrowingRoute();

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('reveals the route error message when details are expanded', () => {
    renderThrowingRoute();

    fireEvent.click(screen.getByText('Show error details'));
    expect(screen.getByText(/kaboom from route/)).toBeTruthy();
  });
});
