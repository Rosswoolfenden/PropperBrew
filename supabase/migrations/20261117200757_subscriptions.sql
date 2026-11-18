CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"roaster_id" uuid NOT NULL,
	"shopify_variant_row_id" uuid NOT NULL,
	"title" text NOT NULL,
	"quantity" integer NOT NULL,
	"interval_weeks" smallint NOT NULL,
	"unit_price_pence" integer NOT NULL,
	"shipping_pence" integer NOT NULL,
	"email" text NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"next_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "checkouts" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "checkouts" ADD COLUMN "stripe_invoice_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_roaster_id_roasters_id_fk" FOREIGN KEY ("roaster_id") REFERENCES "public"."roasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_shopify_variant_row_id_shopify_variants_id_fk" FOREIGN KEY ("shopify_variant_row_id") REFERENCES "public"."shopify_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_roaster_idx" ON "subscriptions" USING btree ("roaster_id","status");--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id");--> statement-breakpoint
-- Same rule as every other table: RLS on, no policies; all access goes through apps/api.
alter table public.subscriptions enable row level security;
