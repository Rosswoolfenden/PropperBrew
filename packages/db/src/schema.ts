import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  BREW_METHODS,
  GRIND_OPTIONS,
  ORDER_STATUSES,
  PROCESSES,
  ROAST_LEVELS,
  type FlavourScores,
  type RecipeStep,
} from "@propperbrew/shared";

export const processEnum = pgEnum("process", PROCESSES);
export const roastLevelEnum = pgEnum("roast_level", ROAST_LEVELS);
export const brewMethodEnum = pgEnum("brew_method", BREW_METHODS);
export const grindOptionEnum = pgEnum("grind_option", GRIND_OPTIONS);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** App user profile. `id` is the Supabase auth.users id. */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  /** Default gear, used to pre-filter recipes ("show me Comandante recipes"). */
  defaultGrinder: text("default_grinder"),
  defaultBrewMethod: brewMethodEnum("default_brew_method"),
  expoPushToken: text("expo_push_token"),
  ...timestamps,
});

export const roasters = pgTable(
  "roasters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    city: text("city"),
    bio: text("bio"),
    logoUrl: text("logo_url"),
    websiteUrl: text("website_url"),
    /** e.g. "test-uk-roaster.myshopify.com" */
    shopifyDomain: text("shopify_domain").unique(),
    /** AES-256-GCM encrypted offline access token (see apps/api/src/lib/crypto.ts). */
    shopifyAccessTokenEnc: text("shopify_access_token_enc"),
    shopifyScopes: text("shopify_scopes"),
    shopifyInstalledAt: timestamp("shopify_installed_at", { withTimezone: true }),
    shopifyUninstalledAt: timestamp("shopify_uninstalled_at", { withTimezone: true }),
    /** ISO weekdays the roaster roasts/dispatches on (1 = Monday). */
    roastDays: smallint("roast_days").array().notNull().default(sql`'{}'::smallint[]`),
    shippingFlatPence: integer("shipping_flat_pence"),
    freeShippingThresholdPence: integer("free_shipping_threshold_pence"),
    /** Stripe Connect account for Option 2 (marketplace checkout). */
    stripeAccountId: text("stripe_account_id"),
    commissionBps: integer("commission_bps").notNull().default(1200),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [check("commission_bps_range", sql`${t.commissionBps} between 0 and 5000`)],
);

/**
 * The canonical coffee: what people review, log and write recipes for.
 * Survives Shopify products being deleted or reused.
 */
export const coffeeBeans = pgTable(
  "coffee_beans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roasterId: uuid("roaster_id")
      .notNull()
      .references(() => roasters.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    originCountry: text("origin_country"),
    region: text("region"),
    producer: text("producer"),
    process: processEnum("process"),
    roastLevel: roastLevelEnum("roast_level"),
    varietals: text("varietals").array().notNull().default(sql`'{}'::text[]`),
    altitudeMasl: integer("altitude_masl"),
    decaf: boolean("decaf").notNull().default(false),
    isBlend: boolean("is_blend").notNull().default(false),
    /** Roaster-declared tasting notes. */
    tastingNotes: text("tasting_notes").array().notNull().default(sql`'{}'::text[]`),
    /** Rolling community aggregates, recomputed when reviews change. */
    avgRating: integer("avg_rating"),
    reviewCount: integer("review_count").notNull().default(0),
    avgFlavourScores: jsonb("avg_flavour_scores").$type<FlavourScores>(),
    /** Set when the lot sells out / is deleted on Shopify. Page stays live; buy button hides. */
    isArchived: boolean("is_archived").notNull().default(false),
    /** True once a human has checked the LLM-extracted specs. */
    specsVerified: boolean("specs_verified").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("coffee_beans_roaster_slug_idx").on(t.roasterId, t.slug),
    index("coffee_beans_origin_idx").on(t.originCountry),
    index("coffee_beans_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${t.name} || ' ' || coalesce(${t.originCountry}, '') || ' ' || coalesce(${t.region}, ''))`,
    ),
  ],
);

