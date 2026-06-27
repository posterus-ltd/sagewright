# Delete for repos and secrets ("envs") — Design

Date: 2026-06-24

## Goal

Let users delete repos and secrets ("envs") from the control-plane web UI, with safe
backend handling for repos that are still referenced by tasks.

## Background

- `DELETE /api/repos/:id` already exists (`repo-routes.ts`) but has no UI and does not
  handle the `tasks.repo_id -> repos.id` foreign key (`ON DELETE no action`). Deleting a
  repo that has tasks currently fails with an unhandled Postgres error (500).
- `DELETE /api/secrets/:key` already exists and works; secrets have no foreign-key
  dependents. In the UI, "envs" refers to the Settings key/value (secrets) path.
- There is **no** standalone `envs` table — out of scope to create one.

## Scope

### 1. Repos — UI delete + FK guard

**Backend** (`apps/control-plane-api/src/repos/repo-routes.ts`)
- In the existing `DELETE /api/repos/:id` handler, before deleting, count tasks for the
  repo. If `taskCount > 0`, return **409 Conflict** with body
  `{ error: 'repo has tasks', taskCount }` and do **not** delete.
- Otherwise delete and return **204** (unchanged).

Rationale for guard (not cascade): tasks spawn containers and hold run history/events.
Cascade-deleting would silently destroy history and orphan running containers. A 409 with
a clear message keeps deletion safe and explicit — the user resolves tasks first.

**Frontend** (`apps/control-plane-web/src/api/hooks.ts`, `.../config/ReposPage.tsx`)
- Add `useDeleteRepo()` mutation hook that calls `apiClient.del('/api/repos/:id')` and
  invalidates `['repos']`.
- Add a delete (trash) icon button on each repo list row.
- Click → MUI confirmation dialog → on confirm call the mutation.
- On a 409 (`ApiError.status === 409`), surface the "repo has N tasks" message inline.

### 2. Secrets ("envs") — UI delete

**Frontend** (`apps/control-plane-web/src/api/hooks.ts`, `.../config/SettingsPage.tsx`)
- Lift the inline secrets query into `useSecrets()` and add `useDeleteSecret()`
  (calls `apiClient.del('/api/secrets/:key')`, invalidates `['secrets']`) for consistency
  with the repo hooks.
- Add a delete button on each secret row → confirmation dialog → delete → list refreshes.

## Testing (TDD)

- **API** (`repo-routes.test.ts`): delete a repo with no tasks → 204; delete a repo that
  has a task → 409 with `taskCount`. (`secret-routes.test.ts` already covers secret delete.)
- **Web** (`hooks.test.tsx`): `useDeleteRepo` and `useDeleteSecret` issue the correct
  DELETE request and invalidate their query keys.

## Out of scope

- No new `envs` table; no schema/migration changes.
- No cascade deletes.
