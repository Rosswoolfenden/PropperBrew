import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { brewRecipes, coffeeBeans, profiles, roasterMembers, roasters, reviews, type Db } from "@propperbrew/db";
import { CreateBrewRecipeInput, normalizeShopDomain, ratingFromDb, RoasterProfileInput, type RoasterRole } from "@propperbrew/shared";
import { connectToken } from "../../business/connect-token";
import { env } from "../../env";
import { protectedProcedure, router } from "../init";
import { recipeColumns } from "./recipes";

/** The caller's role at a roaster; anyone else is turned away. */
async function requireMember(db: Db, userId: string, roasterId: string): Promise<RoasterRole> {
  const member = await db.query.roasterMembers.findFirst({
    where: and(eq(roasterMembers.roasterId, roasterId), eq(roasterMembers.userId, userId)),
  });
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "You're not part of this roaster's team." });
  return member.role;
}

const FEEDBACK_LIMIT = 8;

export const businessRouter = router({
  /** The signed-in person's business side: the roasters they belong to, each with its coffees. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.query.profiles.findFirst({
      where: eq(profiles.id, ctx.user.id),
      columns: { username: true, accountType: true },
    });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

    const memberships = await ctx.db.query.roasterMembers.findMany({
      where: eq(roasterMembers.userId, ctx.user.id),
      columns: { role: true },
      with: {
        roaster: {
          columns: {
            id: true,
            slug: true,
            name: true,
            city: true,
            shopifyDomain: true,
            shopifyInstalledAt: true,
            shopifyUninstalledAt: true,
            tagline: true,
            bio: true,
            establishedYear: true,
            address: true,
            websiteUrl: true,
            heroImageUrl: true,
          },
        },
      },
    });
    const roasterIds = memberships.map((m) => m.roaster.id);
    const beans = roasterIds.length
      ? await ctx.db.query.coffeeBeans.findMany({
          where: inArray(coffeeBeans.roasterId, roasterIds),
          columns: { id: true, roasterId: true, slug: true, name: true, imageUrl: true, isArchived: true, avgRating: true, reviewCount: true },
          with: { variants: { columns: { pricePence: true, inStock: true } } },
          orderBy: (b, { asc }) => asc(b.name),
        })
      : [];

    // The roaster's own recommendations, and what the community has said about their coffees.
    const [recommendations, recentReviews, communityRecipes] = roasterIds.length
      ? await Promise.all([
          ctx.db.query.brewRecipes.findMany({
            where: inArray(brewRecipes.roasterId, roasterIds),
            with: { bean: { columns: { name: true, slug: true } } },
            orderBy: desc(brewRecipes.createdAt),
          }),
          ctx.db
            .select({
              id: reviews.id,
              rating: reviews.rating,
              body: reviews.body,
              tastingNotes: reviews.tastingNotes,
              createdAt: reviews.createdAt,
              username: profiles.username,
              bean: { name: coffeeBeans.name, slug: coffeeBeans.slug, roasterId: coffeeBeans.roasterId },
            })
            .from(reviews)
            .innerJoin(coffeeBeans, eq(coffeeBeans.id, reviews.coffeeBeanId))
            .innerJoin(profiles, eq(profiles.id, reviews.userId))
            .where(inArray(coffeeBeans.roasterId, roasterIds))
            .orderBy(desc(reviews.createdAt))
            .limit(FEEDBACK_LIMIT * roasterIds.length),
          ctx.db
            .select({
              id: brewRecipes.id,
              brewMethod: brewRecipes.brewMethod,
              upvotesCount: brewRecipes.upvotesCount,
              createdAt: brewRecipes.createdAt,
              username: profiles.username,
              bean: { name: coffeeBeans.name, slug: coffeeBeans.slug, roasterId: coffeeBeans.roasterId },
            })
            .from(brewRecipes)
            .innerJoin(coffeeBeans, eq(coffeeBeans.id, brewRecipes.coffeeBeanId))
            .innerJoin(profiles, eq(profiles.id, brewRecipes.userId))
            .where(and(inArray(coffeeBeans.roasterId, roasterIds), isNotNull(brewRecipes.userId)))
            .orderBy(desc(brewRecipes.createdAt))
            .limit(FEEDBACK_LIMIT * roasterIds.length),
        ])
      : [[], [], []];

    return {
      email: ctx.user.email ?? null,
      username: profile.username,
      accountType: profile.accountType,
      roasters: memberships.map(({ role, roaster: { shopifyInstalledAt, shopifyUninstalledAt, ...roaster } }) => {
        const coffees = beans
          .filter((b) => b.roasterId === roaster.id)
          .map(({ variants, roasterId: _r, avgRating, ...b }) => {
            const inStock = variants.filter((v) => v.inStock).map((v) => v.pricePence);
            return {
              ...b,
              avgRating: avgRating === null ? null : ratingFromDb(avgRating),
              status: b.isArchived ? "archived" : inStock.length > 0 ? "in_stock" : "sold_out",
              fromPricePence: inStock.length > 0 ? Math.min(...inStock) : null,
            } as const;
          });
        return {
          ...roaster,
          role,
          shopify: {
            connected: !!shopifyInstalledAt && !shopifyUninstalledAt,
            connectedAt: shopifyUninstalledAt ? null : shopifyInstalledAt,
          },
          coffees,
          liveCount: coffees.filter((c) => c.status === "in_stock").length,
          recommendations: recommendations
            .filter((r) => r.roasterId === roaster.id)
            .map(({ coffeeDoseDg, ...r }) => ({
              id: r.id,
              bean: r.bean,
              brewMethod: r.brewMethod,
              coffeeDoseG: coffeeDoseDg / 10,
              waterWeightG: r.waterWeightG,
              waterTempC: r.waterTempC,
              upvotesCount: r.upvotesCount,
            })),
          feedback: {
            reviews: recentReviews
              .filter((r) => r.bean.roasterId === roaster.id)
              .slice(0, FEEDBACK_LIMIT)
              .map((r) => ({ ...r, rating: ratingFromDb(r.rating) })),
            recipes: communityRecipes.filter((r) => r.bean.roasterId === roaster.id).slice(0, FEEDBACK_LIMIT),
          },
        };
      }),
    };
  }),

  /** Edit a roaster's public profile. */
  updateProfile: protectedProcedure.input(RoasterProfileInput).mutation(async ({ ctx, input: { roasterId, ...profile } }) => {
    await requireMember(ctx.db, ctx.user.id, roasterId);
    if (profile.heroImageUrl) {
      // Only their own coffee photos, so a roaster page can't be pointed at any image on the web.
      const own = await ctx.db.query.coffeeBeans.findFirst({
        where: and(eq(coffeeBeans.roasterId, roasterId), eq(coffeeBeans.imageUrl, profile.heroImageUrl)),
        columns: { id: true },
      });
      if (!own) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick one of your coffee photos for the hero image." });
    }
    const [updated] = await ctx.db.update(roasters).set(profile).where(eq(roasters.id, roasterId)).returning({ slug: roasters.slug });
    return updated!;
  }),

  /** Post a recipe as the roaster's own recommendation for one of their coffees. */
  addRecommendation: protectedProcedure.input(CreateBrewRecipeInput).mutation(async ({ ctx, input }) => {
    const bean = await ctx.db.query.coffeeBeans.findFirst({ where: eq(coffeeBeans.id, input.coffeeBeanId), columns: { roasterId: true } });
    if (!bean) throw new TRPCError({ code: "NOT_FOUND" });
    await requireMember(ctx.db, ctx.user.id, bean.roasterId);
    const [recipe] = await ctx.db
      .insert(brewRecipes)
      .values(recipeColumns(input, { roasterId: bean.roasterId }))
      .returning({ id: brewRecipes.id });
    return recipe!;
  }),

  /** Remove one of the roaster's recommendations. */
  deleteRecommendation: protectedProcedure.input(z.object({ recipeId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const recipe = await ctx.db.query.brewRecipes.findFirst({ where: eq(brewRecipes.id, input.recipeId), columns: { roasterId: true } });
    if (!recipe?.roasterId) throw new TRPCError({ code: "NOT_FOUND" });
    await requireMember(ctx.db, ctx.user.id, recipe.roasterId);
    await ctx.db.delete(brewRecipes).where(eq(brewRecipes.id, input.recipeId));
    return { deleted: true };
  }),

  /** Where to send a business account to connect its Shopify store (the install flow, linked to them). */
  connectShopifyUrl: protectedProcedure.input(z.object({ shop: z.string().trim().min(1).max(255) })).mutation(async ({ ctx, input }) => {
    const shop = normalizeShopDomain(input.shop);
    if (!shop) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Enter your store's myshopify.com address, e.g. your-store.myshopify.com" });
    }
    const profile = await ctx.db.query.profiles.findFirst({ where: eq(profiles.id, ctx.user.id), columns: { accountType: true } });
    if (profile?.accountType !== "business") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Use a business account to connect a store." });
    }
    const url = new URL("/api/shopify/auth", env.PUBLIC_API_URL);
    url.searchParams.set("shop", shop);
    url.searchParams.set("link", await connectToken(ctx.user.id));
    return { url: url.toString() };
  }),
});
