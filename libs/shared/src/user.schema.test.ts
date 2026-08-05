import { describe, expect, it } from 'vitest';

import {
  UserRole,
  assignableRoleSchema,
  changePasswordSchema,
  createUserSchema,
  isAdminRole,
  loginSchema,
  usernameSchema,
} from './index';

describe('usernameSchema', () => {
  it('lowercases and trims so Root and root collapse to one key', () => {
    expect(usernameSchema.parse('  Root ')).toBe('root');
  });
  it('accepts dot/underscore/hyphen inside', () => {
    expect(usernameSchema.parse('ada.lovelace_1-x')).toBe('ada.lovelace_1-x');
  });
  it('accepts a 2-char name but rejects a 1-char name', () => {
    expect(usernameSchema.safeParse('al').success).toBe(true);
    expect(usernameSchema.safeParse('a').success).toBe(false);
  });
  it('rejects illegal characters', () => {
    expect(usernameSchema.safeParse('a b').success).toBe(false);
    expect(usernameSchema.safeParse('a@b').success).toBe(false);
  });
});

describe('assignableRoleSchema', () => {
  it('accepts admin and user', () => {
    expect(assignableRoleSchema.parse('admin')).toBe(UserRole.ADMIN);
    expect(assignableRoleSchema.parse('user')).toBe(UserRole.USER);
  });
  it('never accepts root', () => {
    expect(assignableRoleSchema.safeParse('root').success).toBe(false);
  });
});

describe('isAdminRole', () => {
  it('is true for root and admin only', () => {
    expect(isAdminRole(UserRole.ROOT)).toBe(true);
    expect(isAdminRole(UserRole.ADMIN)).toBe(true);
    expect(isAdminRole(UserRole.USER)).toBe(false);
  });
});

describe('loginSchema', () => {
  it('normalizes the username and keeps the raw password', () => {
    expect(loginSchema.parse({ username: 'AL', password: ' pw ' })).toEqual({ username: 'al', password: ' pw ' });
  });
});

describe('createUserSchema', () => {
  it('makes role optional', () => {
    expect(createUserSchema.parse({ username: 'alice' })).toEqual({ username: 'alice' });
  });
});

describe('changePasswordSchema', () => {
  it('enforces a minimum new-password length', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'short' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'longenough' }).success).toBe(true);
  });
});
