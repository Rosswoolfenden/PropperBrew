CREATE TABLE "brews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"coffee_bean_id" uuid NOT NULL,
	"shelf_entry_id" uuid,
	"recipe_id" uuid,
	"brew_method" "brew_method" NOT NULL,
	"coffee_dose_dg" integer NOT NULL,
	"water_weight_g" integer NOT NULL,
	"water_temp_c" smallint,
	"grinder_model" text,
	"grind_setting" text,
	"total_brew_time_seconds" integer,
	"rating" smallint,
	"notes" text,
	"brewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brews_rating_range" CHECK ("brews"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_coffee_bean_id_coffee_beans_id_fk" FOREIGN KEY ("coffee_bean_id") REFERENCES "public"."coffee_beans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_shelf_entry_id_shelf_entries_id_fk" FOREIGN KEY ("shelf_entry_id") REFERENCES "public"."shelf_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brews" ADD CONSTRAINT "brews_recipe_id_brew_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."brew_recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brews_user_idx" ON "brews" USING btree ("user_id","brewed_at");--> statement-breakpoint
-- Same rule as every other table: RLS on, no policies; all access goes through apps/api.
alter table public.brews enable row level security;
