CREATE TABLE "roaster_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"roaster_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"traceability" smallint,
	"shipping" smallint,
	"body" text,
	"notes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roaster_reviews_scores" CHECK ("roaster_reviews"."rating" between 1 and 5 and coalesce("roaster_reviews"."traceability", 1) between 1 and 5 and coalesce("roaster_reviews"."shipping", 1) between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "roaster_reviews" ADD CONSTRAINT "roaster_reviews_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaster_reviews" ADD CONSTRAINT "roaster_reviews_roaster_id_roasters_id_fk" FOREIGN KEY ("roaster_id") REFERENCES "public"."roasters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roaster_reviews_once_idx" ON "roaster_reviews" USING btree ("user_id","roaster_id");--> statement-breakpoint
CREATE INDEX "roaster_reviews_roaster_idx" ON "roaster_reviews" USING btree ("roaster_id","created_at");--> statement-breakpoint
-- Same rule as every other table: RLS on, no policies; all access goes through apps/api.
alter table public.roaster_reviews enable row level security;
