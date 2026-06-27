import { EventType } from '@sagewright/shared';
import { describe, expect, it, vi } from 'vitest';

import { pushAndOpenPrs } from './git-pr';

const manifest = [{ slug: 'a-b', url: 'https://github.com/a/b', defaultBranch: 'main', path: '/v/a-b' }];

describe('pushAndOpenPrs', () => {
  it('commits, pushes and opens a PR for a changed repo', async () => {
    const capture = vi.fn(async (_cid: string, o: { cmd: string[] }) => {
      const c = o.cmd.join(' ');
      if (c.startsWith('git status')) return { exitCode: 0, stdout: ' M file.ts\n', stderr: '' };
      if (c.startsWith('gh pr create')) return { exitCode: 0, stdout: 'https://github.com/a/b/pull/1\n', stderr: '' };
      return { exitCode: 0, stdout: '', stderr: '' };
    });
    const emit = vi.fn(async () => {});

    await pushAndOpenPrs({
      exec: { capture } as never,
      containerId: 'c1',
      taskId: 't1',
      manifest,
      identity: { login: 'octo', name: 'Octo Cat', email: 'octo@example.com' },
      emit,
    });

    const cmds = capture.mock.calls.map((c) => (c[1] as { cmd: string[] }).cmd.join(' '));
    expect(cmds).toContain('git -c user.name=Octo Cat -c user.email=octo@example.com commit -m Sagewright changes for t1');
    expect(cmds).toContain('git push -u origin task/t1');
    expect(emit).toHaveBeenCalledWith([
      { type: EventType.PR_OPENED, payload: { url: 'https://github.com/a/b/pull/1', repo: 'a-b' } },
    ]);
  });

  it('skips repos with no changes', async () => {
    const capture = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    const emit = vi.fn(async () => {});

    await pushAndOpenPrs({ exec: { capture } as never, containerId: 'c1', taskId: 't1', manifest, emit });

    expect(capture).toHaveBeenCalledTimes(1); // only `git status`
    expect(emit).not.toHaveBeenCalled();
  });

  it('reports a push failure without opening a PR', async () => {
    const capture = vi.fn(async (_cid: string, o: { cmd: string[] }) => {
      const c = o.cmd.join(' ');
      if (c.startsWith('git status')) return { exitCode: 0, stdout: ' M x\n', stderr: '' };
      if (c.startsWith('git push')) return { exitCode: 1, stdout: '', stderr: 'rejected' };
      return { exitCode: 0, stdout: '', stderr: '' };
    });
    const emit = vi.fn(async () => {});

    await pushAndOpenPrs({ exec: { capture } as never, containerId: 'c1', taskId: 't1', manifest, emit });

    const cmds = capture.mock.calls.map((c) => (c[1] as { cmd: string[] }).cmd.join(' '));
    expect(cmds.some((c) => c.startsWith('gh pr create'))).toBe(false);
    expect(emit).toHaveBeenCalledWith([
      { type: EventType.ERROR, payload: { message: 'push failed for a-b: rejected' } },
    ]);
  });
});
