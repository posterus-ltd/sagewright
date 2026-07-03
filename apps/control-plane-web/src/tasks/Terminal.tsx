import { Box } from '@mui/material';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useEffect, useRef, type FC } from 'react';
import '@xterm/xterm/css/xterm.css';

import { EventType, type StreamEvent, type TerminalKind } from '@sagewright/shared';

import { nextReconnectDelay } from './reconnect';

const wsUrl = (taskId: string, kind: TerminalKind, cols: number, rows: number): string => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // cols/rows let the server create the PTY already sized, so the opencode TUI's
  // first paint is correct instead of relying on a post-connect resize.
  return `${proto}//${window.location.host}/api/tasks/${taskId}/terminal?kind=${kind}&cols=${cols}&rows=${rows}`;
};

/**
 * Renders an interactive terminal attached to a remote container PTY over a
 * WebSocket. Keystrokes are sent as binary frames; resize as a JSON text frame;
 * server PTY output arrives as binary and is written straight to xterm.
 *
 * The server only fans out bytes emitted *after* a viewer attaches — reattaching
 * (e.g. reopening a session that kept running in the background) gets a brand new
 * socket with no history of its own. `initialEvents` is the same persisted OUTPUT
 * transcript TranscriptTerminal replays for headless runs; replaying it here once
 * on mount, before the live socket connects, avoids a blank pane on reattach.
 */
export const Terminal: FC<{ taskId: string; kind: TerminalKind; initialEvents?: StreamEvent[] }> = ({
  taskId,
  kind,
  initialEvents,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const initialEventsRef = useRef(initialEvents);
  initialEventsRef.current = initialEvents;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Xterm({ fontSize: 13, cursorBlink: true, convertEol: false });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    for (const e of initialEventsRef.current ?? []) {
      if (e.type === EventType.OUTPUT && typeof e.payload['chunk'] === 'string') term.write(e.payload['chunk']);
    }

    let ws: WebSocket | null = null;
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const sendResize = (): void => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    // The socket may drop (proxy idle timeout, mobile radio) while the agent keeps
    // running server-side — re-attach with backoff instead of leaving a dead pane.
    const connect = (): void => {
      const socket = new WebSocket(wsUrl(taskId, kind, term.cols, term.rows));
      socket.binaryType = 'arraybuffer';
      ws = socket;

      socket.onopen = () => {
        attempt = 0;
        sendResize();
        term.focus();
      };
      socket.onmessage = (e: MessageEvent) => {
        if (typeof e.data === 'string') term.write(e.data);
        else term.write(new Uint8Array(e.data as ArrayBuffer));
      };
      socket.onclose = () => {
        if (disposed) return;
        const delay = nextReconnectDelay(attempt);
        attempt += 1;
        const wait = delay < 1000 ? `${delay}ms` : `${delay / 1000}s`;
        term.write(`\r\n\x1b[2m[disconnected — reconnecting in ${wait}]\x1b[0m\r\n`);
        retryTimer = setTimeout(connect, delay);
      };
    };
    connect();

    const encoder = new TextEncoder();
    const dataSub = term.onData((d) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(d));
    });
    const resizeSub = term.onResize(() => sendResize());

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* element detached mid-resize */
      }
    });
    ro.observe(host);

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ro.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      ws?.close();
      term.dispose();
    };
  }, [taskId, kind]);

  return <Box ref={hostRef} sx={{ flex: 1, minHeight: 0, width: '100%', bgcolor: '#000', p: 1, borderRadius: 1 }} />;
};
