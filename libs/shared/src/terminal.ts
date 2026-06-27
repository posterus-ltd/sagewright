import { z } from 'zod';

/**
 * Shared volume root, mounted at the SAME absolute path into the control-plane
 * and every worker. Git worktree gitdir links use absolute paths, so the mount
 * point must be identical on both sides for worktrees to resolve in the worker.
 */
export const VOLUME_ROOT = '/sagewright-volume';

/** Main clones the control-plane owns: `<VOLUME_ROOT>/repos/<slug>`. */
export const reposRoot = (): string => `${VOLUME_ROOT}/repos`;
export const repoDir = (slug: string): string => `${reposRoot()}/${slug}`;

/** Per-session worktrees: `<VOLUME_ROOT>/sessions/<taskId>/<slug>`. */
export const sessionsRoot = (): string => `${VOLUME_ROOT}/sessions`;
export const sessionDir = (taskId: string): string => `${sessionsRoot()}/${taskId}`;
export const worktreeDir = (taskId: string, slug: string): string => `${sessionDir(taskId)}/${slug}`;

/** Terminal flavours exposed on a session. */
export const terminalKindSchema = z.enum(['shell', 'agent']);
export type TerminalKind = z.infer<typeof terminalKindSchema>;

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
export const parseTerminalSize = (q: { cols?: string; rows?: string }): TerminalSize | undefined => {
  const parsed = terminalSizeSchema.safeParse({ cols: Number(q.cols), rows: Number(q.rows) });
  return parsed.success ? parsed.data : undefined;
};

/** Worker session lifecycle mode, passed to the worker via SESSION_MODE. */
export const sessionModeSchema = z.enum(['interactive', 'headless']);
export type SessionMode = z.infer<typeof sessionModeSchema>;
