import { asc, eq } from 'drizzle-orm';
import {
  UserRole,
  type CreateUserResult,
  type ResetPasswordResult,
  type User,
} from '@sagewright/shared';

import { generateInitialPassword, hashPassword, verifyPassword } from '../auth/password';
import type { Db } from '../db/client';
import { users } from '../db/schema';

const ROOT_USERNAME = 'root';

// Usernames are the identity key shared with every per-user table, so normalize to
// trimmed-lowercase everywhere (the shared schema does this too; this is defense in
// depth for callers that bypass it, e.g. seeding).
const normalize = (username: string): string => username.trim().toLowerCase();

type UserRow = typeof users.$inferSelect;

const toUser = (row: UserRow): User => ({
  username: row.username,
  role: row.role as UserRole,
  mustChangePassword: row.mustChangePassword,
  createdAt: row.createdAt.toISOString(),
});

/** Domain error the routes map to an HTTP status via {@link userErrorStatus}. */
export type UserErrorCode = 'conflict' | 'not_found' | 'forbidden' | 'invalid_current';

export class UserServiceError extends Error {
  constructor(
    public readonly code: UserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

interface UserServiceDeps {
  db: Db;
}

export const createUserService = (deps: UserServiceDeps) => {
  const findRow = async (username: string): Promise<UserRow | null> => {
    const [row] = await deps.db
      .select()
      .from(users)
      .where(eq(users.username, normalize(username)))
      .limit(1);
    return row ?? null;
  };

  return {
    findByUsername: async (username: string): Promise<User | null> => {
      const row = await findRow(username);
      return row ? toUser(row) : null;
    },

    list: async (): Promise<User[]> => {
      const rows = await deps.db.select().from(users).orderBy(asc(users.createdAt));
      return rows.map(toUser);
    },

    /**
     * Create a user with an auto-generated one-time password, returned in plaintext
     * ONCE (only its hash is stored). The user must change it on first login.
     */
    create: async (username: string, role: UserRole = UserRole.USER): Promise<CreateUserResult> => {
      const name = normalize(username);
      if (name === ROOT_USERNAME) throw new UserServiceError('conflict', 'root is reserved');
      if (await findRow(name)) throw new UserServiceError('conflict', 'username already exists');
      const initialPassword = generateInitialPassword();
      await deps.db.insert(users).values({
        username: name,
        passwordHash: hashPassword(initialPassword),
        role,
        mustChangePassword: true,
      });
      return { username: name, role, initialPassword };
    },

    /** Verify credentials; returns the user on success, null on unknown user or bad password. */
    verifyLogin: async (username: string, password: string): Promise<User | null> => {
      const row = await findRow(username);
      if (!row || !verifyPassword(password, row.passwordHash)) return null;
      return toUser(row);
    },

    /**
     * Self-service password change: verifies the current password, sets the new hash
     * and clears `mustChangePassword` (this is how the forced-change flow completes).
     */
    changePassword: async (username: string, current: string, next: string): Promise<void> => {
      const row = await findRow(username);
      if (!row) throw new UserServiceError('not_found', 'user not found');
      if (!verifyPassword(current, row.passwordHash)) {
        throw new UserServiceError('invalid_current', 'current password is incorrect');
      }
      await deps.db
        .update(users)
        .set({ passwordHash: hashPassword(next), mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, row.id));
    },

    /**
     * Admin reset: generate a new one-time password, force a change on next login, and
     * return the plaintext ONCE. Root's password is never reset via the API (that would
     * let an admin take over root) — root changes its own password self-service.
     */
    resetPassword: async (username: string): Promise<ResetPasswordResult> => {
      const row = await findRow(username);
      if (!row) throw new UserServiceError('not_found', 'user not found');
      if (row.role === UserRole.ROOT) throw new UserServiceError('forbidden', 'root password cannot be reset');
      const initialPassword = generateInitialPassword();
      await deps.db
        .update(users)
        .set({ passwordHash: hashPassword(initialPassword), mustChangePassword: true, updatedAt: new Date() })
        .where(eq(users.id, row.id));
      return { username: row.username, initialPassword };
    },

    /** Promote/demote a user. Root is immutable and cannot be re-roled. */
    setRole: async (username: string, role: UserRole): Promise<void> => {
      const row = await findRow(username);
      if (!row) throw new UserServiceError('not_found', 'user not found');
      if (row.role === UserRole.ROOT) throw new UserServiceError('forbidden', 'root role is immutable');
      await deps.db
        .update(users)
        .set({ role, updatedAt: new Date() })
        .where(eq(users.id, row.id));
    },

    /** Delete a user. Root cannot be deleted, and callers cannot delete themselves. */
    remove: async (username: string, actingUsername: string): Promise<void> => {
      const name = normalize(username);
      const row = await findRow(name);
      if (!row) throw new UserServiceError('not_found', 'user not found');
      if (row.role === UserRole.ROOT) throw new UserServiceError('forbidden', 'root cannot be deleted');
      if (name === normalize(actingUsername)) throw new UserServiceError('forbidden', 'you cannot delete yourself');
      await deps.db.delete(users).where(eq(users.id, row.id));
    },

    /**
     * Insert the `root` account. Seed-only (bypasses the root-is-reserved guard); callers
     * must check existence first for idempotency — see {@link file://./seed-root.ts}.
     */
    provisionRoot: async (rootPassword: string): Promise<void> => {
      await deps.db.insert(users).values({
        username: ROOT_USERNAME,
        passwordHash: hashPassword(rootPassword),
        role: UserRole.ROOT,
        mustChangePassword: true,
      });
    },
  };
};

export type UserService = ReturnType<typeof createUserService>;
