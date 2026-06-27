-- Repos become per-user. Existing global rows are dropped (fresh start): every user
-- begins with an empty list and adds their own. Physical clones on the shared volume
-- are left as-is and reused when re-added.
DELETE FROM "repos";--> statement-breakpoint
ALTER TABLE "repos" DROP CONSTRAINT "repos_slug_unique";--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "user_key" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "repos_user_key_slug_idx" ON "repos" USING btree ("user_key","slug");