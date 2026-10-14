import { z } from "zod";
import { BrewMethod, Process, RoastLevel } from "./enums";

/** 1.0 – 5.0 in 0.1 increments, stored as an integer 10–50 in the DB. */
export const Rating = z
  .number()
  .min(1)
  .max(5)
  .refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-6, { message: "Rating must be in 0.1 increments" });

export const FlavourScores = z.object({
  acidity: z.number().int().min(0).max(5),
  sweetness: z.number().int().min(0).max(5),
  body: z.number().int().min(0).max(5),
  bitterness: z.number().int().min(0).max(5),
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

export const BeanSearchInput = z.object({
  query: z.string().trim().max(120).optional(),
  originCountry: z.string().optional(),
  process: Process.optional(),
  roastLevel: RoastLevel.optional(),
  decaf: z.boolean().optional(),
  inStockOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(24),
  cursor: z.string().optional(),
});
export type BeanSearchInput = z.infer<typeof BeanSearchInput>;

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
