// Backoff policy for the terminal WebSocket: proxies and mobile radios drop idle
// sockets while the agent keeps running server-side, so the pane re-attaches
// instead of dying. Exponential from 500ms, capped at 10s.
export const RECONNECT_BASE_MS = 500;
export const RECONNECT_MAX_MS = 10_000;

export const nextReconnectDelay = (attempt: number): number =>
  Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
