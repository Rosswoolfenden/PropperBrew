CREATE TYPE "public"."account_type" AS ENUM('consumer', 'business');--> statement-breakpoint
CREATE TYPE "public"."roaster_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TABLE "roaster_members" (
	"roaster_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "roaster_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roaster_members_roaster_id_user_id_pk" PRIMARY KEY("roaster_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "account_type" "account_type" DEFAULT 'consumer' NOT NULL;--> statement-breakpoint
ALTER TABLE "roaster_members" ADD CONSTRAINT "roaster_members_roaster_id_roasters_id_fk" FOREIGN KEY ("roaster_id") REFERENCES "public"."roasters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaster_members" ADD CONSTRAINT "roaster_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roaster_members_user_idx" ON "roaster_members" USING btree ("user_id");