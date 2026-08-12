import { Box } from '@mui/material';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useEffect, useRef, type FC, type RefObject } from 'react';
import '@xterm/xterm/css/xterm.css';

import { EventType, type StreamEvent, type TerminalKind } from '@sagewright/shared';

import { nextReconnectDelay } from './reconnect';
import { useTransport } from './TransportProvider';

/**
 * Renders an interactive terminal attached to a remote container PTY over a
 * WebSocket. Keystrokes are sent as binary frames; resize as a JSON text frame;
 * server PTY output arrives as binary and is written straight to xterm.
 *
 * The server only fans out bytes emitted *after* a viewer attaches — it never
 * replays history — so a fresh mount (or a reconnect after a drop) would
 * otherwise show a blank pane until the next byte arrives, and a detached
 * session (no turn running) may never get a next byte at all. `events` is the
 * same persisted OUTPUT transcript TranscriptTerminal replays for headless
 * runs: until the live socket has actually shown a byte of its own, this keeps
 * writing whatever output chunks arrive, then gets out of the way (just
 * advancing its cursor, not writing) so nothing is shown twice.
 */
export const Terminal: FC<{
  taskId: string;
  kind: TerminalKind;
  events?: StreamEvent[];
  // While mounted, receives a sender that types programmatic input (quick
  // actions, dictation) into the PTY exactly like keystrokes.
  inputRef?: RefObject<((data: string) => void) | null>;
}> = ({ taskId, kind, events = [], inputRef }) => {
  const transport = useTransport();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const replayedRef = useRef(0);
  // True once the current socket has actually shown a byte — a detached session's
  // socket opens immediately but may deliver nothing for a long time (no turn is
  // running), so "open" alone doesn't mean the live channel has replaced replay.
  const liveActiveRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Xterm({ fontSize: 13, cursorBlink: true, convertEol: false });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;
    replayedRef.current = 0;

    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const sendResize = (): void => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    // The socket may drop (proxy idle timeout, mobile radio) while the agent keeps
    // running server-side — re-attach with backoff instead of leaving a dead pane.
    const connect = (): void => {
      const socket = transport.openTerminalSocket(taskId, kind, term.cols, term.rows);
      socket.binaryType = 'arraybuffer';
      wsRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        sendResize();
        term.focus();
      };
      socket.onmessage = (e: MessageEvent) => {
        liveActiveRef.current = true;
        if (typeof e.data === 'string') term.write(e.data);
        else term.write(new Uint8Array(e.data as ArrayBuffer));
      };
      socket.onclose = () => {
        // Reopen the gap-filling window — anything that happened while we were
        // down should come from the transcript once we reconnect.
        liveActiveRef.current = false;
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
    const sendData = (d: string): void => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(d));
    };
    const dataSub = term.onData(sendData);
    const resizeSub = term.onResize(() => sendResize());
    if (inputRef) inputRef.current = sendData;

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
      if (inputRef) inputRef.current = null;
      wsRef.current?.close();
      termRef.current = null;
      term.dispose();
    };
  }, [taskId, kind, inputRef, transport]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    // The live socket already shows this in real time — just advance the cursor
    // so a later disconnect doesn't try to replay what was already shown.
    if (liveActiveRef.current) {
      replayedRef.current = events.length;
      return;
    }

    for (let i = replayedRef.current; i < events.length; i += 1) {
      const e = events[i];
      if (e && e.type === EventType.OUTPUT && typeof e.payload['chunk'] === 'string') term.write(e.payload['chunk']);
    }
    replayedRef.current = events.length;
  }, [events]);

  return <Box ref={hostRef} sx={{ flex: 1, minHeight: 0, width: '100%', bgcolor: '#000', p: 1, borderRadius: 1 }} />;
};
