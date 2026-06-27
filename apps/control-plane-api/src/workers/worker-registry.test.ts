import { describe, expect, it, vi } from 'vitest';

import { createWorkerRegistry } from './worker-registry';

const makeRegistry = (images: Docker.ImageInfo[]) => {
  const listImages = vi.fn(async () => images);
  const registry = createWorkerRegistry({ docker: { listImages } as never });
  return { registry, listImages };
};

// Minimal Docker.ImageInfo shape for test fixtures
type Docker = { ImageInfo: { RepoTags?: string[]; Labels?: Record<string, string> } };

const image = (
  tags: string[],
  labels: Record<string, string> = {},
): Docker['ImageInfo'] => ({ RepoTags: tags, Labels: labels });

describe('worker-registry', () => {
  it('passes sagewright.worker=true label filter to listImages', async () => {
    const { registry, listImages } = makeRegistry([]);
    await registry.list();
    expect(listImages).toHaveBeenCalledWith({ filters: { label: ['sagewright.worker=true'] } });
  });

  it('derives id from sagewright-worker-<id>: tag prefix', async () => {
    const { registry } = makeRegistry([
      image(['sagewright-worker-opencode:latest'], {
        'sagewright.worker.name': 'OpenCode',
        'sagewright.worker.description': 'Runs opencode',
      }),
    ]);
    const result = await registry.list();
    expect(result).toEqual([
      { id: 'opencode', image: 'sagewright-worker-opencode:latest', name: 'OpenCode', description: 'Runs opencode' },
    ]);
  });

  it('falls back to label name when tag does not match prefix pattern', async () => {
    const { registry } = makeRegistry([
      image(['acme/custom-worker:v1'], { 'sagewright.worker.name': 'Custom Worker' }),
    ]);
    const result = await registry.list();
    expect(result[0].id).toBe('custom-worker');
    expect(result[0].name).toBe('Custom Worker');
  });

  it('skips images with only <none>:<none> tags', async () => {
    const { registry } = makeRegistry([
      image(['<none>:<none>'], { 'sagewright.worker=true': '' }),
      image(['sagewright-worker-valid:latest']),
    ]);
    const result = await registry.list();
    expect(result).toHaveLength(1);
    expect(result[0].image).toBe('sagewright-worker-valid:latest');
  });

  it('deduplicates by id — first tag wins', async () => {
    const { registry } = makeRegistry([
      image(['sagewright-worker-alpha:v1'], { 'sagewright.worker.name': 'Alpha v1' }),
      image(['sagewright-worker-alpha:v2'], { 'sagewright.worker.name': 'Alpha v2' }),
    ]);
    const result = await registry.list();
    expect(result).toHaveLength(1);
    expect(result[0].image).toBe('sagewright-worker-alpha:v1');
  });

  it('uses tag as name fallback when label is absent', async () => {
    const { registry } = makeRegistry([image(['sagewright-worker-lite:latest'])]);
    const result = await registry.list();
    expect(result[0].name).toBe('lite');
    expect(result[0].description).toBe('');
  });

  it('returns empty array when no images are found', async () => {
    const { registry } = makeRegistry([]);
    expect(await registry.list()).toEqual([]);
  });

  it('prefers the :latest tag when an image carries multiple tags', async () => {
    const { registry } = makeRegistry([
      image(['sagewright-worker-opencode:v2', 'sagewright-worker-opencode:latest']),
    ]);
    const result = await registry.list();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('opencode');
    expect(result[0].image).toBe('sagewright-worker-opencode:latest');
  });
});
