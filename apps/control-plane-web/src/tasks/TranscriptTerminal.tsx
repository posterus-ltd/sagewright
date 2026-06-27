import { Box } from '@mui/material';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useEffect, useRef, type FC } from 'react';
import '@xterm/xterm/css/xterm.css';

import { EventType, type StreamEvent } from '@sagewright/shared';

/**
 * Read-only replay of a headless run's transcript. The control plane streams the
 * agent's raw PTY as OUTPUT events; we paint them straight into xterm so a headless
 * session reads exactly like watching someone work over SSH. Lifecycle events
 * (status, interjections, PR, errors) are interleaved as dim/coloured markers.
 */
const render = (term: Xterm, e: StreamEvent): void => {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case EventType.OUTPUT:
      if (typeof p['chunk'] === 'string') term.write(p['chunk']);
      break;
    case EventType.USER_MESSAGE:
      term.write(`\r\n\x1b[36m› ${String(p['text'] ?? '')}\x1b[0m\r\n`);
      break;
    case EventType.PR_OPENED:
      term.write(`\r\n\x1b[32m[PR] ${String(p['url'] ?? '')}\x1b[0m\r\n`);
      break;
    case EventType.ERROR:
      term.write(`\r\n\x1b[31m[error] ${String(p['message'] ?? '')}\x1b[0m\r\n`);
      break;
    case EventType.STATUS:
      term.write(`\r\n\x1b[2m[${String(p['status'] ?? '')}]\x1b[0m\r\n`);
      break;
    case EventType.LOG:
      if (p['line']) term.write(`\r\n\x1b[2m${String(p['line'])}\x1b[0m\r\n`);
      break;
    default:
      break;
  }
};

export const TranscriptTerminal: FC<{ events: StreamEvent[] }> = ({ events }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const writtenRef = useRef(0);

  // Mount the terminal once; replay whatever events we already hold.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Xterm({ fontSize: 13, convertEol: false, disableStdin: true, cursorBlink: false });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;
    writtenRef.current = 0;

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
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // Append only the events we haven't painted yet. `events` is seq-sorted and the
  // stream hook dedupes, so the tail is always strictly newer — safe to append.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    for (let i = writtenRef.current; i < events.length; i += 1) render(term, events[i]);
    writtenRef.current = events.length;
  }, [events]);

  return <Box ref={hostRef} sx={{ flex: 1, minHeight: 0, width: '100%', bgcolor: '#000', p: 1, borderRadius: 1 }} />;
};
