import { cleanup, fireEvent, render } from '@testing-library/react';
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
    // React logs caught errors to the console; silence it to keep test output
    // clean (the boundary's own console.error is asserted separately).
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children unchanged while healthy', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(getByText('all good')).toBeTruthy();
  });

  it('renders the fallback and logs when a child throws', () => {
    const { getByRole, getByText } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(getByRole('alert')).toBeTruthy();
    expect(getByText('SOMETHING BROKE')).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  });

  it('exposes the error message and stack in an expandable details block', () => {
    const { getByText, container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(getByText(/cat stacktrace\.log/)).toBeTruthy();
    const trace = container.querySelector('.error__trace');
    expect(trace?.textContent).toContain('kaboom from child');
  });

  it('reloads the page when "try again" is clicked', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    const { getByText } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.click(getByText(/try_again/));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('navigates home when "cd ~" is clicked', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });

    const { getByText } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.click(getByText(/cd ~/));
    expect(assign).toHaveBeenCalledWith('/');
  });
});
