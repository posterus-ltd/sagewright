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

// The stable identity key every per-user table references (repos, envs, sessions…).
// Usernames are the human login handle; this UUID is what the rest of the system keys on.
export const userIdSchema = z.string().uuid();

// Only admin/user are assignable through the API; root is seeded and never granted.
// `.exclude` takes the enum key; the result still yields UserRole values.
export const assignableRoleSchema = z.enum(UserRole).exclude(['ROOT']);

/** Minimum length for a user-chosen password (generated one-time passwords are longer). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The requirements a user-chosen password must satisfy, as a data-driven list so the UI
 * can render a live "requirements met" checklist and the server enforces the very same
 * rules — one source of truth for both. The repeat/confirm match is a relation between
 * two fields rather than a property of one password, so it lives in the form, not here.
 */
export interface PasswordRule {
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { label: `At least ${MIN_PASSWORD_LENGTH} characters`, test: (p) => p.length >= MIN_PASSWORD_LENGTH },
  { label: 'Contains letters', test: (p) => /[a-z]/i.test(p) },
  { label: 'Contains numbers', test: (p) => /[0-9]/.test(p) },
];

/** True only when a password satisfies every rule in {@link PASSWORD_RULES}. */
export const isStrongPassword = (password: string): boolean => PASSWORD_RULES.every((rule) => rule.test(password));

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
  // Enforce the same rules the UI checklist shows, so a client that skips the checks
  // (or a direct API call) can't set a weak password.
  newPassword: z
    .string()
    .refine(isStrongPassword, `password must be at least ${MIN_PASSWORD_LENGTH} characters and contain letters and numbers`),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const setUserRoleSchema = z.object({ role: assignableRoleSchema });
export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;

/** A user as listed in the management panel. */
export interface User {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
  createdAt: string;
}

/** The current session's identity + gate state, read live from the DB on each request. */
export interface MeResponse {
  id: string;
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
