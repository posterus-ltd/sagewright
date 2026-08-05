# Plan: Real login access with a `root` account, forced password change, and user management

## Context

Today Sagewright has **no real authentication**. `apps/control-plane-api/src/auth/auth-plugin.ts`
accepts **any** `displayName` as long as `password === APP_PASSWORD` (a single shared secret,
compared in plaintext), then signs an HMAC `vm_session` cookie. There is no `users` table, no
password hashing, and no roles. The README's SECURITY WARNING flags hardening this as tracked work.

This change replaces the shared password with real per-user accounts:

- The configured secret is renamed `APP_PASSWORD` → **`ROOT_PASSWORD`** and becomes the initial
  password of a seeded **`root`** account.
- **Every account must change its password on first login** (`root` included), and again after an
  admin reset.
- **`root` (and anyone `root` promotes to `admin`) sees a User Management panel** in Settings to
  create users, reset passwords, promote/demote, and delete.
- Creating a user or resetting a password **auto-generates a readable one-time password**, shown to
  the admin **once** to share out-of-band. Only its hash is stored.
- All users get a self-service **Change password** section in Settings.

### Key design decisions

- **Username stays the identity key.** Every per-user table keys on `user_key` / `created_by` =
  the login name (`schema.ts:5,87,95,108`). We make `users.username` that same key — **no data
  migration of existing tables**, and `req.displayName` (consumed by every route's `requireUser`)
  keeps its meaning. `users` is simply the new source of truth for *who may log in*.
- **Password hashing uses Node's built-in `crypto.scrypt`** (random per-user salt, `timingSafeEqual`
  compare) — no new dependency, consistent with the existing `node:crypto` usage in
  `session-cookie.ts` / `secret-cipher.ts`. (argon2/bcrypt are alternatives but add a native dep and
  Docker build cost; scrypt is the recommendation.)
- **The session cookie is unchanged** (`session-cookie.ts` signs a username string). The
  `mustChangePassword` flag is read live from the DB in the auth guard, so a reset takes effect on
  the user's next request without any token-versioning machinery.
- **Roles** are an enum `root | admin | user`. `root` is seeded, immutable (cannot be deleted or
  demoted), and never assignable via the API. `admin` is grantable by root/admins.

---

## Backend — `apps/control-plane-api`

### 1. Schema + migration
- **`src/db/schema.ts`** — add a `users` table following existing style:
  `id uuid pk defaultRandom`, `username text notNull unique`, `passwordHash text notNull`,
  `role text notNull default 'user'`, `mustChangePassword boolean notNull default true`,
  `createdAt` / `updatedAt` timestamptz. Normalize usernames to trimmed-lowercase in the service so
  `Root` and `root` can't collide.
- **`drizzle/`** — generate `0002_*.sql` with drizzle-kit (`npx drizzle-kit generate` against
  `drizzle.config.ts`). It auto-applies at container boot via `dist/db/migrate.js`
  (`Dockerfile` CMD). Add the same `CREATE TABLE users (...)` DDL to the `TABLE_STMTS` array in
  **`src/test/make-test-app.ts`** (pg-mem does not run migrations).

### 2. Password utilities — new `src/auth/password.ts`
- `hashPassword(plain): string` → `scrypt$<saltB64>$<hashB64>` (16-byte random salt).
- `verifyPassword(plain, stored): boolean` → `timingSafeEqual`, false on malformed input.
- `generateInitialPassword(): string` → `crypto.randomBytes` mapped to an unambiguous
  Crockford-style base32 charset (no `0/O/1/I/l`), ~10–12 chars grouped `xxxx-xxxx` for readability.

### 3. Users domain — new `src/users/`
Mirror the `user-settings` domain (`user-settings-service.ts` + `user-settings-routes.ts`).
- **`user-service.ts`** — `createUserService({ db })`:
  `findByUsername`, `list`, `create(username, role)` (hashes a generated password, returns the
  plaintext once), `verifyLogin(username, password)`, `changePassword(username, current, next)`
  (verifies current, sets hash, clears `mustChangePassword`), `resetPassword(username)` (generates,
  sets `mustChangePassword=true`, returns plaintext), `setRole(username, role)`, `remove(username)`.
  Guards: `root` cannot be demoted/deleted; callers can't delete themselves.
