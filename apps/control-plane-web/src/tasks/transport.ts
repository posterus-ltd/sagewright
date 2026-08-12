import type { TerminalKind } from '@sagewright/shared';

/**
 * The two live-streaming transports (SSE + terminal WebSocket), packaged as an injectable
 * client. The SPA provides the real browser objects; the embedded demo web component
 * provides in-memory mocks that replay a scripted agent session — no backend, and no
 * reliance on `window.location` (which in an embed points at the host landing page's
 * origin, which has no `/api`).
 *
 * The client is handed to the app through `TransportProvider` (see TransportProvider.tsx)
 * and read with `useTransport()`, so no demo code is pulled into the SPA bundle.
 */
export interface TransportClient {
  openEventStream(path: string): EventSource;
  openTerminalSocket(taskId: string, kind: TerminalKind, cols: number, rows: number): WebSocket;
}

export const createRealTransport = (): TransportClient => ({
  openEventStream: (path) => new EventSource(path, { withCredentials: true }),
  openTerminalSocket: (taskId, kind, cols, rows) => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // cols/rows let the server create the PTY already sized, so the opencode TUI's
    // first paint is correct instead of relying on a post-connect resize.
    return new WebSocket(
      `${proto}//${window.location.host}/api/tasks/${taskId}/terminal?kind=${kind}&cols=${cols}&rows=${rows}`,
    );
  },
});
