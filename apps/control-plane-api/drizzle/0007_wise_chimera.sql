CREATE TABLE "canvas_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_key" text NOT NULL,
	"layout" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canvas_layouts_user_key_unique" UNIQUE("user_key")
);
