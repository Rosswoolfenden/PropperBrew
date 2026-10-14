CREATE TYPE "public"."brew_method" AS ENUM('v60', 'origami', 'kalita_wave', 'chemex', 'aeropress', 'espresso', 'french_press', 'moka_pot', 'cold_brew', 'clever_dripper');--> statement-breakpoint
CREATE TYPE "public"."grind_option" AS ENUM('wholebean', 'espresso', 'filter', 'v60', 'aeropress', 'cafetiere', 'moka_pot', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'pushed_to_shopify', 'fulfilled', 'partially_fulfilled', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."process" AS ENUM('washed', 'natural', 'honey', 'anaerobic', 'carbonic_maceration', 'wet_hulled', 'experimental');--> statement-breakpoint
CREATE TYPE "public"."roast_level" AS ENUM('light', 'medium', 'medium_dark', 'dark', 'omni', 'espresso');--> statement-breakpoint
CREATE TABLE "brew_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"coffee_bean_id" uuid NOT NULL,
	"brew_method" "brew_method" NOT NULL,
	"coffee_dose_dg" integer NOT NULL,
	"water_weight_g" integer NOT NULL,
	"water_temp_c" smallint,
	"grinder_model" text,
	"grinder_key" text,
	"grind_setting" text,
	"total_brew_time_seconds" integer,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"upvotes_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coffee_beans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roaster_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"origin_country" text,
	"region" text,
	"producer" text,
	"process" "process",
	"roast_level" "roast_level",
	"varietals" text[] DEFAULT '{}'::text[] NOT NULL,
	"altitude_masl" integer,
	"decaf" boolean DEFAULT false NOT NULL,
	"is_blend" boolean DEFAULT false NOT NULL,
	"tasting_notes" text[] DEFAULT '{}'::text[] NOT NULL,
	"avg_rating" integer,
	"review_count" integer DEFAULT 0 NOT NULL,
	"avg_flavour_scores" jsonb,
	"is_archived" boolean DEFAULT false NOT NULL,
	"specs_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shopify_variant_row_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_pence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkout_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"roaster_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"subtotal_pence" integer NOT NULL,
	"shipping_pence" integer NOT NULL,
	"platform_fee_pence" integer NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_transfer_id" text,
	"shopify_order_id" text,
	"shopify_order_name" text,
	"shipping_address" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"default_grinder" text,
	"default_brew_method" "brew_method",
	"expo_push_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "recipe_votes" (
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_votes_recipe_id_user_id_pk" PRIMARY KEY("recipe_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"coffee_bean_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"tasting_notes" text[] DEFAULT '{}'::text[] NOT NULL,
	"body" text,
	"flavour_scores" jsonb,
	"photo_url" text,
	"brew_method" "brew_method",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 10 and 50)
);
--> statement-breakpoint
CREATE TABLE "roasters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"bio" text,
	"logo_url" text,
	"website_url" text,
	"shopify_domain" text,
	"shopify_access_token_enc" text,
	"shopify_scopes" text,
	"shopify_installed_at" timestamp with time zone,
	"shopify_uninstalled_at" timestamp with time zone,
	"roast_days" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"shipping_flat_pence" integer,
	"free_shipping_threshold_pence" integer,
	"stripe_account_id" text,
	"commission_bps" integer DEFAULT 1200 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roasters_slug_unique" UNIQUE("slug"),
	CONSTRAINT "roasters_shopify_domain_unique" UNIQUE("shopify_domain"),
	CONSTRAINT "commission_bps_range" CHECK ("roasters"."commission_bps" between 0 and 5000)
);
--> statement-breakpoint
CREATE TABLE "shelf_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"coffee_bean_id" uuid NOT NULL,
	"roast_date" date,
	"opened_date" date,
	"finished_at" timestamp with time zone,
	"peak_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roaster_id" uuid NOT NULL,
	"shopify_product_id" text NOT NULL,
	"coffee_bean_id" uuid,
	"handle" text,
	"title" text NOT NULL,
	"status" text,
	"content_hash" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopify_product_row_id" uuid NOT NULL,
	"coffee_bean_id" uuid,
	"shopify_variant_id" text NOT NULL,
	"shopify_inventory_item_id" text,
	"title" text NOT NULL,
	"weight_g" integer,
	"grind_option" "grind_option" DEFAULT 'unknown' NOT NULL,
	"price_pence" integer NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"always_available" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_variants_shopify_variant_id_unique" UNIQUE("shopify_variant_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "brew_recipes" ADD CONSTRAINT "brew_recipes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_recipes" ADD CONSTRAINT "brew_recipes_coffee_bean_id_coffee_beans_id_fk" FOREIGN KEY ("coffee_bean_id") REFERENCES "public"."coffee_beans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_beans" ADD CONSTRAINT "coffee_beans_roaster_id_roasters_id_fk" FOREIGN KEY ("roaster_id") REFERENCES "public"."roasters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_shopify_variant_row_id_shopify_variants_id_fk" FOREIGN KEY ("shopify_variant_row_id") REFERENCES "public"."shopify_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_roaster_id_roasters_id_fk" FOREIGN KEY ("roaster_id") REFERENCES "public"."roasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_votes" ADD CONSTRAINT "recipe_votes_recipe_id_brew_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."brew_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_votes" ADD CONSTRAINT "recipe_votes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_coffee_bean_id_coffee_beans_id_fk" FOREIGN KEY ("coffee_bean_id") REFERENCES "public"."coffee_beans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_coffee_bean_id_coffee_beans_id_fk" FOREIGN KEY ("coffee_bean_id") REFERENCES "public"."coffee_beans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_products" ADD CONSTRAINT "shopify_products_roaster_id_roasters_id_fk" FOREIGN KEY ("roaster_id") REFERENCES "public"."roasters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_products" ADD CONSTRAINT "shopify_products_coffee_bean_id_coffee_beans_id_fk" FOREIGN KEY ("coffee_bean_id") REFERENCES "public"."coffee_beans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_variants" ADD CONSTRAINT "shopify_variants_shopify_product_row_id_shopify_products_id_fk" FOREIGN KEY ("shopify_product_row_id") REFERENCES "public"."shopify_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_variants" ADD CONSTRAINT "shopify_variants_coffee_bean_id_coffee_beans_id_fk" FOREIGN KEY ("coffee_bean_id") REFERENCES "public"."coffee_beans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brew_recipes_bean_method_idx" ON "brew_recipes" USING btree ("coffee_bean_id","brew_method","upvotes_count");--> statement-breakpoint
