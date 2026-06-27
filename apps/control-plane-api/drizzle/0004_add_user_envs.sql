CREATE TABLE "user_envs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_key" text NOT NULL,
	"env_encrypted" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_envs_user_key_unique" UNIQUE("user_key")
);