- **`seed-root.ts`** — `seedRootUser({ userService, rootPassword })`: if no `root` user exists,
  create it with `hashPassword(rootPassword)`, `role=root`, `mustChangePassword=true`. Idempotent.
- **`user-routes.ts`** — `registerUserRoutes(app, deps)`, all `preHandler: app.requireAdmin`,
  zod-validated bodies:
  - `GET /api/users` → `[{ username, role, mustChangePassword, createdAt }]`
  - `POST /api/users` `{ username, role? }` → `{ username, role, initialPassword }`
  - `POST /api/users/:username/reset-password` → `{ username, initialPassword }`
  - `PATCH /api/users/:username` `{ role }` → 204 (root immutable)
  - `DELETE /api/users/:username` → 204 (root & self protected)

### 4. Auth rework — `src/auth/auth-plugin.ts`
Change `registerAuth(app, { userService, sessionSecret })` and:
- `POST /api/login` `{ username, password }` → `userService.verifyLogin`; on success set the cookie
  (`sc.sign(username)`) and return `{ username, role, mustChangePassword }`; else 401.
- `POST /api/logout` → `reply.clearCookie` → 204.
- `GET /api/me` (`requireUser`) → `{ username, role, mustChangePassword }`.
- `POST /api/change-password` (`requireUser`) `{ currentPassword, newPassword }` →
  `userService.changePassword` → 204. Allowed even while `mustChangePassword` is set (that's its job).
- Extend **`requireUser`**: verify cookie → username, **load the user** (401 if it no longer exists),
  set `req.user = { username, role, mustChangePassword }` and keep `req.displayName = username`
  (backward-compatible with every existing route). If `mustChangePassword` is true and the request
  path is **not** in the allowlist (`/api/change-password`, `/api/logout`, `/api/me`), return
  `403 { error: 'password_change_required' }`. One seam gates the whole app.
- Add **`requireAdmin`** decorator: runs `requireUser`, then 403 unless `role ∈ {root, admin}`.

### 5. Config + wiring
- **`src/config.ts`** — rename `APP_PASSWORD` → `ROOT_PASSWORD` (schema, `AppConfig.rootPassword`,
  return map). (Breaking for existing deploys — intended per the request. Optional one-release
  fallback: `ROOT_PASSWORD ?? APP_PASSWORD`.)
- **`src/app.ts`** — add `userService` to `AppDeps`; register `registerAuth(app, { userService,
  sessionSecret })` and `registerUserRoutes(app, deps)`.
- **`src/main.ts`** — `const userService = createUserService({ db })`; pass into `buildApp`; call
  `await seedRootUser({ userService, rootPassword: config.rootPassword })` at the top of `start()`
  before `app.listen`.

### 6. Shared contracts — `libs/shared/src/user.schema.ts` (export from `index.ts`)
`enum UserRole { ROOT='root', ADMIN='admin', USER='user' }`, `loginSchema`, `createUserSchema`,
`changePasswordSchema`, and types `User`, `MeResponse`, `CreateUserResult` (with `initialPassword`),
`ResetPasswordResult`. Both form and route `safeParse` the same schema.

---

## Frontend — `apps/control-plane-web`

- **`src/auth/useAuth.ts`** — `login` posts `{ username, password }`, stores username, returns the
  login result. Add `useMe()` (react-query `GET /api/me`, source of truth for `role` +
  `mustChangePassword`) and `logout` calls `POST /api/logout`.
- **`src/auth/LoginPage.tsx`** — relabel "Display name" → "Username". On a login result with
  `mustChangePassword`, route into the forced-change flow.
- **Forced first-login change** — in `AuthGate`/`Layout` (`src/router.tsx`), gate on `useMe()`:
  while loading show a spinner; if `mustChangePassword` render a **ForcedChangePassword** screen
  instead of `<Outlet/>`. As a safety net, handle `403 password_change_required` in
  `src/api/client.ts` (redirect to the change-password screen), mirroring the existing 401 handler.
- **Settings sections** (`src/config/SettingsPage.tsx`, add `<Divider/>` + section into the `<Stack>`):
  - **ChangePasswordSection** (all users) — current + new password fields, `useChangePassword`.
  - **UserManagementSection** (only if `me.role ∈ {root, admin}`) — MUI **DataGrid** of users
    (copy `sessions/session-list-columns.tsx`: columns username / role / must-change chip /
    createdAt + hover actions reset·promote·delete). A **Create user** button opens a dialog
    (copy `scheduled/ScheduledPromptDialog.tsx`: username + role select). Create and Reset return a
    generated password shown once in a **"share this password" dialog** with a copy button. Delete
    uses `ConfirmDialogProvider`.
- **`src/api/hooks.ts`** — add `useMe`, `useLogout`, `useChangePassword`, `useUsers`,
  `useCreateUser`, `useResetPassword`, `useSetUserRole`, `useDeleteUser`, following the existing
  `useMutation` + `invalidateQueries` pattern. Types from `@sagewright/shared`.

---

## Docs

- **`.env.example`** / **`.env`** — `APP_PASSWORD` → `ROOT_PASSWORD` with a comment: initial password
  for the `root` account; you'll be forced to change it on first login.
- **`docker-compose.yml`** — `APP_PASSWORD: ${APP_PASSWORD}` → `ROOT_PASSWORD: ${ROOT_PASSWORD}`.
- **`README.md`** — rewrite the SECURITY WARNING (there is now per-user auth with hashing, roles, and
  forced password change) while **keeping** the Docker-socket blast-radius warning and the
  private-network guidance. Update Setup step 1 (`ROOT_PASSWORD`) and step 4 (log in as `root`, then
  the forced change). *(README is not an alignment file, so it's edited directly, not proposed.)*

---

## Files to modify / create

**Backend:** `src/db/schema.ts`, `drizzle/0002_*.sql`, `src/test/make-test-app.ts`,
`src/config.ts`, `src/app.ts`, `src/main.ts`, `src/auth/auth-plugin.ts`, **new** `src/auth/password.ts`,
**new** `src/users/{user-service,user-routes,seed-root}.ts`.
**Shared:** **new** `libs/shared/src/user.schema.ts` + `libs/shared/src/index.ts`.
**Frontend:** `src/auth/useAuth.ts`, `src/auth/LoginPage.tsx`, `src/router.tsx`, `src/api/client.ts`,
`src/api/hooks.ts`, `src/config/SettingsPage.tsx`, **new** user-management dialog/section components.
**Docs:** `.env.example`, `.env`, `docker-compose.yml`, `README.md`.

---

## Verification

Per project quirks: this repo uses **npm, not pnpm**; run tasks via `npm exec nx -- ...`. The web
app has **pre-existing, unrelated** typecheck errors — ignore those.

1. **Unit tests (pg-mem, vitest)** — co-locate `.test.ts` files:
   - `password.test.ts` — hash/verify roundtrip, wrong password, malformed stored value.
   - `user-service.test.ts` — create (returns plaintext once, hash differs), username normalization,
     verifyLogin, changePassword clears the flag, resetPassword sets it, root immutable, delete-self
     blocked.
   - `auth-plugin.test.ts` — login success/failure; `password_change_required` 403 gate + allowlist;
     `requireAdmin` 403 for a `user`.
   - `user-routes.test.ts` — admin CRUD happy paths; non-admin forbidden.
   - Run: `npm exec nx -- test control-plane-api` and `npm exec nx -- test shared`.
2. **Typecheck:** `npm exec nx -- typecheck control-plane-api` (and web, expecting the known
   pre-existing errors only).
3. **Manual end-to-end (Docker):**
   ```bash
   # fresh DB so the seed runs cleanly
   ROOT_PASSWORD=changeme DB_RESET=1 docker compose up --build -d
   ```
   - Log in at `localhost:3000` as `root` / `changeme` → **forced change** screen → set a new
     password → land in the app.
   - Settings → **User Management** → Create user `alice` → copy the shown one-time password.
   - (Optional) Promote `alice` to admin; confirm the panel appears for her.
   - Log out → log in as `alice` with the shared password → forced change → change → in.
   - As `root`, **Reset** alice's password → new one-time password shown → alice is forced to change
     again next request.
   - Settings → **Change password** (self-service) works for any user.
   - Confirm a regular `user` gets `403 password_change_required` on API calls until they change, and
     never sees the User Management panel.

### Known limitation (note, not a blocker)
Sessions are stateless signed cookies, so an admin reset can't force-expire another user's *existing*
cookie; enforcement happens via the live `mustChangePassword` DB check on their next request (their
old password no longer works, and the forced-change screen accepts the admin-shared password as
"current"). Token-versioned revocation is future work.
