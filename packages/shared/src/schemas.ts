import { z } from "zod";
import { BrewMethod, Process, RoastLevel } from "./enums";

/** 1.0 – 5.0 in 0.1 increments, stored as an integer 10–50 in the DB. */
export const Rating = z
  .number()
  .min(1)
  .max(5)
  .refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-6, { message: "Rating must be in 0.1 increments" });

/** The review's sensory profile (Stitch "Review Coffee"): each scored 1–5, each optional. */
export const SENSORY_DIMENSIONS = ["acidity", "sweetness", "body", "aftertaste", "balance"] as const;
export type SensoryDimension = (typeof SENSORY_DIMENSIONS)[number];

const SensoryScore = z.number().int().min(1).max(5);
export const FlavourScores = z.object({
  acidity: SensoryScore.optional(),
  sweetness: SensoryScore.optional(),
  body: SensoryScore.optional(),
  aftertaste: SensoryScore.optional(),
  balance: SensoryScore.optional(),
});
export type FlavourScores = z.infer<typeof FlavourScores>;

export const CreateReviewInput = z.object({
  coffeeBeanId: z.uuid(),
  rating: Rating,
  tastingNotes: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  body: z.string().trim().max(4000).optional(),
  flavourScores: FlavourScores.optional(),
  photoUrl: z.url().optional(),
  brewMethod: BrewMethod.optional(),
});
export type CreateReviewInput = z.infer<typeof CreateReviewInput>;

export const RecipeStep = z.object({
  /** Seconds from start of brew. */
  time: z.number().int().min(0).max(60 * 60 * 24),
  /** Cumulative water weight in grams at the end of this step. */
  water: z.number().min(0).max(5000).optional(),
  /** Short heading for the step, e.g. "The bloom". */
  title: z.string().trim().max(60).optional(),
  note: z.string().trim().max(200).optional(),
});
export type RecipeStep = z.infer<typeof RecipeStep>;

export const CreateBrewRecipeInput = z
  .object({
    coffeeBeanId: z.uuid(),
    brewMethod: BrewMethod,
    coffeeDoseG: z.number().positive().max(100),
    waterWeightG: z.number().positive().max(5000),
    waterTempC: z.number().min(0).max(100).optional(),
    grinderModel: z.string().trim().max(80).optional(),
    grindSetting: z.string().trim().max(40).optional(),
    totalBrewTimeSeconds: z.number().int().positive().max(60 * 60 * 24).optional(),
    steps: z.array(RecipeStep).max(30).default([]),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((r) => r.steps.every((s, i, all) => i === 0 || s.time >= all[i - 1]!.time), {
    message: "Steps must be in chronological order",
    path: ["steps"],
  });
export type CreateBrewRecipeInput = z.infer<typeof CreateBrewRecipeInput>;

export const ListRecipesInput = z.object({
  coffeeBeanId: z.uuid(),
  brewMethod: BrewMethod.optional(),
  grinderModel: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const SEARCH_SORTS = ["newest", "top_rated", "price_low"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
export const SEARCH_SORT_LABELS: Record<SearchSort, string> = { newest: "Newest", top_rated: "Top rated", price_low: "Lowest price" };
/** Price filter options: "Under £10" etc. */
export const SEARCH_MAX_PRICES = [1000, 1500, 2000] as const;

/** Search and filter coffees. By default only what you can buy right now. */
export const BeanSearchInput = z.object({
  query: z.string().trim().max(120).optional(),
  originCountry: z.string().trim().max(60).optional(),
  process: Process.optional(),
  roastLevel: RoastLevel.optional(),
  decaf: z.boolean().optional(),
  inStockOnly: z.boolean().default(true),
  /** Coffees with an in-stock size at or under this price. */
  maxPricePence: z.number().int().positive().max(100_000).optional(),
  sort: z.enum(SEARCH_SORTS).default("newest"),
  limit: z.number().int().min(1).max(50).default(24),
  offset: z.number().int().min(0).max(10_000).default(0),
});
export type BeanSearchInput = z.input<typeof BeanSearchInput>;

export const ShelfEntryInput = z.object({
  coffeeBeanId: z.uuid(),
  roastDate: z.iso.date().optional(),
  openedDate: z.iso.date().optional(),
});
export type ShelfEntryInput = z.infer<typeof ShelfEntryInput>;

/**
 * What the LLM extracts from a roaster's messy Shopify product description.
 * Every field is nullable: absence of information must be represented as null,
 * never guessed.
 */
export const ExtractedBeanSpecs = z.object({
  isCoffeeBean: z
    .boolean()
    .describe("False for merch, equipment, gift cards, subscriptions without a specific coffee, etc."),
  beanName: z.string().nullable().describe("Name of the coffee without weight/grind, e.g. 'Ethiopia Guji Hambela'"),
  originCountry: z.string().nullable(),
  region: z.string().nullable(),
  producer: z.string().nullable().describe("Farm, washing station, or producer name"),
  process: Process.nullable(),
  roastLevel: RoastLevel.nullable(),
  varietals: z.array(z.string()),
  altitudeMasl: z.number().int().nullable().describe("Single value; use the midpoint if a range is given"),
  decaf: z.boolean(),
  isBlend: z.boolean(),
  tastingNotes: z.array(z.string()).describe("Short flavour tags, Title Case, e.g. 'Bergamot', 'Milk Chocolate'"),
});
export type ExtractedBeanSpecs = z.infer<typeof ExtractedBeanSpecs>;

/** What the bag scanner reads off a photo of a coffee bag. */
export const ScannedBag = z.object({
  roasterName: z.string().nullable(),
  beanName: z.string().nullable(),
  originCountry: z.string().nullable(),
  roastDate: z.string().nullable().describe("ISO date YYYY-MM-DD if a roast date is printed on the bag"),
});
export type ScannedBag = z.infer<typeof ScannedBag>;

/** Blank → null, so clearing a field removes it rather than saving "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable();

/** Your own profile: how you appear next to your reviews and recipes. */
export const UserProfileInput = z.object({
  displayName: optionalText(60),
  bio: optionalText(160),
  defaultGrinder: optionalText(80),
  defaultBrewMethod: BrewMethod.nullable(),
});
export type UserProfileInput = z.input<typeof UserProfileInput>;

/** A roaster's public profile, edited in the business dashboard. */
export const RoasterProfileInput = z.object({
  roasterId: z.uuid(),
  tagline: optionalText(280),
  bio: optionalText(2000),
  city: optionalText(80),
  establishedYear: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  address: optionalText(200),
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .transform((s) => s || null)
    .pipe(z.url({ protocol: /^https?$/ }).nullable())
    .nullable(),
  /** Must be one of the roaster's own coffee photos (checked by the API). */
  heroImageUrl: z.url().nullable(),
});
export type RoasterProfileInput = z.input<typeof RoasterProfileInput>;
