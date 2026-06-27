CREATE TABLE "github_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_key" text NOT NULL UNIQUE,
  "token_encrypted" text NOT NULL,
  "source" text NOT NULL,
  "login" text NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
