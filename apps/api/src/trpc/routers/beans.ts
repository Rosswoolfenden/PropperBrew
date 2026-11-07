import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { coffeeBeans, roasters, shopifyVariants } from "@propperbrew/db";
import { BeanSearchInput, PROCESSES, ratingFromDb, ROAST_LEVELS } from "@propperbrew/shared";
import { publicProcedure, router } from "../init";

const withRating = <T extends { avgRating: number | null }>(b: T) => ({
  ...b,
  avgRating: b.avgRating === null ? null : ratingFromDb(b.avgRating),
});

/** Treat % and _ in someone's search as plain characters. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export const beansRouter = router({
  /** Search and filter coffees across all roasters (Search in the app and on the website). */
  search: publicProcedure.input(BeanSearchInput).query(async ({ ctx, input }) => {
    // Each coffee's cheapest in-stock price, and how many different prices it comes at.
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

    const contains = input.query ? `%${escapeLike(input.query)}%` : null;
    const filters: (SQL | undefined)[] = [
      eq(coffeeBeans.isArchived, false),
      eq(roasters.isActive, true),
      input.originCountry ? ilike(coffeeBeans.originCountry, escapeLike(input.originCountry)) : undefined,
      input.process ? eq(coffeeBeans.process, input.process) : undefined,
      input.roastLevel ? eq(coffeeBeans.roastLevel, input.roastLevel) : undefined,
      input.decaf !== undefined ? eq(coffeeBeans.decaf, input.decaf) : undefined,
      input.inStockOnly || input.maxPricePence ? isNotNull(prices.fromPricePence) : undefined,
      input.maxPricePence ? lte(prices.fromPricePence, input.maxPricePence) : undefined,
      contains
        ? or(
            sql`to_tsvector('english', ${coffeeBeans.name} || ' ' || coalesce(${coffeeBeans.originCountry}, '') || ' ' || coalesce(${coffeeBeans.region}, '')) @@ websearch_to_tsquery('english', ${input.query})`,
            ilike(coffeeBeans.name, contains),
            ilike(roasters.name, contains),
            sql`array_to_string(${coffeeBeans.tastingNotes}, ' ') ilike ${contains}`,
          )
        : undefined,
    ];
    const order = {
      newest: [desc(coffeeBeans.createdAt)],
      top_rated: [sql`${coffeeBeans.avgRating} desc nulls last`, desc(coffeeBeans.reviewCount)],
      price_low: [sql`${prices.fromPricePence} asc nulls last`],
    }[input.sort];

    const rows = await ctx.db
      .select({
        id: coffeeBeans.id,
        slug: coffeeBeans.slug,
        name: coffeeBeans.name,
        imageUrl: coffeeBeans.imageUrl,
        originCountry: coffeeBeans.originCountry,
        process: coffeeBeans.process,
        roastLevel: coffeeBeans.roastLevel,
        tastingNotes: coffeeBeans.tastingNotes,
        avgRating: coffeeBeans.avgRating,
        reviewCount: coffeeBeans.reviewCount,
        fromPricePence: prices.fromPricePence,
        priceCount: prices.priceCount,
        total: sql<number>`count(*) over ()::int`,
        roaster: { slug: roasters.slug, name: roasters.name, city: roasters.city },
      })
      .from(coffeeBeans)
      .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
      .leftJoin(prices, eq(prices.coffeeBeanId, coffeeBeans.id))
      .where(and(...filters))
      .orderBy(...order, coffeeBeans.id)
      .limit(input.limit)
      .offset(input.offset);

    const total = rows[0]?.total ?? 0;
    return {
      items: rows.map(({ total: _t, ...b }) => withRating(b)),
      total,
      hasMore: input.offset + rows.length < total,
    };
  }),

  /**
   * What can be filtered on: the origins, processes and roast levels of coffees you can buy now,
   * so no filter leads nowhere.
   */
  searchOptions: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .selectDistinct({ origin: coffeeBeans.originCountry, process: coffeeBeans.process, roastLevel: coffeeBeans.roastLevel, decaf: coffeeBeans.decaf })
      .from(coffeeBeans)
      .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
      .innerJoin(shopifyVariants, and(eq(shopifyVariants.coffeeBeanId, coffeeBeans.id), eq(shopifyVariants.inStock, true)))
      .where(and(eq(coffeeBeans.isArchived, false), eq(roasters.isActive, true)));
    const present = <T,>(values: (T | null)[]) => [...new Set(values.filter((v): v is T => v !== null))];
    return {
      origins: present(rows.map((r) => r.origin)).sort(),
      processes: PROCESSES.filter((p) => rows.some((r) => r.process === p)),
      roastLevels: ROAST_LEVELS.filter((l) => rows.some((r) => r.roastLevel === l)),
      hasDecaf: rows.some((r) => r.decaf),
    };
  }),

  /** Bean page: specs, roaster, buyable variants. Reviews/recipes load separately. */
  bySlug: publicProcedure
    .input(z.object({ roasterSlug: z.string(), beanSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const roaster = await ctx.db.query.roasters.findFirst({ where: eq(roasters.slug, input.roasterSlug) });
      if (!roaster) throw new TRPCError({ code: "NOT_FOUND" });
      const bean = await ctx.db.query.coffeeBeans.findFirst({
        where: and(eq(coffeeBeans.roasterId, roaster.id), eq(coffeeBeans.slug, input.beanSlug)),
        with: { variants: { where: eq(shopifyVariants.inStock, true), orderBy: asc(shopifyVariants.pricePence) } },
      });
      if (!bean) throw new TRPCError({ code: "NOT_FOUND" });
      const { shopifyAccessTokenEnc: _t, shopifyScopes: _s, stripeAccountId: _a, commissionBps: _c, ...publicRoaster } = roaster;
      return {
        ...withRating(bean),
        roaster: publicRoaster,
        variants: bean.isArchived
          ? []
          : bean.variants.map(({ id, shopifyVariantId, title, weightG, grindOption, pricePence }) => ({ id, shopifyVariantId, title, weightG, grindOption, pricePence })),
        /** Where to send buyers (see shopifyCartUrl). Null when nothing can be ordered from the roaster's store. */
        checkoutDomain: bean.isArchived ? null : roaster.shopifyDomain,
      };
    }),
});
