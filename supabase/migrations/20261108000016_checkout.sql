CREATE TABLE "basket_items" (
	"user_id" uuid NOT NULL,
	"shopify_variant_row_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "basket_items_user_id_shopify_variant_row_id_pk" PRIMARY KEY("user_id","shopify_variant_row_id"),
	CONSTRAINT "basket_quantity_range" CHECK ("basket_items"."quantity" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"total_pence" integer NOT NULL,
	"email" text NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkouts_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "title" text NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "roasters" ADD COLUMN "stripe_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "basket_items" ADD CONSTRAINT "basket_items_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basket_items" ADD CONSTRAINT "basket_items_shopify_variant_row_id_shopify_variants_id_fk" FOREIGN KEY ("shopify_variant_row_id") REFERENCES "public"."shopify_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkouts_user_idx" ON "checkouts" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_roaster_idx" ON "orders" USING btree ("roaster_id","created_at");--> statement-breakpoint
-- All data access goes through the API; with no policies, the auto-generated REST API sees nothing.
alter table public.basket_items enable row level security;--> statement-breakpoint
alter table public.checkouts enable row level security;
