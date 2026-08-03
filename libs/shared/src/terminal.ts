import { z } from 'zod';

/**
 * Shared volume root, mounted at the SAME absolute path into the control-plane
 * and every runner. Git worktree gitdir links use absolute paths, so the mount
 * point must be identical on both sides for worktrees to resolve in the runner.
 */
export const VOLUME_ROOT = '/sagewright-volume';

/** Main clones the control-plane owns: `<VOLUME_ROOT>/repos/<slug>`. */
export const reposRoot = (): string => `${VOLUME_ROOT}/repos`;
export const repoDir = (slug: string): string => `${reposRoot()}/${slug}`;

/** Per-session worktrees: `<VOLUME_ROOT>/sessions/<taskId>/<slug>`. */
export const sessionsRoot = (): string => `${VOLUME_ROOT}/sessions`;
export const sessionDir = (taskId: string): string =>
  `${sessionsRoot()}/${taskId}`;
export const worktreeDir = (taskId: string, slug: string): string =>
  `${sessionDir(taskId)}/${slug}`;

/**
 * A workflow run reuses the per-session worktree layout, keyed by runId instead
 * of a taskId (both are uuids, so they never collide under `sessions/`). All of a
 * run's steps share this one dir + branch so code persists from step to step.
 */
export const runDir = (runId: string): string => `${sessionsRoot()}/${runId}`;
export const runWorktreeDir = (runId: string, slug: string): string =>
  `${runDir(runId)}/${slug}`;
/** The shared branch every step of a run commits onto; pushed once at run end. */
export const runBranch = (runId: string): string => `workflow/${runId}`;

/** Terminal flavours exposed on a session. */
export enum TerminalKind {
  SHELL = 'shell',
  AGENT = 'agent',
}

/** A PTY's character dimensions. */
export const terminalSizeSchema = z.object({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});
export type TerminalSize = z.infer<typeof terminalSizeSchema>;

/** Client → server control frame to resize the remote PTY. */
export const terminalResizeSchema = terminalSizeSchema.extend({
  type: z.literal('resize'),
});
export type TerminalResize = z.infer<typeof terminalResizeSchema>;

/**
 * Parse the optional `cols`/`rows` connect-query params the browser sends so the
 * PTY can be created already sized — full-screen TUIs (opencode) paint once at
 * startup and a late resize can't cleanly recover that first paint. Returns
 * `undefined` when either dimension is missing or not a positive integer.
 */
export const parseTerminalSize = (q: {
  cols?: string;
  rows?: string;
}): TerminalSize | undefined => {
  const parsed = terminalSizeSchema.safeParse({
    cols: Number(q.cols),
    rows: Number(q.rows),
  });
  return parsed.success ? parsed.data : undefined;
};

/** Runner session lifecycle mode, passed to the runner via SESSION_MODE. */
export enum SessionMode {
  INTERACTIVE = 'interactive',
  HEADLESS = 'headless',
}

/**
 * What a session is *for*. The single spawn path branches on this; every run path
 * (interactive UI, headless one-shot, scheduled prompt, workflow step, workflow
 * parent) maps to one kind. The runner only ever sees the derived `SessionMode`
 * (see `modeForKind`) — `kind` stays control-plane side.
 */

export enum SessionKind {
  INTERACTIVE = 'interactive',
  HEADLESS = 'headless',
  SCHEDULED = 'scheduled',
  WORKFLOW_STEP = 'workflow_step',
  WORKFLOW = 'workflow',
}

/** Derive the runner-facing lifecycle mode from a session kind. Only an interactive
 *  session keeps a human at the PTY; everything else is driven headless. */
export const modeForKind = (kind: SessionKind): SessionMode =>
  kind === SessionKind.INTERACTIVE ? SessionMode.INTERACTIVE : SessionMode.HEADLESS;
