import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { execa } from 'execa';
import { repoDir, runBranch, sessionDir, worktreeDir, type RepoManifestEntry, type RepoStatus } from '@sagewright/shared';

/** A repo the control-plane materialises onto the shared volume. */
export interface VolumeRepo {
  url: string;
  slug: string;
}

export interface VolumeDeps {
  /** Token used to authenticate HTTPS GitHub clones/fetches. */
  token?: string;
  /** Injectable git runner (returns trimmed stdout). Defaults to execa('git', …). */
  git?: (args: string[], cwd?: string) => Promise<string>;
  pathExists?: (p: string) => boolean;
  listDir?: (p: string) => Promise<string[]>;
  removePath?: (p: string) => Promise<void>;
  makeDir?: (p: string) => Promise<void>;
}

/** Derive a stable, filesystem-safe `<owner>-<repo>` slug from a git URL. */
export const slugFromUrl = (url: string): string => {
  const cleaned = url.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const ssh = /^git@[^:]+:(.+)$/.exec(cleaned);
  const path = ssh ? ssh[1] : cleaned.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i, '');
  const tail = path.split('/').filter(Boolean).slice(-2).join('-');
  return (tail || cleaned).replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
};

/** Rewrite an HTTPS GitHub remote to embed a token; SSH/other URLs pass through. */
const authenticatedUrl = (url: string, token: string | undefined): string => {
  if (!token) return url;
  const m = /^https:\/\/github\.com\/(.+)$/.exec(url);
  return m ? `https://x-access-token:${token}@github.com/${m[1]}` : url;
};

/**
 * Owns every write to the shared volume's git state: clone/pull of the main
 * clones at `<vol>/repos/<slug>` and the per-session worktrees at
 * `<vol>/sessions/<taskId>/<slug>`. Workers only read/write inside their own
 * worktree dirs — they never clone, pull, or run worktree commands — so all
 * shared-`.git` writes are funnelled through here and serialized per-slug.
 */