/** A Shopify product we've seen, linked to the bean it currently represents. */
export const shopifyProducts = pgTable(
  "shopify_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roasterId: uuid("roaster_id")
      .notNull()
      .references(() => roasters.id, { onDelete: "cascade" }),
    /** Numeric Shopify product id as a string (from webhook payload `id`). */
    shopifyProductId: text("shopify_product_id").notNull(),
    coffeeBeanId: uuid("coffee_bean_id").references(() => coffeeBeans.id, { onDelete: "set null" }),
    handle: text("handle"),
    title: text("title").notNull(),
    status: text("status"),
    /** Hash of title+body_html so we only re-run LLM enrichment when content changes. */
    contentHash: text("content_hash"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("shopify_products_roaster_product_idx").on(t.roasterId, t.shopifyProductId)],
);

/** The buyable link: a specific weight/grind of a bean on a roaster's Shopify. */
export const shopifyVariants = pgTable(
  "shopify_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopifyProductRowId: uuid("shopify_product_row_id")
      .notNull()
      .references(() => shopifyProducts.id, { onDelete: "cascade" }),
    coffeeBeanId: uuid("coffee_bean_id").references(() => coffeeBeans.id, { onDelete: "set null" }),
    shopifyVariantId: text("shopify_variant_id").notNull().unique(),
    /** inventory_levels/update webhooks only carry inventory_item_id. */
    shopifyInventoryItemId: text("shopify_inventory_item_id"),
    title: text("title").notNull(),
    weightG: integer("weight_g"),
    grindOption: grindOptionEnum("grind_option").notNull().default("unknown"),
    pricePence: integer("price_pence").notNull(),
    inStock: boolean("in_stock").notNull().default(true),
    /** Untracked inventory or "continue selling when out of stock" (roast-to-order). */
    alwaysAvailable: boolean("always_available").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("shopify_variants_bean_idx").on(t.coffeeBeanId),
    index("shopify_variants_inventory_item_idx").on(t.shopifyInventoryItemId),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    coffeeBeanId: uuid("coffee_bean_id")
      .notNull()
      .references(() => coffeeBeans.id, { onDelete: "cascade" }),
    /** 10–50, i.e. rating × 10. */
    rating: smallint("rating").notNull(),
    tastingNotes: text("tasting_notes").array().notNull().default(sql`'{}'::text[]`),
    body: text("body"),
    flavourScores: jsonb("flavour_scores").$type<FlavourScores>(),
    photoUrl: text("photo_url"),
    brewMethod: brewMethodEnum("brew_method"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("reviews_user_bean_idx").on(t.userId, t.coffeeBeanId),
    index("reviews_bean_idx").on(t.coffeeBeanId, t.createdAt),
    check("reviews_rating_range", sql`${t.rating} between 10 and 50`),
  ],
);

export const brewRecipes = pgTable(
  "brew_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Author: a community member, or (for the roaster's own recommendation) the roaster. Exactly one is set. */
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    roasterId: uuid("roaster_id").references(() => roasters.id, { onDelete: "cascade" }),
    coffeeBeanId: uuid("coffee_bean_id")
      .notNull()
      .references(() => coffeeBeans.id, { onDelete: "cascade" }),
    brewMethod: brewMethodEnum("brew_method").notNull(),
    /** Grams × 10 to keep 15.5g exact. */
    coffeeDoseDg: integer("coffee_dose_dg").notNull(),
    waterWeightG: integer("water_weight_g").notNull(),
    waterTempC: smallint("water_temp_c"),
    grinderModel: text("grinder_model"),
    /** Normalised (lowercased, trimmed) for filtering. */
    grinderKey: text("grinder_key"),
    grindSetting: text("grind_setting"),
    totalBrewTimeSeconds: integer("total_brew_time_seconds"),
    steps: jsonb("steps").$type<RecipeStep[]>().notNull().default([]),
    notes: text("notes"),
    upvotesCount: integer("upvotes_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("brew_recipes_bean_method_idx").on(t.coffeeBeanId, t.brewMethod, t.upvotesCount),
    index("brew_recipes_bean_grinder_idx").on(t.coffeeBeanId, t.grinderKey),
    check("brew_recipes_one_author", sql`(${t.userId} is null) <> (${t.roasterId} is null)`),
  ],
);

