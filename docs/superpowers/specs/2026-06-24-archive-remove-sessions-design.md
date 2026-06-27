# Archive & remove sessions — Design

Date: 2026-06-24

## Goal

Let users tidy up their session history in two explicit stages: **archive** a finished
session (move it out of the active list), then optionally **remove** (permanently delete)
an archived session. Surfaced in the sessions DataGrid via per-row hover actions and an
Active ⇄ Archived header toggle.

## Background

- Sessions are the `tasks` table (`apps/control-plane-api/src/db/schema.ts`). A task has a
  run `status` (`queued, provisioning, running, needs_assistance, pushing, done, failed,
  cancelled` — `libs/shared/src/enums.ts`) but **no archive concept and no delete path**.
- The list UI (`apps/control-plane-web/src/sessions/SessionsListPage.tsx`) is a plain MUI
  `<Table>` fed by `useTasks(true)` → `GET /api/tasks?mine=1`. Rows are click-to-open.
- `events` and `inbound_messages` both FK to `tasks.id` with **`ON DELETE no action`** — a
  hard delete must remove dependents first or it errors (same FK lesson as the repo-delete
  design, `2026-06-24-delete-repos-and-secrets-design.md`).
- Existing delete UX to mirror (repos/secrets): trash icon → MUI confirm dialog → DELETE →
  invalidate query. `cancel()` already retires the worker container + removes worktrees.

## Decisions

- **Archive is a separate dimension, not a status value.** Add a nullable `archived_at`
  timestamp. Archiving must not overwrite the run outcome (`done`/`failed`/`cancelled`) —
  the archived list still shows each session's real StatusChip, and the two filters
  (archived vs. status) compose independently.
- **Two stages enforced server-side**, not just in the UI: a session must be terminal
  before it can be archived, and archived before it can be deleted.

## Scope

### 1. Data model

`apps/control-plane-api/src/db/schema.ts` — add to `tasks`:

```ts
archivedAt: timestamp('archived_at', { withTimezone: true }),  // null = active
```

New Drizzle migration. Add `archivedAt: z.string().nullable()` to `taskSchema`
(`libs/shared/src/task.schema.ts`) and map it in `rowToTask`.

**State buckets** (drive both the API guards and which row action shows):
- **Cancellable** (worker may be alive): `queued, provisioning, running, needs_assistance,
  pushing` → Cancel.
- **Finished / archivable**: `done, failed, cancelled` → Archive. *(Open question: `failed`
  is grouped here as finished; flagged below.)*

Define an `isTerminalStatus(status)` helper in `libs/shared` so API and web agree.

### 2. API (`apps/control-plane-api/src/tasks/`)

- `GET /api/tasks?mine=1&archived=0|1` — `archived` filters `archived_at IS NULL` (default,
  active) vs `IS NOT NULL`. Composes with the existing `mine` filter. `list()` gains an
  `archived?: boolean` arg.
- `POST /api/tasks/:id/archive` — sets `archived_at = now()`. **409**
  `{ error: 'session not finished', status }` if the task is not terminal. Returns the
  updated task.
- `DELETE /api/tasks/:id` — **hard delete**. **409** `{ error: 'session not archived' }` if
  `archived_at IS NULL`. Otherwise, in a transaction: delete dependent `events` and
  `inbound_messages`, then the `tasks` row; best-effort `volume.removeSessionWorktrees(id)`.
  Returns **204**. (404 if the task doesn't exist.)

New `archive` and `remove` methods on `task-service.ts`; routes in `task-routes.ts`.

### 3. Frontend (`apps/control-plane-web/src/`)

Migrate `SessionsListPage` from `<Table>` to **MUI X DataGrid** (`@mui/x-data-grid` — new
dependency).

- **Header toolbar**: Active ⇄ Archived toggle (`ToggleButtonGroup`) holding local state,
  passed to `useTasks(mine, archived)`.
- **Columns**: Session (prompt slice / "(interactive session)"), Status (StatusChip), and a
  DataGrid `actions` column (icons appear on row hover):
  - Active view, non-terminal row → **Cancel** (existing `useCancelTask`).
  - Active view, terminal row → **Archive** (`useArchiveTask`).
  - Archived view → **Delete** (`useDeleteTask`).
- Each action → MUI confirm dialog (delete worded as permanent) → mutation → invalidate
  `['tasks']`. Row click still navigates to the session.

`api/hooks.ts`: extend `useTasks(mine, archived)` (query key includes `archived`); add
`useArchiveTask()` (`apiClient.post('/api/tasks/:id/archive')`) and `useDeleteTask()`
(`apiClient.del('/api/tasks/:id')`), both invalidating `['tasks']`.

### 4. Testing (TDD)

- **API** (`task-routes.test.ts` / service test):
  - archive a terminal task → 200, `archived_at` set; archive a non-terminal task → 409.
  - `GET ?archived=1` returns only archived; default returns only active.
  - delete an archived task → 204, and its `events` + `inbound_messages` are gone.
  - delete a non-archived task → 409; delete a missing task → 404.
- **Web** (`hooks.test.tsx`): `useArchiveTask` / `useDeleteTask` hit the right endpoints and
  invalidate `['tasks']`; `useTasks` includes `archived` in the query string and key.

## Open questions (confirm at review)

1. **`failed` placement** — grouped as finished/archivable (shows Archive). Alternative:
   treat it like cancellable (shows Cancel). Recommendation: Archive.
2. **Restore** — no un-archive action in the archived view (delete only). Trivial to add a
   `POST /api/tasks/:id/unarchive` + row action later if wanted.

## Out of scope

- Bulk archive/delete.
- Cascade-on-FK schema change (explicit transactional deletes instead).
- Archiving/cancelling from the session detail page (list-only for now).
