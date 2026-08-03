import { describe, expect, it, vi } from 'vitest';

import { createRunnerRegistry } from './runner-registry';

const makeRegistry = (images: Docker['ImageInfo'][]) => {
  const listImages = vi.fn(async () => images);
  const registry = createRunnerRegistry({ docker: { listImages } as never });
  return { registry, listImages };
};

// Minimal Docker.ImageInfo shape for test fixtures
type Docker = { ImageInfo: { RepoTags?: string[]; Labels?: Record<string, string> } };

const image = (
  tags: string[],
  labels: Record<string, string> = {},
): Docker['ImageInfo'] => ({ RepoTags: tags, Labels: labels });

describe('runner-registry', () => {
  it('passes sagewright.runner=true label filter to listImages', async () => {
    const { registry, listImages } = makeRegistry([]);
    await registry.list();
    expect(listImages).toHaveBeenCalledWith({ filters: { label: ['sagewright.runner=true'] } });
  });

  it('derives id from sagewright-runner-<id>: tag prefix', async () => {
    const { registry } = makeRegistry([
      image(['sagewright-runner-opencode:latest'], {
        'sagewright.runner.name': 'OpenCode',
        'sagewright.runner.description': 'Runs opencode',
      }),
    ]);
    const result = await registry.list();
    expect(result).toEqual([
      { id: 'opencode', image: 'sagewright-runner-opencode:latest', name: 'OpenCode', description: 'Runs opencode' },
    ]);
  });

  it('falls back to label name when tag does not match prefix pattern', async () => {
    const { registry } = makeRegistry([
      image(['acme/custom-runner:v1'], { 'sagewright.runner.name': 'Custom Runner' }),
    ]);
    const result = await registry.list();
    expect(result[0]!.id).toBe('custom-runner');
    expect(result[0]!.name).toBe('Custom Runner');
  });

  it('skips images with only <none>:<none> tags', async () => {
    const { registry } = makeRegistry([
      image(['<none>:<none>'], { 'sagewright.runner=true': '' }),
      image(['sagewright-runner-valid:latest']),
    ]);
    const result = await registry.list();
    expect(result).toHaveLength(1);
    expect(result[0]!.image).toBe('sagewright-runner-valid:latest');
  });

  it('deduplicates by id — first tag wins', async () => {
    const { registry } = makeRegistry([
      image(['sagewright-runner-alpha:v1'], { 'sagewright.runner.name': 'Alpha v1' }),
      image(['sagewright-runner-alpha:v2'], { 'sagewright.runner.name': 'Alpha v2' }),
    ]);
    const result = await registry.list();
    expect(result).toHaveLength(1);
    expect(result[0]!.image).toBe('sagewright-runner-alpha:v1');
  });

  it('uses tag as name fallback when label is absent', async () => {
    const { registry } = makeRegistry([image(['sagewright-runner-lite:latest'])]);
    const result = await registry.list();
    expect(result[0]!.name).toBe('lite');
    expect(result[0]!.description).toBe('');
  });

  it('returns empty array when no images are found', async () => {
    const { registry } = makeRegistry([]);
    expect(await registry.list()).toEqual([]);
  });

  it('prefers the :latest tag when an image carries multiple tags', async () => {
    const { registry } = makeRegistry([
      image(['sagewright-runner-opencode:v2', 'sagewright-runner-opencode:latest']),
    ]);
    const result = await registry.list();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('opencode');
    expect(result[0]!.image).toBe('sagewright-runner-opencode:latest');
  });
});
