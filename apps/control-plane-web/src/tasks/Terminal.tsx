import { Box } from '@mui/material';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useEffect, useRef, type FC } from 'react';
import '@xterm/xterm/css/xterm.css';

import type { TerminalKind } from '@sagewright/shared';

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
 */
export const Terminal: FC<{ taskId: string; kind: TerminalKind }> = ({ taskId, kind }) => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Xterm({ fontSize: 13, cursorBlink: true, convertEol: false });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const ws = new WebSocket(wsUrl(taskId, kind, term.cols, term.rows));
    ws.binaryType = 'arraybuffer';

    const sendResize = (): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    ws.onopen = () => {
      sendResize();
      term.focus();
    };
    ws.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') term.write(e.data);
      else term.write(new Uint8Array(e.data as ArrayBuffer));
    };
    ws.onclose = () => term.write('\r\n\x1b[2m[disconnected]\x1b[0m\r\n');

    const encoder = new TextEncoder();
    const dataSub = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(d));
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
      ro.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      ws.close();
      term.dispose();
    };
  }, [taskId, kind]);

  return <Box ref={hostRef} sx={{ flex: 1, minHeight: 0, width: '100%', bgcolor: '#000', p: 1, borderRadius: 1 }} />;
};
