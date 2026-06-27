import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  /** The caught error, or `null` while the subtree is healthy. */
  readonly error: Error | null;
  /** React's component stack, captured alongside the error for context. */
  readonly componentStack: string | null;
}

const INITIAL_STATE: ErrorBoundaryState = { error: null, componentStack: null };

/**
 * A global error boundary that catches render-time crashes anywhere in the app
 * and replaces the blank white screen with a friendly, terminal-flavored fault
 * page. The visitor can expand the raw error message and stack trace, retry by
 * reloading, or return home.
 *
 * It deliberately uses a full reload (rather than react-router navigation) for
 * its actions: when the tree has already thrown, the safest recovery is a clean
 * boot rather than trusting the broken in-memory state.
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
    // Surface the failure in the console so it's still discoverable in dev
    // tools and error-reporting pipelines once the fallback UI takes over.
    console.error('Uncaught error in render tree:', error, info);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  private readonly handleHome = (): void => {
    window.location.assign('/');
  };

  render(): ReactNode {
    const { error, componentStack } = this.state;

    if (!error) {
      return this.props.children;
    }

    const details = [error.stack ?? `${error.name}: ${error.message}`]
      .concat(componentStack ? [`\nComponent stack:${componentStack}`] : [])
      .join('\n');

    return (
      <main className="page error" role="alert">
        <section className="window">
          <div className="window__bar">
            <span className="window__dots" aria-hidden="true">
              ● ● ●
            </span>
            <span className="window__title">error.log</span>
          </div>
          <div className="window__body error__body">
            <p className="prompt error__prompt">
              <span className="prompt__sigil">❯</span> ./sagewright
              <br />
              <span className="error__signal">
                segmentation fault (core dumped)
              </span>
              <span className="cursor" aria-hidden="true">
                █
              </span>
            </p>

            <h1 className="error__title">SOMETHING BROKE</h1>

            <p className="tagline error__lead">
              An unexpected error knocked this page over. It&rsquo;s not you —
              try reloading, or head back home. The technical details are below
              if you&rsquo;re curious.
            </p>

            <div className="error__actions">
              <button
                type="button"
                className="cta"
                onClick={this.handleReload}
              >
                ❯ try_again
              </button>
              <button
                type="button"
                className="cta cta--ghost"
                onClick={this.handleHome}
              >
                ❯ cd ~
              </button>
            </div>

            <details className="error__details">
              <summary className="error__summary">
                ❯ cat stacktrace.log
              </summary>
              <pre className="error__trace">{details}</pre>
            </details>
          </div>
        </section>
      </main>
    );
  }
}
