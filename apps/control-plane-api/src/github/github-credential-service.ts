import { GithubCredentialSource } from '@sagewright/shared';
import { eq } from 'drizzle-orm';

import type { AppConfig } from '../config';
import type { SecretCipher } from '../crypto/secret-cipher';
import type { Db } from '../db/client';
import { githubCredentials } from '../db/schema';
import type { UserEnvService } from '../user-env/user-env-service';

export interface GithubIdentity {
  login: string;
  name: string | null;
  email: string;
}

export interface ResolvedGithubCredential extends GithubIdentity {
  token: string;
}

interface GithubCredentialServiceDeps {
  db: Db;
  cipher: SecretCipher;
  config: Pick<AppConfig, 'githubToken'>;
  userEnvService: Pick<UserEnvService, 'getValue'>;
  fetch?: typeof fetch;
}

interface GithubUserResponse {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
}

interface GithubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export class GithubTokenValidationError extends Error {}

const parseScopes = (header: string | null): string[] =>
  (header ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();

const noreplyEmail = (user: GithubUserResponse): string =>
  `${user.id}+${user.login}@users.noreply.github.com`;

const chooseEmail = (user: GithubUserResponse, emails: GithubEmailResponse[]): string => {
  const verifiedPublicPrimary = emails.find((e) => e.primary && e.verified && e.visibility === 'public');
  const verifiedPrimary = emails.find((e) => e.primary && e.verified);
  return user.email ?? verifiedPublicPrimary?.email ?? verifiedPrimary?.email ?? noreplyEmail(user);
};

export const createGithubCredentialService = (deps: GithubCredentialServiceDeps) => {
  const apiFetch = deps.fetch ?? fetch;

  const fetchJson = async <T>(token: string, path: string): Promise<{ data: T; scopes: string[] }> => {
    const res = await apiFetch(`https://api.github.com${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'sagewright-control-plane',
      },
    });
    if (res.status === 401 || res.status === 403) throw new GithubTokenValidationError('GitHub token was rejected');
    if (!res.ok) throw new Error(`GitHub API request failed: ${res.status}`);
    return { data: await res.json() as T, scopes: parseScopes(res.headers.get('x-oauth-scopes')) };
  };

  const findRow = async (userKey: string) => {
    const [row] = await deps.db
      .select()
      .from(githubCredentials)
      .where(eq(githubCredentials.userKey, userKey))
      .limit(1);
    return row;
  };

  const validateAndStore = async (
    userKey: string,
    token: string,
    source: GithubCredentialSource = GithubCredentialSource.PAT,
  ): Promise<{ identity: GithubIdentity; scopes: string[]; missingRepoScope: boolean }> => {
    const trimmed = token.trim();
    if (!trimmed) throw new GithubTokenValidationError('GitHub token is required');

    const userResult = await fetchJson<GithubUserResponse>(trimmed, '/user');
    const emailsResult = await fetchJson<GithubEmailResponse[]>(trimmed, '/user/emails')
      .catch(() => ({ data: [], scopes: userResult.scopes }));
    const scopes = [...new Set([...userResult.scopes, ...emailsResult.scopes])].sort();
    const identity = {
      login: userResult.data.login,
      name: userResult.data.name,
      email: chooseEmail(userResult.data, emailsResult.data),
    };

    await deps.db
      .insert(githubCredentials)
      .values({
        userKey,
        tokenEncrypted: deps.cipher.encrypt(trimmed),
        source,
        login: identity.login,
        name: identity.name,
        email: identity.email,
        scopes,
      })
      .onConflictDoUpdate({
        target: githubCredentials.userKey,
        set: { tokenEncrypted: deps.cipher.encrypt(trimmed), source, ...identity, scopes, updatedAt: new Date() },
      });

    return { identity, scopes, missingRepoScope: !scopes.includes('repo') };
  };

  return {
    validateAndStore,

    resolve: async (userKey: string): Promise<ResolvedGithubCredential | undefined> => {
      const row = await findRow(userKey);
      if (row) {
        return {
          token: deps.cipher.decrypt(row.tokenEncrypted),
          login: row.login,
          name: row.name,
          email: row.email,
        };
      }

      const legacyToken = await deps.userEnvService.getValue(userKey, 'GITHUB_TOKEN');
      if (legacyToken) return { token: legacyToken, login: userKey, name: userKey, email: 'bot@sagewright' };
      if (deps.config.githubToken) return { token: deps.config.githubToken, login: 'sagewright', name: 'sagewright', email: 'bot@sagewright' };
      return undefined;
    },

    getStatus: async (userKey: string) => {
      const row = await findRow(userKey);
      if (!row) return { connected: false as const };
      return {
        connected: true as const,
        source: row.source as GithubCredentialSource,
        login: row.login,
        name: row.name,
        email: row.email,
        scopes: row.scopes,
        missingRepoScope: !row.scopes.includes('repo'),
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    disconnect: async (userKey: string): Promise<void> => {
      await deps.db.delete(githubCredentials).where(eq(githubCredentials.userKey, userKey));
    },
  };
};

export type GithubCredentialService = ReturnType<typeof createGithubCredentialService>;
