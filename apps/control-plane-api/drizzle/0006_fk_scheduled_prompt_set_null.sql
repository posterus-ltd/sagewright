ALTER TABLE "tasks" DROP CONSTRAINT "tasks_scheduled_prompt_id_scheduled_prompts_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_scheduled_prompt_id_scheduled_prompts_id_fk" FOREIGN KEY ("scheduled_prompt_id") REFERENCES "public"."scheduled_prompts"("id") ON DELETE set null ON UPDATE no action;