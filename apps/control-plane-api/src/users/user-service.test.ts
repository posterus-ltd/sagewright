import { randomUUID } from 'node:crypto';

import { UserRole } from '@sagewright/shared';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../test/make-test-app';
import { UserServiceError, createUserService } from './user-service';

// A clean DB (no seeded users) with a service pointed at it.
const svc = async () => {
  const { db } = await makeTestApp({}, { seedUsers: [] });
  return createUserService({ db: db as never });
};

describe('createUserService', () => {
  it('creates a user with a one-time password returned in plaintext once', async () => {
    const s = await svc();
    const { username, role, initialPassword } = await s.create('alice');
    expect(username).toBe('alice');
    expect(role).toBe(UserRole.USER);
    expect(initialPassword).toMatch(/^[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}$/);
    const stored = await s.findByUsername('alice');
    expect(stored).toMatchObject({ username: 'alice', role: UserRole.USER, mustChangePassword: true });
    // The plaintext is not stored — but it does verify against the stored hash.
    expect(await s.verifyLogin('alice', initialPassword)).toMatchObject({ username: 'alice' });
  });

  it('normalizes usernames so Alice and alice are the same account', async () => {
    const s = await svc();
    await s.create('Alice');
    expect(await s.findByUsername('ALICE')).toMatchObject({ username: 'alice' });
    await expect(s.create('alice')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('refuses to create the reserved root username', async () => {
    const s = await svc();
    await expect(s.create('root')).rejects.toBeInstanceOf(UserServiceError);
    await expect(s.create('Root')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('verifyLogin returns null for a wrong password or unknown user', async () => {
    const s = await svc();
    const { initialPassword } = await s.create('alice');
    expect(await s.verifyLogin('alice', 'wrong')).toBeNull();
    expect(await s.verifyLogin('ghost', initialPassword)).toBeNull();
    expect(await s.verifyLogin('alice', initialPassword)).not.toBeNull();
  });

  it('changePassword verifies the current password and clears the forced-change flag', async () => {
    const s = await svc();
    const { initialPassword } = await s.create('alice');
    const { id } = (await s.findByUsername('alice'))!;
    await expect(s.changePassword(id, 'wrong', 'a-new-password')).rejects.toMatchObject({ code: 'invalid_current' });
    await s.changePassword(id, initialPassword, 'a-new-password');
    expect(await s.findByUsername('alice')).toMatchObject({ mustChangePassword: false });
    expect(await s.verifyLogin('alice', 'a-new-password')).not.toBeNull();
    expect(await s.verifyLogin('alice', initialPassword)).toBeNull();
  });

  it('resetPassword issues a new one-time password and re-sets the forced-change flag', async () => {
    const s = await svc();
    const { initialPassword } = await s.create('alice');
    const { id } = (await s.findByUsername('alice'))!;
    await s.changePassword(id, initialPassword, 'chosen-password');
    const { initialPassword: reset } = await s.resetPassword(id);
    expect(reset).not.toBe('chosen-password');
    expect(await s.findByUsername('alice')).toMatchObject({ mustChangePassword: true });
    expect(await s.verifyLogin('alice', 'chosen-password')).toBeNull();
    expect(await s.verifyLogin('alice', reset)).not.toBeNull();
  });

  it('never resets, re-roles, or deletes the root account', async () => {
    const s = await svc();
    await s.provisionRoot('root-secret');
    const { id: rootId } = (await s.findByUsername('root'))!;
    await expect(s.resetPassword(rootId)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(s.setRole(rootId, UserRole.USER)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(s.remove(rootId, rootId)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('setRole promotes and demotes a user', async () => {
    const s = await svc();
    await s.create('alice');
    const { id } = (await s.findByUsername('alice'))!;
    await s.setRole(id, UserRole.ADMIN);
    expect(await s.findByUsername('alice')).toMatchObject({ role: UserRole.ADMIN });
    await s.setRole(id, UserRole.USER);
    expect(await s.findByUsername('alice')).toMatchObject({ role: UserRole.USER });
  });

  it('remove deletes another user but blocks deleting yourself', async () => {
    const s = await svc();
    await s.create('alice');
    await s.create('bob');
    const { id: aliceId } = (await s.findByUsername('alice'))!;
    const { id: bobId } = (await s.findByUsername('bob'))!;
    await expect(s.remove(aliceId, aliceId)).rejects.toMatchObject({ code: 'forbidden' });
    await s.remove(bobId, aliceId);
    expect(await s.findByUsername('bob')).toBeNull();
  });

  it('surfaces not_found for operations on a missing user', async () => {
    const s = await svc();
    const ghost = randomUUID();
    await expect(s.changePassword(ghost, 'x', 'yyyyyyyy')).rejects.toMatchObject({ code: 'not_found' });
    await expect(s.resetPassword(ghost)).rejects.toMatchObject({ code: 'not_found' });
    await expect(s.setRole(ghost, UserRole.ADMIN)).rejects.toMatchObject({ code: 'not_found' });
    await expect(s.remove(ghost, randomUUID())).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lists users in creation order', async () => {
    const s = await svc();
    await s.create('alice');
    await s.create('bob');
    expect((await s.list()).map((u) => u.username)).toEqual(['alice', 'bob']);
  });
});