export const recipeVotes = pgTable(
  "recipe_votes",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => brewRecipes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.userId] })],
);

/** The user's virtual shelf: bags they own, with roast date for rest-window notifications. */
export const shelfEntries = pgTable(
  "shelf_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    coffeeBeanId: uuid("coffee_bean_id")
      .notNull()
      .references(() => coffeeBeans.id, { onDelete: "cascade" }),
    roastDate: date("roast_date", { mode: "date" }),
    openedDate: date("opened_date", { mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    peakNotifiedAt: timestamp("peak_notified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("shelf_entries_user_idx").on(t.userId, t.finishedAt)],
);

/** Marketplace orders (Option 2). One per roaster per checkout; grouped by checkoutId. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkoutId: uuid("checkout_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    roasterId: uuid("roaster_id")
      .notNull()
      .references(() => roasters.id),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    subtotalPence: integer("subtotal_pence").notNull(),
    shippingPence: integer("shipping_pence").notNull(),
    platformFeePence: integer("platform_fee_pence").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeTransferId: text("stripe_transfer_id"),
    shopifyOrderId: text("shopify_order_id"),
    shopifyOrderName: text("shopify_order_name"),
    shippingAddress: jsonb("shipping_address"),
    ...timestamps,
  },
  (t) => [
    index("orders_checkout_idx").on(t.checkoutId),
    uniqueIndex("orders_shopify_order_idx").on(t.roasterId, t.shopifyOrderId),
  ],
);

export const orderLines = pgTable("order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  shopifyVariantRowId: uuid("shopify_variant_row_id")
    .notNull()
    .references(() => shopifyVariants.id),
  quantity: integer("quantity").notNull(),
  unitPricePence: integer("unit_price_pence").notNull(),
});

/** Idempotency log for Shopify webhooks (Shopify retries and can deliver duplicates). */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    /** X-Shopify-Event-Id header. */
    eventId: text("event_id").primaryKey(),
    shopDomain: text("shop_domain").notNull(),
    topic: text("topic").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [index("webhook_events_unprocessed_idx").on(t.receivedAt).where(sql`${t.processedAt} is null`)],
);

// --- Relations (for db.query.* relational API) ---

export const roastersRelations = relations(roasters, ({ many }) => ({
  beans: many(coffeeBeans),
}));

export const coffeeBeansRelations = relations(coffeeBeans, ({ one, many }) => ({
  roaster: one(roasters, { fields: [coffeeBeans.roasterId], references: [roasters.id] }),
  variants: many(shopifyVariants),
  reviews: many(reviews),
  recipes: many(brewRecipes),
}));

export const shopifyProductsRelations = relations(shopifyProducts, ({ one, many }) => ({
  roaster: one(roasters, { fields: [shopifyProducts.roasterId], references: [roasters.id] }),
  bean: one(coffeeBeans, { fields: [shopifyProducts.coffeeBeanId], references: [coffeeBeans.id] }),
  variants: many(shopifyVariants),
}));

export const shopifyVariantsRelations = relations(shopifyVariants, ({ one }) => ({
  product: one(shopifyProducts, {
    fields: [shopifyVariants.shopifyProductRowId],
    references: [shopifyProducts.id],
  }),
  bean: one(coffeeBeans, { fields: [shopifyVariants.coffeeBeanId], references: [coffeeBeans.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(profiles, { fields: [reviews.userId], references: [profiles.id] }),
  bean: one(coffeeBeans, { fields: [reviews.coffeeBeanId], references: [coffeeBeans.id] }),
}));

export const brewRecipesRelations = relations(brewRecipes, ({ one }) => ({
  user: one(profiles, { fields: [brewRecipes.userId], references: [profiles.id] }),
  roaster: one(roasters, { fields: [brewRecipes.roasterId], references: [roasters.id] }),
  bean: one(coffeeBeans, { fields: [brewRecipes.coffeeBeanId], references: [coffeeBeans.id] }),
}));

export const shelfEntriesRelations = relations(shelfEntries, ({ one }) => ({
  bean: one(coffeeBeans, { fields: [shelfEntries.coffeeBeanId], references: [coffeeBeans.id] }),
}));
