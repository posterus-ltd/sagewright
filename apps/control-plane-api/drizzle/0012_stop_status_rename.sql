-- Rename the 'cancelled' task status to 'stopped' (UI calls this action "Stop").
UPDATE "tasks" SET "status" = 'stopped' WHERE "status" = 'cancelled';
