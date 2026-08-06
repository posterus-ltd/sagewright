import { describe, expect, it, vi } from 'vitest';
import { SessionMode } from '@sagewright/shared';

import { createRunnerSpawner } from './runner-spawner';

const spawnWith = async (mode: SessionMode, userEnv: Record<string, string> = {}, runnerImage?: string) => {
  const start = vi.fn();
  const createContainer = vi.fn(async (_opts: unknown) => ({ id: 'c123', start }));
  const spawner = createRunnerSpawner(
    { runnerImage: 'img', runnerNetwork: 'sagewright', runnerVolume: 'sagewright-repos' } as never,
    () => ({ createContainer }) as never,
  );
  const out = await spawner.spawn({
    taskId: 't1',
    mode,
    prompt: 'do',
    manifest: [{ slug: 'a-b', url: 'https://github.com/a/b', defaultBranch: 'main', path: '/sagewright-volume/sessions/t1/a-b' }],
    sessionDir: '/sagewright-volume/sessions/t1',
    userEnv,
    runnerImage,
  });
  const env = (createContainer.mock.calls[0]![0] as { Env: string[] }).Env;
  const hostConfig = (createContainer.mock.calls[0]![0] as { HostConfig: { NetworkMode: string; Binds: string[] } }).HostConfig;
  const image = (createContainer.mock.calls[0]![0] as { Image: string }).Image;
  return { out, start, createContainer, env, hostConfig, image };
};

describe('runner-spawner', () => {
  it('creates and starts a container with the runner env', async () => {
    const { out, start, env } = await spawnWith(SessionMode.HEADLESS);
    expect(out.containerId).toBe('c123');
    expect(start).toHaveBeenCalled();
    expect(env).toContain('TASK_ID=t1');
    expect(env).toContain('SESSION_DIR=/sagewright-volume/sessions/t1');
    expect(env).toContain('PROMPT=do');
    expect(env.some((e) => e.startsWith('REPO_MANIFEST='))).toBe(true);
    // No callback creds: the control plane drives the agent over `docker exec`.
    expect(env.some((e) => e.startsWith('RUNNER_TOKEN='))).toBe(false);
  });

  it('labels the container with its session id so orphans stay discoverable', async () => {
    const { createContainer } = await spawnWith(SessionMode.HEADLESS);
    const labels = (createContainer.mock.calls[0]![0] as { Labels: Record<string, string> }).Labels;
    expect(labels).toEqual({ 'sagewright.session': 't1' });
  });

  it('mounts the shared repo volume at the canonical path', async () => {
    const { hostConfig } = await spawnWith(SessionMode.INTERACTIVE);
    expect(hostConfig.NetworkMode).toBe('sagewright');
    expect(hostConfig.Binds).toContain('sagewright-repos:/sagewright-volume');
  });

  it('passes the session mode through verbatim', async () => {
    expect((await spawnWith(SessionMode.INTERACTIVE)).env).toContain('SESSION_MODE=interactive');
    expect((await spawnWith(SessionMode.HEADLESS)).env).toContain('SESSION_MODE=headless');
  });

  it('injects the user env so it can override baked image secrets', async () => {
    const { env } = await spawnWith(SessionMode.HEADLESS, { GITHUB_TOKEN: 'ghp_user', FOO: 'bar' });
    expect(env).toContain('GITHUB_TOKEN=ghp_user');
    expect(env).toContain('FOO=bar');
  });

  it('lets operational vars win over a colliding user env value', async () => {
    const { env } = await spawnWith(SessionMode.HEADLESS, { TASK_ID: 'attacker' });
    expect(env).toContain('TASK_ID=t1');
    expect(env).not.toContain('TASK_ID=attacker');
  });

  it('falls back to config image when no runnerImage override is provided', async () => {
    const { image } = await spawnWith(SessionMode.HEADLESS);
    expect(image).toBe('img');
  });

  it('uses the per-session runnerImage override when provided', async () => {
    const { image } = await spawnWith(SessionMode.HEADLESS, {}, 'custom:latest');
    expect(image).toBe('custom:latest');
  });
});
