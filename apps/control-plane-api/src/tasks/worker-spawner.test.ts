import { describe, expect, it, vi } from 'vitest';
import type { SessionMode } from '@sagewright/shared';

import { createWorkerSpawner } from './worker-spawner';

const spawnWith = async (mode: SessionMode, userEnv: Record<string, string> = {}, workerImage?: string) => {
  const start = vi.fn();
  const createContainer = vi.fn(async () => ({ id: 'c123', start }));
  const spawner = createWorkerSpawner(
    { workerImage: 'img', controlPlaneUrl: 'http://cp', workerNetwork: 'sagewright', workerVolume: 'sagewright-repos', linearApiKey: 'lin' } as never,
    () => ({ createContainer }) as never,
  );
  const out = await spawner.spawn({
    taskId: 't1',
    mode,
    prompt: 'do',
    manifest: [{ slug: 'a-b', url: 'https://github.com/a/b', defaultBranch: 'main', path: '/sagewright-volume/sessions/t1/a-b' }],
    sessionDir: '/sagewright-volume/sessions/t1',
    userEnv,
    workerImage,
  });
  const env = (createContainer.mock.calls[0][0] as { Env: string[] }).Env;
  const hostConfig = (createContainer.mock.calls[0][0] as { HostConfig: { NetworkMode: string; Binds: string[] } }).HostConfig;
  const image = (createContainer.mock.calls[0][0] as { Image: string }).Image;
  return { out, start, createContainer, env, hostConfig, image };
};

describe('worker-spawner', () => {
  it('creates and starts a container with the worker env', async () => {
    const { out, start, env } = await spawnWith('headless');
    expect(out.containerId).toBe('c123');
    expect(start).toHaveBeenCalled();
    expect(env).toContain('TASK_ID=t1');
    expect(env).toContain('SESSION_DIR=/sagewright-volume/sessions/t1');
    expect(env).toContain('PROMPT=do');
    // The worker no longer receives LINEAR_API_KEY: its only consumer was the
    // opencode Linear MCP, which has been removed.
    expect(env.some((e) => e.startsWith('LINEAR_API_KEY='))).toBe(false);
    expect(env.some((e) => e.startsWith('REPO_MANIFEST='))).toBe(true);
    // No callback creds: the control plane drives the agent over `docker exec`.
    expect(env.some((e) => e.startsWith('WORKER_TOKEN='))).toBe(false);
    expect(env.some((e) => e.startsWith('CONTROL_PLANE_URL='))).toBe(false);
  });

  it('mounts the shared repo volume at the canonical path', async () => {
    const { hostConfig } = await spawnWith('interactive');
    expect(hostConfig.NetworkMode).toBe('sagewright');
    expect(hostConfig.Binds).toContain('sagewright-repos:/sagewright-volume');
  });

  it('passes the session mode through verbatim', async () => {
    expect((await spawnWith('interactive')).env).toContain('SESSION_MODE=interactive');
    expect((await spawnWith('headless')).env).toContain('SESSION_MODE=headless');
  });

  it('injects the user env so it can override baked image secrets', async () => {
    const { env } = await spawnWith('headless', { GITHUB_TOKEN: 'ghp_user', FOO: 'bar' });
    expect(env).toContain('GITHUB_TOKEN=ghp_user');
    expect(env).toContain('FOO=bar');
  });

  it('lets operational vars win over a colliding user env value', async () => {
    const { env } = await spawnWith('headless', { TASK_ID: 'attacker' });
    expect(env).toContain('TASK_ID=t1');
    expect(env).not.toContain('TASK_ID=attacker');
  });

  it('falls back to config image when no workerImage override is provided', async () => {
    const { image } = await spawnWith('headless');
    expect(image).toBe('img');
  });

  it('uses the per-session workerImage override when provided', async () => {
    const { image } = await spawnWith('headless', {}, 'custom:latest');
    expect(image).toBe('custom:latest');
  });
});
