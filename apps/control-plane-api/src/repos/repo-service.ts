import { and, eq, ne } from 'drizzle-orm';
import type { RepoWithStatus } from '@sagewright/shared';

import type { Db } from '../db/client';
import type { Volume } from '../git/volume';
import type { UserEnvService } from '../user-env/user-env-service';
import { repos } from '../db/schema';

interface RepoServiceDeps {
  db: Db;
  volume: Volume;
  userEnvService: UserEnvService;
}

/**
 * Per-user repo list. Each user (keyed by `userKey` = displayName today) owns an
 * independent list; the physical clone at `<vol>/repos/<slug>` is shared across
 * users who configure the same repo, so a clone is only removed once no user
 * references that slug anymore.
 */
export const createRepoService = (deps: RepoServiceDeps) => {
  const toWithStatus = (r: typeof repos.$inferSelect): RepoWithStatus => ({
    id: r.id,
    url: r.url,
    slug: r.slug,
    defaultBranch: r.defaultBranch,
    createdAt: r.createdAt.toISOString(),
    ...deps.volume.describe(r.slug),
  });

  const listRows = (userKey: string) =>
    deps.db.select().from(repos).where(eq(repos.userKey, userKey));

  // True when some OTHER user still has this slug — so its shared clone must survive.
  const sharedByOthers = async (userKey: string, slug: string): Promise<boolean> => {
    const [row] = await deps.db
      .select({ id: repos.id })
      .from(repos)
      .where(and(eq(repos.slug, slug), ne(repos.userKey, userKey)))
      .limit(1);
    return Boolean(row);
  };

  return {
    list: async (userKey: string): Promise<RepoWithStatus[]> => {
      const rows = await listRows(userKey);
      return rows.map(toWithStatus);
    },

    // Save the env-file-style URL list (one repo per line) for this user: diff against
    // the user's current rows, then reconcile the shared volume (clone missing / drop
    // removed only when no other user still references the slug).
    save: async (userKey: string, urls: string[]): Promise<RepoWithStatus[]> => {
      const desired = new Map<string, string>(); // slug -> url
      for (const raw of urls) {
        const url = raw.trim();
        if (url) desired.set(deps.volume.slugFromUrl(url), url);
      }

      const existing = await listRows(userKey);
      const existingBySlug = new Map(existing.map((r) => [r.slug, r]));

      for (const r of existing) {
        if (!desired.has(r.slug)) {
          await deps.db.delete(repos).where(eq(repos.id, r.id));
          if (!(await sharedByOthers(userKey, r.slug))) await deps.volume.removeRepo(r.slug);
        }
      }
      for (const [slug, url] of desired) {
        const current = existingBySlug.get(slug);
        if (!current) await deps.db.insert(repos).values({ userKey, url, slug });
        else if (current.url !== url)
          await deps.db.update(repos).set({ url }).where(eq(repos.id, current.id));
      }

      // Kick off clone/pull in the background; the UI polls GET /api/repos for status.
      // Authenticate with the user's own GITHUB_TOKEN override when set, so private
      // repos the operator token can't reach still clone on the control plane.
      const token = await deps.userEnvService.getValue(userKey, 'GITHUB_TOKEN');
      deps.volume.reconcile([...desired].map(([slug, url]) => ({ slug, url })), token);

      const rows = await listRows(userKey);
      return rows.map(toWithStatus);
    },
  };
};

export type RepoService = ReturnType<typeof createRepoService>;
