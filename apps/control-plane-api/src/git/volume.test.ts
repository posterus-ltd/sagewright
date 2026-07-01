import { describe, expect, it, vi } from 'vitest';

import { createVolume, slugFromUrl } from './volume';

describe('slugFromUrl', () => {
  it('derives owner-repo from an https url', () => {
    expect(slugFromUrl('https://github.com/acme/widgets')).toBe('acme-widgets');
  });
  it('strips a .git suffix and trailing slash', () => {
    expect(slugFromUrl('https://github.com/acme/widgets.git/')).toBe('acme-widgets');
  });
  it('handles ssh urls', () => {
    expect(slugFromUrl('git@github.com:acme/widgets.git')).toBe('acme-widgets');
  });
});

const makeGitSpy = () => {
  const calls: { args: string[]; cwd?: string }[] = [];
  const git = vi.fn(async (args: string[], cwd?: string) => {
    calls.push({ args, cwd });
    if (args[0] === 'rev-parse') return 'origin/main';
    return '';
  });
  return { git, calls };
};

describe('createVolume.cloneOrPull', () => {
  it('clones when the repo is absent', async () => {
    const { git, calls } = makeGitSpy();
    const vol = createVolume({ git, pathExists: () => false });
    const res = await vol.cloneOrPull({ url: 'https://github.com/acme/widgets', slug: 'acme-widgets' });
    expect(res.defaultBranch).toBe('main');
    expect(calls.some((c) => c.args[0] === 'clone')).toBe(true);
    expect(vol.describe('acme-widgets').status).toBe('present');
  });

  it('fetches + pulls when the repo is present', async () => {
    const { git, calls } = makeGitSpy();
    const vol = createVolume({ git, pathExists: () => true });
    await vol.cloneOrPull({ url: 'https://github.com/acme/widgets', slug: 'acme-widgets' });
    expect(calls.some((c) => c.args[0] === 'fetch')).toBe(true);
    expect(calls.some((c) => c.args[0] === 'pull')).toBe(true);
    expect(calls.some((c) => c.args[0] === 'clone')).toBe(false);
  });

  it('embeds the per-call token in the clone URL, overriding the volume default', async () => {
    const { git, calls } = makeGitSpy();
    const vol = createVolume({ git, pathExists: () => false, token: 'operator' });
    await vol.cloneOrPull({ url: 'https://github.com/acme/widgets', slug: 'acme-widgets' }, 'ghp_user');
    const clone = calls.find((c) => c.args[0] === 'clone');
    expect(clone?.args[1]).toBe('https://x-access-token:ghp_user@github.com/acme/widgets');
  });

  it('falls back to the volume token when no per-call token is given', async () => {
    const { git, calls } = makeGitSpy();
    const vol = createVolume({ git, pathExists: () => false, token: 'operator' });
    await vol.cloneOrPull({ url: 'https://github.com/acme/widgets', slug: 'acme-widgets' });
    const clone = calls.find((c) => c.args[0] === 'clone');
    expect(clone?.args[1]).toBe('https://x-access-token:operator@github.com/acme/widgets');
  });

  it('refreshes the remote to the per-call token before fetching a present repo', async () => {
    const { git, calls } = makeGitSpy();
    const vol = createVolume({ git, pathExists: () => true, token: 'operator' });
    await vol.cloneOrPull({ url: 'https://github.com/acme/widgets', slug: 'acme-widgets' }, 'ghp_user');
    const setUrl = calls.find((c) => c.args[0] === 'remote' && c.args[1] === 'set-url');
    expect(setUrl?.args).toEqual(['remote', 'set-url', 'origin', 'https://x-access-token:ghp_user@github.com/acme/widgets']);
    // The set-url must run before the fetch so the user's token authenticates it.
    expect(calls.findIndex((c) => c.args[0] === 'remote')).toBeLessThan(calls.findIndex((c) => c.args[0] === 'fetch'));
  });

  it('marks the repo errored and rethrows on failure', async () => {
    const git = vi.fn(async () => {
      throw new Error('boom');
    });
    const vol = createVolume({ git, pathExists: () => false });
    await expect(vol.cloneOrPull({ url: 'x', slug: 's' })).rejects.toThrow('boom');
    expect(vol.describe('s').status).toBe('error');
  });

  it('serializes concurrent operations on the same slug', async () => {
    const order: string[] = [];
    let active = 0;
    const git = vi.fn(async (args: string[]) => {
      active += 1;
      expect(active).toBe(1); // never two at once for the same slug
      order.push(args[0]!);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
      return args[0] === 'rev-parse' ? 'origin/main' : '';
    });
    const vol = createVolume({ git, pathExists: () => false });
    await Promise.all([
      vol.cloneOrPull({ url: 'x', slug: 'same' }),
      vol.cloneOrPull({ url: 'x', slug: 'same' }),
    ]);
    expect(order.filter((o) => o === 'clone')).toHaveLength(2);
  });
});

// Like makeGitSpy, but branch lookups (`show-ref`) fail — a fresh repo with no
// session branch yet, the common first-run case.
const makeFreshGitSpy = () => {
  const calls: { args: string[]; cwd?: string }[] = [];
  const git = vi.fn(async (args: string[], cwd?: string) => {
    calls.push({ args, cwd });
    if (args[0] === 'rev-parse') return 'origin/main';
    if (args[0] === 'show-ref') throw new Error('no such ref');
    return '';
  });
  return { git, calls };
};

// pathExists that reports main clones present but session worktree paths absent.
const noWorktreesYet = (p: string): boolean => !p.includes('/sessions/');

