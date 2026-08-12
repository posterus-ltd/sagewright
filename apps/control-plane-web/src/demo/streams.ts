import { EventType, SessionMode, TerminalKind, modeForKind } from '@sagewright/shared';

import { demoStore } from './store';
import { agentTranscript } from './transcript';

type Timer = ReturnType<typeof setTimeout>;

// --- Demo SSE stream (drop-in for EventSource) --------------------------------

type SseListener = (e: { data: string; lastEventId: string }) => void;

/**
 * Replays a task's event stream in memory. For a headless session (scheduled task /
 * workflow step) it streams the scripted transcript as `OUTPUT` events, so
 * TranscriptTerminal types it out. For an interactive session the live terminal
 * (WebSocket) carries the visible output, so here we emit only a couple of lifecycle
 * events for the Log tab — avoiding a double render of the transcript.
 */
class DemoEventStream {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, SseListener[]>();
  private timers: Timer[] = [];
  private closed = false;

  constructor(private readonly taskId: string) {
    this.timers.push(
      setTimeout(() => {
        if (this.closed) return;
        this.onopen?.();
        this.start();
      }, 60),
    );
  }

  addEventListener(type: string, cb: SseListener): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }

  private emit(type: string, seq: number, payload: unknown): void {
    if (this.closed) return;
    for (const cb of this.listeners.get(type) ?? []) cb({ data: JSON.stringify(payload), lastEventId: String(seq) });
  }

  private start(): void {
    const s = demoStore().sessions.find((x) => x.id === this.taskId);
    let seq = 1;
    const headless = s ? modeForKind(s.kind) === SessionMode.HEADLESS : false;
    if (headless && s) {
      let t = 0;
      for (const chunk of agentTranscript(s)) {
        t += chunk.after;
        const my = seq++;
        this.timers.push(setTimeout(() => this.emit(EventType.OUTPUT, my, { chunk: chunk.text }), t));
      }
    } else {
      this.timers.push(setTimeout(() => this.emit(EventType.STATUS, seq++, { status: 'running' }), 200));
      this.timers.push(setTimeout(() => this.emit(EventType.LOG, seq++, { line: 'agent attached to PTY' }), 800));
    }
  }

  close(): void {
    this.closed = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

export const createDemoEventStream = (path: string): DemoEventStream => {
  const id = path.match(/\/tasks\/([^/]+)\/stream/)?.[1] ?? '';
  return new DemoEventStream(id);
};

// --- Demo terminal socket (drop-in for WebSocket) -----------------------------

/**
 * Streams the scripted agent PTY output over a fake WebSocket, and echoes printable
 * keystrokes back so the terminal feels interactive. Deliberately never fires
 * `onclose` on its own — Terminal treats a close as a dropped connection and would
 * otherwise show a "reconnecting…" banner in the demo.
 */
class DemoTerminalSocket {
  binaryType: 'arraybuffer' | 'blob' = 'arraybuffer';
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0; // CONNECTING
  private timers: Timer[] = [];
  private closed = false;

  constructor(private readonly taskId: string, private readonly kind: TerminalKind) {
    this.timers.push(
      setTimeout(() => {
        if (this.closed) return;
        this.readyState = 1; // OPEN
        this.onopen?.();
        this.start();
      }, 80),
    );
  }

  private write(text: string): void {
    if (!this.closed) this.onmessage?.({ data: text });
  }

  private start(): void {
    if (this.kind === TerminalKind.SHELL) {
      this.write('\x1b[2m# demo shell — this box is illustrative\x1b[0m\r\n$ ');
      return;
    }
    const s = demoStore().sessions.find((x) => x.id === this.taskId);
    if (!s) {
      this.write('\r\n\x1b[2m[demo] no session\x1b[0m\r\n');
      return;
    }
    let t = 0;
    for (const chunk of agentTranscript(s)) {
      t += chunk.after;
      this.timers.push(setTimeout(() => this.write(chunk.text), t));
    }
  }

  send(data: unknown): void {
    if (this.closed || this.readyState !== 1) return;
    if (typeof data === 'string') return; // resize control frame — ignore
    const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
    if (!bytes) return;
    let out = '';
    bytes.forEach((b) => {
      if (b === 13) out += '\r\n'; // Enter
      else if (b >= 32 && b < 127) out += String.fromCharCode(b);
    });
    if (out) this.write(out);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3; // CLOSED
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

export const createDemoTerminalSocket = (taskId: string, kind: TerminalKind): DemoTerminalSocket =>
  new DemoTerminalSocket(taskId, kind);
