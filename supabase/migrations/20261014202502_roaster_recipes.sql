ALTER TABLE "brew_recipes" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "brew_recipes" ADD COLUMN "roaster_id" uuid;--> statement-breakpoint
ALTER TABLE "brew_recipes" ADD CONSTRAINT "brew_recipes_roaster_id_roasters_id_fk" FOREIGN KEY ("roaster_id") REFERENCES "public"."roasters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_recipes" ADD CONSTRAINT "brew_recipes_one_author" CHECK (("brew_recipes"."user_id" is null) <> ("brew_recipes"."roaster_id" is null));