export const createVolume = (deps: VolumeDeps = {}) => {
  const git =
    deps.git ??
    (async (args: string[], cwd?: string): Promise<string> => {
      const { stdout } = await execa('git', args, cwd ? { cwd } : {});
      return stdout.trim();
    });
  const pathExists = deps.pathExists ?? ((p: string) => existsSync(p));
  const listDir = deps.listDir ?? ((p: string) => readdir(p));
  const removePath = deps.removePath ?? ((p: string) => rm(p, { recursive: true, force: true }));
  const makeDir = deps.makeDir ?? (async (p: string) => void (await mkdir(p, { recursive: true })));

  // Per-slug promise chain: every clone/pull/worktree op for a given repo runs
  // strictly after the previous one, so concurrent session starts can't race on
  // the same main clone's `.git`.
  const locks = new Map<string, Promise<unknown>>();
  const runExclusive = <T>(slug: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(slug) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    locks.set(slug, run.then(() => undefined, () => undefined));
    return run;
  };

  const status = new Map<string, { status: RepoStatus; error: string | null }>();

  const deriveDefaultBranch = async (dir: string): Promise<string | null> => {
    try {
      const out = await git(['rev-parse', '--abbrev-ref', 'origin/HEAD'], dir);
      return out.replace(/^origin\//, '') || null;
    } catch {
      try {
        return (await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)) || null;
      } catch {
        return null;
      }
    }
  };

  /** Clone the repo if absent, else fetch + fast-forward. Serialized per-slug.
   *  Updates the status map and rethrows on failure (callers reconciling repos
   *  swallow the error; session start propagates it). */
  const cloneOrPull = (
    repo: VolumeRepo,
    token = deps.token,
  ): Promise<{ slug: string; url: string; defaultBranch: string | null }> =>
    runExclusive(repo.slug, async () => {
      const dir = repoDir(repo.slug);
      const authUrl = authenticatedUrl(repo.url, token);
      status.set(repo.slug, { status: 'cloning', error: null });
      try {
        if (pathExists(join(dir, '.git'))) {
          // Refresh the remote to the caller's token before fetching so a user's
          // own credential — not just the operator's baked-in one persisted at
          // first clone — authenticates the pull on this shared clone.
          await git(['remote', 'set-url', 'origin', authUrl], dir);
          await git(['fetch', '--all', '--prune'], dir);
          const def = await deriveDefaultBranch(dir);
          if (def) await git(['pull', '--ff-only', 'origin', def], dir).catch(() => undefined);
          status.set(repo.slug, { status: 'present', error: null });
          return { slug: repo.slug, url: repo.url, defaultBranch: def };
        }
        await git(['clone', authUrl, dir]);
        const def = await deriveDefaultBranch(dir);
        status.set(repo.slug, { status: 'present', error: null });
        return { slug: repo.slug, url: repo.url, defaultBranch: def };
      } catch (err) {
        status.set(repo.slug, { status: 'error', error: String(err) });
        throw err;
      }
    });

  /** Reconcile a list of repos: ensure each is present (fire-and-forget so the
   *  HTTP save returns immediately; progress is observable via `describe`). */
  const reconcile = (repos: VolumeRepo[], token?: string): void => {
    for (const repo of repos) void cloneOrPull(repo, token).catch(() => undefined);
  };

  const describe = (slug: string): { status: RepoStatus; error: string | null } =>
    status.get(slug) ?? { status: pathExists(join(repoDir(slug), '.git')) ? 'present' : 'cloning', error: null };

  /** Ensure each repo is present, then add a fresh worktree per repo on `branch`
   *  (defaults to `task/<id>`). Returns the manifest handed to the worker. `token`
   *  (the requester's own GITHUB_TOKEN override) authenticates the clone/pull when
   *  provided. `id` keys the worktree dir (a taskId for sessions, a runId for runs). */
  const addSessionWorktrees = async (
    id: string,
    repos: VolumeRepo[],
    token?: string,
    branch = `task/${id}`,
  ): Promise<RepoManifestEntry[]> => {
    const manifest: RepoManifestEntry[] = [];
    // Always materialise the session dir up front so a repo-less session still
    // has a valid cwd for the worker and the terminal's `docker exec --workdir`.
    await makeDir(sessionDir(id));
    for (const repo of repos) {
      const { defaultBranch } = await cloneOrPull(repo, token);
      const path = worktreeDir(id, repo.slug);
      await runExclusive(repo.slug, () => git(['worktree', 'add', '-b', branch, path], repoDir(repo.slug)));
      manifest.push({ slug: repo.slug, url: repo.url, defaultBranch, path });
    }
    return manifest;
  };

  /** Add one shared `workflow/<runId>` worktree per repo for a workflow run — every
   *  step of the run operates on these so code carries over step to step. Keyed by
   *  runId; tear down with `removeSessionWorktrees(runId)`. */
  const addRunWorktrees = (runId: string, repos: VolumeRepo[], token?: string): Promise<RepoManifestEntry[]> =>
    addSessionWorktrees(runId, repos, token, runBranch(runId));

  /** Remove every worktree for a session and delete its session dir. Idempotent. */
  const removeSessionWorktrees = async (taskId: string): Promise<void> => {
    const root = sessionDir(taskId);
    if (!pathExists(root)) return;
    const slugs = await listDir(root).catch(() => [] as string[]);
    for (const slug of slugs) {
      const wt = worktreeDir(taskId, slug);
      await runExclusive(slug, async () => {
        await git(['worktree', 'remove', '--force', wt], repoDir(slug)).catch(() => undefined);
        await git(['worktree', 'prune'], repoDir(slug)).catch(() => undefined);
      });
    }
    await removePath(root).catch(() => undefined);
  };

  /** Delete a repo's main clone (used when it's removed from the config list). */
  const removeRepo = async (slug: string): Promise<void> => {
    await removePath(repoDir(slug)).catch(() => undefined);
    status.delete(slug);
  };

  return { slugFromUrl, cloneOrPull, reconcile, describe, addSessionWorktrees, addRunWorktrees, removeSessionWorktrees, removeRepo };
};

export type Volume = ReturnType<typeof createVolume>;
