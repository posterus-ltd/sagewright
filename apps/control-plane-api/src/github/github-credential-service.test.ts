import { describe, expect, it, vi } from 'vitest';

import { createSecretCipher } from '../crypto/secret-cipher';
import { createGithubCredentialService, GithubTokenValidationError } from './github-credential-service';
import { makeTestApp } from '../test/make-test-app';

const jsonResponse = (body: unknown, scopes = 'repo, read:user, user:email', status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-oauth-scopes': scopes },
  });

describe('github credential service', () => {
  it('validates, captures identity, stores encrypted, and resolves the token', async () => {
    const { db, userId } = await makeTestApp();
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) return jsonResponse({ id: 42, login: 'octo', name: 'Octo Cat', email: null });
      return jsonResponse([{ email: 'octo@example.com', primary: true, verified: true, visibility: 'private' }]);
    });
    const service = createGithubCredentialService({
      db: db as never,
      cipher: createSecretCipher('0123456789abcdef0123456789abcdef'),
      config: {},
      userEnvService: { getValue: async () => undefined },
      fetch: fetch as never,
    });

    const stored = await service.validateAndStore(userId('al'), ' ghp_user ');

    expect(stored).toMatchObject({
      identity: { login: 'octo', name: 'Octo Cat', email: 'octo@example.com' },
      missingRepoScope: false,
    });
    await expect(service.resolve(userId('al'))).resolves.toMatchObject({
      token: 'ghp_user',
      login: 'octo',
      name: 'Octo Cat',
      email: 'octo@example.com',
    });
    await expect(service.getStatus(userId('al'))).resolves.toMatchObject({
      connected: true,
      login: 'octo',
      scopes: ['read:user', 'repo', 'user:email'],
    });
  });

  it('falls back to GitHub noreply email when no verified address is available', async () => {
    const { db, userId } = await makeTestApp();
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/user')) return jsonResponse({ id: 42, login: 'octo', name: null, email: null });
      return jsonResponse([]);
    });
    const service = createGithubCredentialService({
      db: db as never,
      cipher: createSecretCipher('0123456789abcdef0123456789abcdef'),
      config: {},
      userEnvService: { getValue: async () => undefined },
      fetch: fetch as never,
    });

    await service.validateAndStore(userId('al'), 'ghp_user');

    await expect(service.resolve(userId('al'))).resolves.toMatchObject({
      email: '42+octo@users.noreply.github.com',
    });
  });

  it('reports missing repo scope and rejects bad tokens', async () => {
    const { db, userId } = await makeTestApp();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 1, login: 'octo', name: null, email: 'octo@example.com' }, 'read:user'))
      .mockResolvedValueOnce(jsonResponse([], 'read:user'))
      .mockResolvedValueOnce(jsonResponse({ message: 'bad' }, '', 401));
    const service = createGithubCredentialService({
      db: db as never,
      cipher: createSecretCipher('0123456789abcdef0123456789abcdef'),
      config: {},
      userEnvService: { getValue: async () => undefined },
      fetch: fetch as never,
    });

    await expect(service.validateAndStore(userId('al'), 'ghp_user')).resolves.toMatchObject({ missingRepoScope: true });
    await expect(service.validateAndStore(userId('bo'), 'bad')).rejects.toBeInstanceOf(GithubTokenValidationError);
  });

  it('resolves with precedence: stored credential, legacy env token, operator token, none', async () => {
    const { db, userId } = await makeTestApp({}, {
      seedUsers: [{ username: 'stored' }, { username: 'legacy' }, { username: 'other' }, { username: 'none' }],
    });
    const service = createGithubCredentialService({
      db: db as never,
      cipher: createSecretCipher('0123456789abcdef0123456789abcdef'),
      config: { githubToken: 'operator' },
      userEnvService: { getValue: async (id) => (id === userId('legacy') ? 'legacy-token' : undefined) },
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/user')) return jsonResponse({ id: 42, login: 'octo', name: null, email: 'octo@example.com' });
        return jsonResponse([]);
      }) as never,
    });

    await service.validateAndStore(userId('stored'), 'stored-token');

    await expect(service.resolve(userId('stored'))).resolves.toMatchObject({ token: 'stored-token', login: 'octo' });
    await expect(service.resolve(userId('legacy'))).resolves.toMatchObject({ token: 'legacy-token' });
    await expect(service.resolve(userId('other'))).resolves.toMatchObject({ token: 'operator' });

    const noFallback = createGithubCredentialService({
      db: db as never,
      cipher: createSecretCipher('0123456789abcdef0123456789abcdef'),
      config: {},
      userEnvService: { getValue: async () => undefined },
    });
    await expect(noFallback.resolve(userId('none'))).resolves.toBeUndefined();
  });
});
