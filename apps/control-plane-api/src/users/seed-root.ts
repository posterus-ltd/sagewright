import type { UserService } from './user-service';

interface SeedRootDeps {
  userService: UserService;
  rootPassword: string;
}

/**
 * Seed the `root` account from `ROOT_PASSWORD` on first boot. Idempotent: does nothing
 * if a `root` user already exists, so it is safe to call on every startup. Root is
 * created with `mustChangePassword=true`, so the operator is forced to change the
 * configured password on their first login.
 *
 * @returns true when a new root account was created, false when one already existed.
 */
export const seedRootUser = async ({ userService, rootPassword }: SeedRootDeps): Promise<boolean> => {
  const existing = await userService.findByUsername('root');
  if (existing) return false;
  await userService.provisionRoot(rootPassword);
  return true;
};