CREATE INDEX "brew_recipes_bean_grinder_idx" ON "brew_recipes" USING btree ("coffee_bean_id","grinder_key");--> statement-breakpoint
CREATE UNIQUE INDEX "coffee_beans_roaster_slug_idx" ON "coffee_beans" USING btree ("roaster_id","slug");--> statement-breakpoint
CREATE INDEX "coffee_beans_origin_idx" ON "coffee_beans" USING btree ("origin_country");--> statement-breakpoint
CREATE INDEX "coffee_beans_search_idx" ON "coffee_beans" USING gin (to_tsvector('english', "name" || ' ' || coalesce("origin_country", '') || ' ' || coalesce("region", '')));--> statement-breakpoint
CREATE INDEX "orders_checkout_idx" ON "orders" USING btree ("checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_shopify_order_idx" ON "orders" USING btree ("roaster_id","shopify_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_user_bean_idx" ON "reviews" USING btree ("user_id","coffee_bean_id");--> statement-breakpoint
CREATE INDEX "reviews_bean_idx" ON "reviews" USING btree ("coffee_bean_id","created_at");--> statement-breakpoint
CREATE INDEX "shelf_entries_user_idx" ON "shelf_entries" USING btree ("user_id","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_products_roaster_product_idx" ON "shopify_products" USING btree ("roaster_id","shopify_product_id");--> statement-breakpoint
CREATE INDEX "shopify_variants_bean_idx" ON "shopify_variants" USING btree ("coffee_bean_id");--> statement-breakpoint
CREATE INDEX "shopify_variants_inventory_item_idx" ON "shopify_variants" USING btree ("shopify_inventory_item_id");--> statement-breakpoint
CREATE INDEX "webhook_events_unprocessed_idx" ON "webhook_events" USING btree ("received_at") WHERE "webhook_events"."processed_at" is null;