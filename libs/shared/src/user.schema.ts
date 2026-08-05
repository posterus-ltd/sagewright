import { z } from 'zod';

/**
 * A user's role. `root` is seeded once from `ROOT_PASSWORD`, is immutable (never
 * demoted or deleted) and is never assignable via the API. `admin` is grantable by
 * root/admins and unlocks user management. `user` is the default for everyone else.
 */
export enum UserRole {
  ROOT = 'root',
  ADMIN = 'admin',
  USER = 'user',
}

/** Roles that may reach user-management + other admin-only routes. */
export const ADMIN_ROLES: readonly UserRole[] = [UserRole.ROOT, UserRole.ADMIN];

/** True for a role that may manage users. */
export const isAdminRole = (role: UserRole): boolean => ADMIN_ROLES.includes(role);

// Usernames are the identity key for every per-user table (repos, envs, sessions…),
// so keep them simple and collision-free: lowercased, 2–32 chars of letters/digits
// with dot/underscore/hyphen inside. `.toLowerCase()` here means `Root` and `root`
// resolve to the same key at the boundary (the service normalizes again defensively).
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, 'username must be 2–32 chars: letters, digits, dot, underscore or hyphen');

// Only admin/user are assignable through the API; root is seeded and never granted.
// `.exclude` takes the enum key; the result still yields UserRole values.
export const assignableRoleSchema = z.enum(UserRole).exclude(['ROOT']);

/** Minimum length for a user-chosen password (generated one-time passwords are longer). */
export const MIN_PASSWORD_LENGTH = 8;

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  username: usernameSchema,
  role: assignableRoleSchema.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const setUserRoleSchema = z.object({ role: assignableRoleSchema });
export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;

/** A user as listed in the management panel. */
export interface User {
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
  createdAt: string;
}

/** The current session's identity + gate state, read live from the DB on each request. */
export interface MeResponse {
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
}

/** Result of the login endpoint on success. */
export type LoginResult = MeResponse;

/** Creating a user returns its one-time password ONCE — only its hash is stored. */
export interface CreateUserResult {
  username: string;
  role: UserRole;
  initialPassword: string;
}

/** Resetting a password returns the new one-time password ONCE. */
export interface ResetPasswordResult {
  username: string;
  initialPassword: string;
}
