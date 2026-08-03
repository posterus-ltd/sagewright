ALTER TABLE "scheduled_prompts" RENAME COLUMN "worker_image" TO "runner_image";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "worker_image" TO "runner_image";--> statement-breakpoint
ALTER TABLE "user_settings" RENAME COLUMN "default_worker_image" TO "default_runner_image";--> statement-breakpoint
UPDATE "scheduled_prompts" SET "runner_image" = replace("runner_image", 'sagewright-worker-', 'sagewright-runner-') WHERE "runner_image" LIKE 'sagewright-worker-%';--> statement-breakpoint
UPDATE "sessions" SET "runner_image" = replace("runner_image", 'sagewright-worker-', 'sagewright-runner-') WHERE "runner_image" LIKE 'sagewright-worker-%';--> statement-breakpoint
UPDATE "user_settings" SET "default_runner_image" = replace("default_runner_image", 'sagewright-worker-', 'sagewright-runner-') WHERE "default_runner_image" LIKE 'sagewright-worker-%';--> statement-breakpoint
UPDATE "workflows" SET "definition" = replace(replace("definition"::text, '"workerImage"', '"runnerImage"'), 'sagewright-worker-', 'sagewright-runner-')::jsonb WHERE "definition"::text LIKE '%worker%';
