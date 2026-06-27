# Task 8 Report: Event Store + Event Bus

## Status: COMPLETE

## TDD Evidence

### event-bus

**RED** — `event-bus.test.ts` written first, run against missing module:
```
Error: Cannot find module './event-bus'
Test Files  1 failed (1)
```

**GREEN** — `event-bus.ts` implemented, test rerun:
```
✓ |control-plane-api| src/events/event-bus.test.ts (1 test) 1ms
Test Files  1 passed (1)
```

### event-store

**RED** — `event-store.test.ts` written first, run against missing module:
```
Error: Cannot find module './event-store'
Test Files  1 failed (1)
```

**GREEN** — `event-store.ts` implemented, test rerun:
```
✓ |control-plane-api| src/events/event-store.test.ts (1 test) 1ms
Test Files  1 passed (1)
```

### Final Run (both modules)
```
✓ |control-plane-api| src/events/event-bus.test.ts (1 test) 1ms
✓ |control-plane-api| src/events/event-store.test.ts (1 test) 1ms
Test Files  2 passed (2)
Tests  2 passed (2)
Duration  404ms
```

## Files Created

- `apps/control-plane-api/src/events/event-bus.ts` — `createEventBus()` with in-memory per-task queues/waiters; exports `EventBus` type
- `apps/control-plane-api/src/events/event-bus.test.ts` — async delivery test
- `apps/control-plane-api/src/events/event-store.ts` — `assignSeqs` (pure), `createEventStore(db)` with transactional append and readSince; exports `EventStore` type
- `apps/control-plane-api/src/events/event-store.test.ts` — `assignSeqs` seq monotonicity test

## Commit

SHA: `69e0165`  
Message: `feat(api): event store (monotonic seq) and in-memory event bus`

## Concerns

None. The `append`/`readSince` DB methods are structurally correct but are not unit-tested here (require a live DB connection); they will be exercised in later integration tasks as noted in the brief. The `assignSeqs` pure function is fully unit-tested. The `EventBus` and `EventStore` type exports are in place for consuming modules.

---

## Review Fixes (post-review)

### Fix 1: Event bus broadcasts to ALL subscribers

Rewrote `event-bus.ts` to a per-subscriber-queue design. `publish` now fans out to every registered `Subscriber` for a task (previously `waiters.shift()` delivered to only one). Each subscriber's `return()` cleanly removes itself from the set and drops the set when empty.

### Fix 2: Unique constraint on (task_id, seq)

Changed `schema.ts` to import `uniqueIndex` instead of `index` and updated the events table definition accordingly. Ran `npx drizzle-kit generate` from workspace root:

```
[✓] Your SQL migration file ➜ apps/control-plane-api/drizzle/0001_daffy_lady_deathstrike.sql
```

New migration SQL:
```sql
DROP INDEX "events_task_seq_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "events_task_seq_idx" ON "events" USING btree ("task_id","seq");
```

### Fix 3: createdAt consistency in event-store append

Added `createdAt: new Date(e.createdAt)` to the insert values mapping so the persisted timestamp matches the returned `StreamEvent.createdAt`.

### Fix 4: assignSeqs first-events test

Added test: `assignSeqs(0, [oneEvent], 'now')` produces `seq === 1`.

### Vitest output (post-fixes)
```
✓ |control-plane-api| src/events/event-bus.test.ts (2 tests) 1ms
✓ |control-plane-api| src/events/event-store.test.ts (2 tests) 1ms
Test Files  2 passed (2)
     Tests  4 passed (4)
  Duration  408ms
```

### Files changed
- `apps/control-plane-api/src/events/event-bus.ts` — rewritten to per-subscriber-queue design
- `apps/control-plane-api/src/events/event-bus.test.ts` — added multi-subscriber broadcast test
- `apps/control-plane-api/src/events/event-store.ts` — added `createdAt` to insert values
- `apps/control-plane-api/src/events/event-store.test.ts` — added first-events seq === 1 test
- `apps/control-plane-api/src/db/schema.ts` — `uniqueIndex` replacing `index` for events
- `apps/control-plane-api/drizzle/0001_daffy_lady_deathstrike.sql` — new migration (unique index)
- `apps/control-plane-api/drizzle/meta/_journal.json` — updated by drizzle-kit
- `apps/control-plane-api/drizzle/meta/0001_snapshot.json` — updated by drizzle-kit
