import { EventType, type RepoManifestEntry } from '@sagewright/shared';

import type { ContainerExec } from './docker-client';

type Emit = (events: { type: EventType; payload: Record<string, unknown> }[]) => Promise<void>;

interface PushArgs {
  exec: ContainerExec;
  containerId: string;
  taskId: string;
  manifest: RepoManifestEntry[];
  emit: Emit;
}

/**
 * Commit + push every repo the agent actually changed and open a PR for each. Run by the
 * control plane (decision A) after the agent's start script exits, via `docker exec` of git/gh
 * inside the worker — so the git flow stays identical no matter which harness produced the diff.
 * gh/git authenticate with the GITHUB_TOKEN baked into the worker image, exactly as before.
 */
export const pushAndOpenPrs = async ({ exec, containerId, taskId, manifest, emit }: PushArgs): Promise<void> => {
  const branch = `task/${taskId}`;
  for (const repo of manifest) {
    const status = await exec.capture(containerId, { cmd: ['git', 'status', '--porcelain'], workingDir: repo.path });
    if (!status.stdout.trim()) continue;

    await exec.capture(containerId, { cmd: ['git', 'add', '-A'], workingDir: repo.path });
    await exec.capture(containerId, { cmd: ['git', 'commit', '-m', 'Sagewright agent changes'], workingDir: repo.path });
    const push = await exec.capture(containerId, { cmd: ['git', 'push', '-u', 'origin', branch], workingDir: repo.path });
    if (push.exitCode !== 0) {
      await emit([{ type: EventType.ERROR, payload: { message: `push failed for ${repo.slug}: ${push.stderr.trim()}` } }]);
      continue;
    }

    const base = repo.defaultBranch ?? 'main';
    const pr = await exec.capture(containerId, {
      cmd: ['gh', 'pr', 'create', '--title', `Sagewright: ${repo.slug} ${taskId}`, '--body', 'Opened by Sagewright', '--base', base],
      workingDir: repo.path,
    });
    const url = pr.stdout.trim();
    if (pr.exitCode === 0 && url) {
      await emit([{ type: EventType.PR_OPENED, payload: { url, repo: repo.slug } }]);
    }
  }
};
