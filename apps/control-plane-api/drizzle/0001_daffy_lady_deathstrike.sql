DROP INDEX "events_task_seq_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "events_task_seq_idx" ON "events" USING btree ("task_id","seq");