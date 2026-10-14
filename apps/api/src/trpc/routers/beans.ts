import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, exists, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { coffeeBeans, roasters, shopifyVariants } from "@propperbrew/db";
import { BeanSearchInput, ratingFromDb } from "@propperbrew/shared";
import { publicProcedure, router } from "../init";

const withRating = <T extends { avgRating: number | null }>(b: T) => ({
  ...b,
  avgRating: b.avgRating === null ? null : ratingFromDb(b.avgRating),
});

export const beansRouter = router({
  search: publicProcedure.input(BeanSearchInput).query(async ({ ctx, input }) => {
    const filters: (SQL | undefined)[] = [
      eq(coffeeBeans.isArchived, false),
      input.originCountry ? ilike(coffeeBeans.originCountry, input.originCountry) : undefined,
      input.process ? eq(coffeeBeans.process, input.process) : undefined,
      input.roastLevel ? eq(coffeeBeans.roastLevel, input.roastLevel) : undefined,
      input.decaf !== undefined ? eq(coffeeBeans.decaf, input.decaf) : undefined,
      input.cursor ? lt(coffeeBeans.createdAt, new Date(input.cursor)) : undefined,
      input.query
        ? or(
            sql`to_tsvector('english', ${coffeeBeans.name} || ' ' || coalesce(${coffeeBeans.originCountry}, '') || ' ' || coalesce(${coffeeBeans.region}, '')) @@ websearch_to_tsquery('english', ${input.query})`,
            ilike(roasters.name, `%${input.query}%`),
          )
        : undefined,
      input.inStockOnly
        ? exists(
            ctx.db
              .select({ one: sql`1` })
              .from(shopifyVariants)
              .where(and(eq(shopifyVariants.coffeeBeanId, coffeeBeans.id), eq(shopifyVariants.inStock, true))),
          )
        : undefined,
    ];
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
        createdAt: coffeeBeans.createdAt,
        roaster: { id: roasters.id, slug: roasters.slug, name: roasters.name, city: roasters.city },
      })
      .from(coffeeBeans)
      .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
      .where(and(...filters))
      .orderBy(desc(coffeeBeans.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = rows.slice(0, input.limit).map(withRating);
    return { items, nextCursor: hasMore ? items.at(-1)!.createdAt.toISOString() : null };
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
