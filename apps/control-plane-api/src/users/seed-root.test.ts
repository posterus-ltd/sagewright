import { UserRole } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../test/make-test-app';
import { seedRootUser } from './seed-root';
import { createUserService } from './user-service';

const svc = async () => {
  const { db } = await makeTestApp({}, { seedUsers: [] });
  return createUserService({ db: db as never });
};

describe('seedRootUser', () => {
  it('creates a root user that must change its password on first login', async () => {
    const userService = await svc();
    const created = await seedRootUser({ userService, rootPassword: 'initial-secret' });
    expect(created).toBe(true);
    expect(await userService.findByUsername('root')).toMatchObject({
      role: UserRole.ROOT,
      mustChangePassword: true,
    });
    expect(await userService.verifyLogin('root', 'initial-secret')).not.toBeNull();
  });

  it('is idempotent — a second call leaves the existing root untouched', async () => {
    const userService = await svc();
    await seedRootUser({ userService, rootPassword: 'initial-secret' });
    const second = await seedRootUser({ userService, rootPassword: 'a-different-password' });
    expect(second).toBe(false);
    // The original password still works; the second call did not overwrite it.
    expect(await userService.verifyLogin('root', 'initial-secret')).not.toBeNull();
    expect(await userService.verifyLogin('root', 'a-different-password')).toBeNull();
  });
});
