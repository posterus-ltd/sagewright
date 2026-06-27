CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_key" text NOT NULL,
	"default_worker_image" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_key_unique" UNIQUE("user_key")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "worker_image" text;