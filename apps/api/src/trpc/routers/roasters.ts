import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { coffeeBeans, roasters, shopifyVariants } from "@propperbrew/db";
import { ratingFromDb } from "@propperbrew/shared";
import { publicProcedure, router } from "../init";

/** Coffees shown per roaster on the discovery screen. */
export const COFFEES_PER_ROASTER = 8;

export const roastersRouter = router({
  /**
   * Discovery: roasters with something orderable right now, each with their newest coffees.
   * Roasters with the most recently added coffee come first.
   */
  discover: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(30).default(12) }))
    .query(async ({ ctx, input }) => {
      // Cheapest in-stock variant per coffee. Coffees without one can't be ordered, so they're left out.
      const prices = ctx.db
        .select({
          coffeeBeanId: shopifyVariants.coffeeBeanId,
          fromPricePence: sql<number>`min(${shopifyVariants.pricePence})`.as("from_price_pence"),
          priceCount: sql<number>`count(distinct ${shopifyVariants.pricePence})::int`.as("price_count"),
        })
        .from(shopifyVariants)
        .where(eq(shopifyVariants.inStock, true))
        .groupBy(shopifyVariants.coffeeBeanId)
        .as("prices");

      const ranked = ctx.db
        .select({
          id: coffeeBeans.id,
          roasterId: coffeeBeans.roasterId,
          slug: coffeeBeans.slug,
          name: coffeeBeans.name,
          imageUrl: coffeeBeans.imageUrl,
          originCountry: coffeeBeans.originCountry,
          process: coffeeBeans.process,
          roastLevel: coffeeBeans.roastLevel,
          tastingNotes: coffeeBeans.tastingNotes,
          avgRating: coffeeBeans.avgRating,
          reviewCount: coffeeBeans.reviewCount,
          createdAt: coffeeBeans.createdAt,
          fromPricePence: prices.fromPricePence,
          priceCount: prices.priceCount,
          rank: sql<number>`row_number() over (partition by ${coffeeBeans.roasterId} order by ${coffeeBeans.createdAt} desc)`.as("rank"),
          coffeeCount: sql<number>`count(*) over (partition by ${coffeeBeans.roasterId})::int`.as("coffee_count"),
        })
        .from(coffeeBeans)
        .innerJoin(prices, eq(prices.coffeeBeanId, coffeeBeans.id))
        .where(eq(coffeeBeans.isArchived, false))
        .as("ranked");

      const rows = await ctx.db
        .select({
          coffee: {
            id: ranked.id,
            slug: ranked.slug,
            name: ranked.name,
            imageUrl: ranked.imageUrl,
            originCountry: ranked.originCountry,
            process: ranked.process,
            roastLevel: ranked.roastLevel,
            tastingNotes: ranked.tastingNotes,
            avgRating: ranked.avgRating,
            reviewCount: ranked.reviewCount,
            fromPricePence: ranked.fromPricePence,
            /** Distinct in-stock prices; more than one means fromPricePence is a "from" price. */
            priceCount: ranked.priceCount,
            addedAt: ranked.createdAt,
          },
          coffeeCount: ranked.coffeeCount,
          roaster: {
            id: roasters.id,
            slug: roasters.slug,
            name: roasters.name,
            city: roasters.city,
            bio: roasters.bio,
            tagline: roasters.tagline,
            heroImageUrl: roasters.heroImageUrl,
          },
        })
        .from(ranked)
        .innerJoin(roasters, eq(roasters.id, ranked.roasterId))
        .where(and(lte(ranked.rank, COFFEES_PER_ROASTER), eq(roasters.isActive, true), isNotNull(roasters.shopifyDomain)))
        // Newest first within each roaster, so each roaster's first row carries its newest coffee.
        .orderBy(desc(ranked.createdAt), ranked.id);

      const byRoaster = new Map<string, (typeof rows)[number]["roaster"] & { coffeeCount: number; coffees: (typeof rows)[number]["coffee"][] }>();
      for (const { roaster, coffee, coffeeCount } of rows) {
        let entry = byRoaster.get(roaster.id);
        if (!entry) byRoaster.set(roaster.id, (entry = { ...roaster, coffeeCount, coffees: [] }));
        entry.coffees.push({ ...coffee, avgRating: coffee.avgRating === null ? null : ratingFromDb(coffee.avgRating) });
      }
      return [...byRoaster.values()].slice(0, input.limit);
    }),

  /** A roaster's public page: their profile and the coffees they're selling now. */
  bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(80) })).query(async ({ ctx, input }) => {
    const roaster = await ctx.db.query.roasters.findFirst({
      where: and(eq(roasters.slug, input.slug), eq(roasters.isActive, true)),
      columns: {
        id: true,
        slug: true,
        name: true,
        city: true,
        bio: true,
        tagline: true,
        establishedYear: true,
        address: true,
        websiteUrl: true,
        heroImageUrl: true,
      },
    });
    if (!roaster) throw new TRPCError({ code: "NOT_FOUND" });
    const beans = await ctx.db.query.coffeeBeans.findMany({
      where: and(eq(coffeeBeans.roasterId, roaster.id), eq(coffeeBeans.isArchived, false)),
      columns: { id: true, slug: true, name: true, imageUrl: true, roastLevel: true, tastingNotes: true, avgRating: true, reviewCount: true },
      with: { variants: { columns: { pricePence: true, inStock: true } } },
      orderBy: asc(coffeeBeans.name),
    });
    const coffees = beans.map(({ variants, avgRating, ...b }) => {
      const prices = variants.filter((v) => v.inStock).map((v) => v.pricePence);
      return {
        ...b,
        avgRating: avgRating === null ? null : ratingFromDb(avgRating),
        fromPricePence: prices.length ? Math.min(...prices) : null,
        priceCount: new Set(prices).size,
      };
    });
    // In stock first.
    coffees.sort((a, b) => Number(b.fromPricePence !== null) - Number(a.fromPricePence !== null));
    return { ...roaster, coffees };
  }),
});
