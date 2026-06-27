import { fireEvent, render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

/** A child that throws on render to trip the boundary. */
const Boom = (): never => {
  throw new Error('kaboom from child');
};

describe('ErrorBoundary', () => {
  let consoleError: MockInstance;

  beforeEach(() => {
    // React logs caught errors to the console; silence it so the test output
    // stays clean (the boundary's own console.error is asserted separately).
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children unchanged while healthy', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('renders the fallback and logs when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  });

  it('reveals the error message and stack when details are expanded', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('Show error details'));
    expect(screen.getByText(/kaboom from child/)).toBeTruthy();
  });

  it('reloads the page when "Try again" is clicked', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('Try again'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('navigates home when "Go home" is clicked', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('Go home'));
    expect(assign).toHaveBeenCalledWith('/');
  });
});
