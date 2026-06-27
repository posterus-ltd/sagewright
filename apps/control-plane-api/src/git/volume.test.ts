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
      order.push(args[0]);
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

describe('createVolume.addSessionWorktrees', () => {
  it('ensures each repo then adds a task/<id> worktree', async () => {
    const { git, calls } = makeGitSpy();
    const made: string[] = [];
    const vol = createVolume({ git, pathExists: () => true, makeDir: async (p) => void made.push(p) });
    const manifest = await vol.addSessionWorktrees('t1', [{ url: 'https://github.com/a/b', slug: 'a-b' }]);
    expect(manifest).toEqual([
      { slug: 'a-b', url: 'https://github.com/a/b', defaultBranch: 'main', path: '/sagewright-volume/sessions/t1/a-b' },
    ]);
    expect(made).toContain('/sagewright-volume/sessions/t1');
    const wt = calls.find((c) => c.args[0] === 'worktree' && c.args[1] === 'add');
    expect(wt?.args).toEqual(['worktree', 'add', '-b', 'task/t1', '/sagewright-volume/sessions/t1/a-b']);
    expect(wt?.cwd).toBe('/sagewright-volume/repos/a-b');
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
});
