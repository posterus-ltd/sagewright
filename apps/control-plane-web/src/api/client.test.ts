import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createApiClient } from './client';

describe('apiClient', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it('throws ApiError on a 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    await expect(createApiClient('').get('/api/tasks')).rejects.toThrow();
  });
  it('returns parsed json on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ id: '1' }]), { status: 200, headers: { 'content-type': 'application/json' } })));
    expect(await createApiClient('').get('/api/tasks')).toEqual([{ id: '1' }]);
  });

  it('invokes onUnauthorized with the path on a 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    const onUnauthorized = vi.fn();
    await expect(createApiClient('', onUnauthorized).get('/api/tasks')).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledWith('/api/tasks');
  });

  it('does not invoke onUnauthorized when /api/login itself 401s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad creds', { status: 401 })));
    const onUnauthorized = vi.fn();
    await expect(createApiClient('', onUnauthorized).post('/api/login', {})).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('does not invoke onUnauthorized on non-401 errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const onUnauthorized = vi.fn();
    await expect(createApiClient('', onUnauthorized).get('/api/tasks')).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
