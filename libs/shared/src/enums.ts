export enum TaskStatus {
  QUEUED = 'queued',
  PROVISIONING = 'provisioning',
  RUNNING = 'running',
  NEEDS_ASSISTANCE = 'needs_assistance',
  PUSHING = 'pushing',
  DONE = 'done',
  FAILED = 'failed',
  STOPPED = 'stopped',
}

/** Statuses where a session has stopped working — it can be archived. */
export const TERMINAL_STATUSES: readonly TaskStatus[] = [TaskStatus.DONE, TaskStatus.FAILED, TaskStatus.STOPPED];

/** True once a session has finished (or failed/stopped) and is no longer running. */
export const isTerminalStatus = (status: TaskStatus): boolean => TERMINAL_STATUSES.includes(status);

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
