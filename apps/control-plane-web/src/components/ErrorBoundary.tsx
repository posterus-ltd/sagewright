import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorFallback } from './ErrorFallback';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  /** The caught error, or `null` while the subtree is healthy. */
  readonly error: Error | null;
  /** React's component stack, captured alongside the error for context. */
  readonly componentStack: string | null;
}

const INITIAL_STATE: ErrorBoundaryState = {
  error: null,
  componentStack: null,
};

/**
 * A top-level error boundary that catches render-time crashes thrown *outside*
 * the router (e.g. in the surrounding providers) and replaces the blank screen
 * with the shared {@link ErrorFallback} page.
 *
 * Render errors thrown *inside* a route are handled by react-router's own error
 * path instead — see the route `errorElement` wired up in `router.tsx`, which
 * renders the same fallback. A class component is required here because only
 * class components can implement React's error lifecycle.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure in the console so it stays discoverable in dev tools
    // and error-reporting pipelines once the fallback UI takes over.
    console.error('Uncaught error in render tree:', error, info);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render(): ReactNode {
    const { error, componentStack } = this.state;

    if (!error) {
      return this.props.children;
    }

    return <ErrorFallback error={error} componentStack={componentStack} />;
  }
}