describe('createVolume.addSessionWorktrees', () => {
  it('ensures each repo then adds a task/<id> worktree', async () => {
    const { git, calls } = makeFreshGitSpy();
    const made: string[] = [];
    const vol = createVolume({ git, pathExists: noWorktreesYet, makeDir: async (p) => void made.push(p) });
    const manifest = await vol.addSessionWorktrees('t1', [{ url: 'https://github.com/a/b', slug: 'a-b' }]);
    expect(manifest).toEqual([
      { slug: 'a-b', url: 'https://github.com/a/b', defaultBranch: 'main', path: '/sagewright-volume/sessions/t1/a-b' },
    ]);
    expect(made).toContain('/sagewright-volume/sessions/t1');
    const wt = calls.find((c) => c.args[0] === 'worktree' && c.args[1] === 'add');
    expect(wt?.args).toEqual(['worktree', 'add', '-b', 'task/t1', '/sagewright-volume/sessions/t1/a-b']);
    expect(wt?.cwd).toBe('/sagewright-volume/repos/a-b');
  });

  it('reuses an existing worktree instead of re-adding it (post-restart resume)', async () => {
    const { git, calls } = makeGitSpy(); // everything exists, every git call succeeds
    const vol = createVolume({ git, pathExists: () => true, makeDir: async () => undefined });
    const manifest = await vol.addSessionWorktrees('t1', [{ url: 'https://github.com/a/b', slug: 'a-b' }]);
    expect(manifest).toEqual([
      { slug: 'a-b', url: 'https://github.com/a/b', defaultBranch: 'main', path: '/sagewright-volume/sessions/t1/a-b' },
    ]);
    expect(calls.some((c) => c.args[0] === 'worktree' && c.args[1] === 'add')).toBe(false);
  });

  it('re-adds on the surviving branch when the worktree dir is gone but the branch exists', async () => {
    const { git, calls } = makeGitSpy(); // show-ref succeeds → branch exists
    const vol = createVolume({ git, pathExists: noWorktreesYet, makeDir: async () => undefined });
    await vol.addSessionWorktrees('t1', [{ url: 'https://github.com/a/b', slug: 'a-b' }]);
    const wt = calls.find((c) => c.args[0] === 'worktree' && c.args[1] === 'add');
    // No `-b`: creating the branch again would fail — attach the existing one.
    expect(wt?.args).toEqual(['worktree', 'add', '/sagewright-volume/sessions/t1/a-b', 'task/t1']);
  });

  it('authenticates the clone with the requester\'s token', async () => {
    const { git, calls } = makeGitSpy();
    const vol = createVolume({ git, pathExists: () => false, makeDir: async () => undefined, token: 'operator' });
    await vol.addSessionWorktrees('t1', [{ url: 'https://github.com/a/b', slug: 'a-b' }], 'ghp_user');
    const clone = calls.find((c) => c.args[0] === 'clone');
    expect(clone?.args[1]).toBe('https://x-access-token:ghp_user@github.com/a/b');
  });

  // A repo-less session still needs a real working dir, else the terminal's
  // `docker exec --workdir <sessionDir>` fails and the tabs show "disconnected".
  it('creates the session dir even with no repos', async () => {
    const { git, calls } = makeGitSpy();
    const made: string[] = [];
    const vol = createVolume({ git, pathExists: () => true, makeDir: async (p) => void made.push(p) });
    const manifest = await vol.addSessionWorktrees('t1', []);
    expect(manifest).toEqual([]);
    expect(made).toContain('/sagewright-volume/sessions/t1');
    expect(calls.some((c) => c.args[0] === 'worktree')).toBe(false);
  });
});

describe('createVolume.listSessionWorktrees', () => {
  it('lists the slugs of a session dir (post-restart hydration)', async () => {
    const { git } = makeGitSpy();
    const vol = createVolume({ git, pathExists: () => true, listDir: async () => ['a-b', 'c-d'] });
    expect(await vol.listSessionWorktrees('t1')).toEqual(['a-b', 'c-d']);
  });

  it('returns [] when the session dir is absent', async () => {
    const { git } = makeGitSpy();
    const vol = createVolume({ git, pathExists: () => false });
    expect(await vol.listSessionWorktrees('missing')).toEqual([]);
  });
});

describe('createVolume.removeSessionWorktrees', () => {
  it('removes + prunes each worktree and deletes the session dir', async () => {
    const { git, calls } = makeGitSpy();
    const removed: string[] = [];
    const vol = createVolume({
      git,
      pathExists: () => true,
      listDir: async () => ['a-b', 'c-d'],
      removePath: async (p) => void removed.push(p),
    });
    await vol.removeSessionWorktrees('t1');
    expect(calls.filter((c) => c.args[1] === 'remove')).toHaveLength(2);
    expect(calls.filter((c) => c.args[1] === 'prune')).toHaveLength(2);
    expect(removed).toContain('/sagewright-volume/sessions/t1');
  });

  it('is a no-op when the session dir is absent', async () => {
    const { git, calls } = makeGitSpy();
    const vol = createVolume({ git, pathExists: () => false });
    await vol.removeSessionWorktrees('missing');
    expect(calls).toHaveLength(0);
  });

  it('deletes the session branches from the main clone (no branch accumulation)', async () => {
    const { git, calls } = makeGitSpy();
    const vol = createVolume({
      git,
      pathExists: () => true,
      listDir: async () => ['a-b'],
      removePath: async () => undefined,
    });
    await vol.removeSessionWorktrees('t1');
    const deleted = calls.filter((c) => c.args[0] === 'branch' && c.args[1] === '-D');
    // The dir is keyed by a task OR run id; try both branch shapes, best-effort.
    expect(deleted.map((c) => c.args[2])).toEqual(['task/t1', 'workflow/t1']);
    expect(deleted.every((c) => c.cwd === '/sagewright-volume/repos/a-b')).toBe(true);
  });
});
