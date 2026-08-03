import { EventType, type RepoManifestEntry } from '@sagewright/shared';

import type { ContainerExec } from './docker-client';
import type { GithubIdentity } from '../github/github-credential-service';

type Emit = (events: { type: EventType; payload: Record<string, unknown> }[]) => Promise<void>;

interface PushArgs {
  exec: ContainerExec;
  containerId: string;
  taskId: string;
  manifest: RepoManifestEntry[];
  identity?: GithubIdentity;
  emit: Emit;
  // Branch to push onto. Defaults to `task/<taskId>` (headless sessions); a
  // workflow run passes its shared `workflow/<runId>` branch instead.
  branch?: string;
}

/**
 * Commit + push every repo the agent actually changed and open a PR for each. Run by the
 * control plane (decision A) after the agent's start script exits, via `docker exec` of git/gh
 * inside the runner — so the git flow stays identical no matter which harness produced the diff.
 * gh/git authenticate with the resolved user's GITHUB_TOKEN injected into the runner env.
 */
export const pushAndOpenPrs = async ({ exec, containerId, taskId, manifest, identity, emit, branch = `task/${taskId}` }: PushArgs): Promise<void> => {
  for (const repo of manifest) {
    const status = await exec.capture(containerId, { cmd: ['git', 'status', '--porcelain'], workingDir: repo.path });
    if (!status.stdout.trim()) continue;

    await exec.capture(containerId, { cmd: ['git', 'add', '-A'], workingDir: repo.path });
    await exec.capture(containerId, {
      cmd: [
        'git',
        '-c',
        `user.name=${identity?.name ?? identity?.login ?? 'sagewright'}`,
        '-c',
        `user.email=${identity?.email ?? 'bot@sagewright'}`,
        'commit',
        '-m',
        `Sagewright changes for ${taskId}`,
      ],
      workingDir: repo.path,
    });
    const push = await exec.capture(containerId, { cmd: ['git', 'push', '-u', 'origin', branch], workingDir: repo.path });
    if (push.exitCode !== 0) {
      await emit([{ type: EventType.ERROR, payload: { message: `push failed for ${repo.slug}: ${push.stderr.trim()}` } }]);
      continue;
    }

    const base = repo.defaultBranch ?? 'main';
    const pr = await exec.capture(containerId, {
      cmd: [
        'gh',
        'pr',
        'create',
        '--title',
        `Sagewright changes for ${repo.slug}`,
        '--body',
        `Automated changes from Sagewright task ${taskId}.`,
        '--base',
        base,
      ],
      workingDir: repo.path,
    });
    const url = pr.stdout.trim();
    if (pr.exitCode === 0 && url) {
      await emit([{ type: EventType.PR_OPENED, payload: { url, repo: repo.slug } }]);
    }
  }
};
