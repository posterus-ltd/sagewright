export enum SessionStatus {
  QUEUED = 'queued',
  PROVISIONING = 'provisioning',
  RUNNING = 'running',
  // Alive in the background with no live agent exec — the resting state of an
  // interactive session whose turn ended but whose container stays up for resume.
  DETACHED = 'detached',
  NEEDS_ASSISTANCE = 'needs_assistance',
  PUSHING = 'pushing',
  DONE = 'done',
  FAILED = 'failed',
  STOPPED = 'stopped',
  // A workflow parent that shipped a PR but never passed validation within maxIterations.
  MAX_ITERATIONS = 'max_iterations',
}

/** Statuses where a session has stopped working — it can be archived. */
export const TERMINAL_STATUSES: readonly SessionStatus[] = [
  SessionStatus.DONE,
  SessionStatus.FAILED,
  SessionStatus.STOPPED,
  SessionStatus.MAX_ITERATIONS,
];

/** True once a session has finished (or failed/stopped) and is no longer running. */
export const isTerminalStatus = (status: SessionStatus): boolean => TERMINAL_STATUSES.includes(status);

/** How a stored GitHub credential was obtained. */
export enum GithubCredentialSource {
  PAT = 'pat',
  OAUTH = 'oauth',
}

export enum EventType {
  LOG = 'log',
  /** Raw terminal output from the agent's PTY — the headless transcript. */
  OUTPUT = 'output',
  // TOOL/ASSISTANT predate the raw-terminal transcript and are no longer produced;
  // kept so historical events stored before that switch still parse.
  TOOL = 'tool',
  ASSISTANT = 'assistant',
  USER_MESSAGE = 'user_message',
  STATUS = 'status',
  ERROR = 'error',
  PR_OPENED = 'pr_opened',
}
