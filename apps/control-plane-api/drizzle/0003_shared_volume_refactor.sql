CREATE TABLE "scheduled_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cron" text NOT NULL,
	"prompt" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_repo_id_repos_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "repo_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "source";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "linear_ref";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "prompt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "mode" text DEFAULT 'interactive' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_prompt_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_scheduled_prompt_id_scheduled_prompts_id_fk" FOREIGN KEY ("scheduled_prompt_id") REFERENCES "public"."scheduled_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DELETE FROM "repos";--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN IF EXISTS "name";--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN IF EXISTS "git_url";--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN IF EXISTS "setup_cmds";--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN IF EXISTS "validate_cmds";--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN IF EXISTS "env_refs";--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "default_branch" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "default_branch" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "url" text NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_slug_unique" UNIQUE("slug");
