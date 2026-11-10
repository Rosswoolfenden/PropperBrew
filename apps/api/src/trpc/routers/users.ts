import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { brewRecipes, coffeeBeans, profiles, reviews, roasters } from "@propperbrew/db";
import { ratingFromDb } from "@propperbrew/shared";
import { publicProcedure, router } from "../init";

/** How many reviews and recipes a profile lists. */
const PROFILE_LIMIT = 20;

export const usersRouter = router({
  /** Someone's public profile: who they are, their reviews and recipes. Nothing from their shelf. */
  profile: publicProcedure.input(z.object({ username: z.string().trim().min(1).max(60) })).query(async ({ ctx, input }) => {
    const profile = await ctx.db.query.profiles.findFirst({ where: eq(profiles.username, input.username) });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

    const bean = {
      slug: coffeeBeans.slug,
      name: coffeeBeans.name,
      imageUrl: coffeeBeans.imageUrl,
      originCountry: coffeeBeans.originCountry,
    };
    const roaster = { slug: roasters.slug, name: roasters.name };
    function withRoaster<T extends { bean: object; roaster: object }>({ bean, roaster, ...row }: T) {
      return { ...(row as Omit<T, "bean" | "roaster">), bean: { ...(bean as T["bean"]), roaster: roaster as T["roaster"] } };
    }
    const [reviewRows, recipeRows, [counts]] = await Promise.all([
      ctx.db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          tastingNotes: reviews.tastingNotes,
          body: reviews.body,
          flavourScores: reviews.flavourScores,
          photoUrl: reviews.photoUrl,
          createdAt: reviews.createdAt,
          bean,
          roaster,
        })
        .from(reviews)
        .innerJoin(coffeeBeans, eq(coffeeBeans.id, reviews.coffeeBeanId))
        .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
        .where(eq(reviews.userId, profile.id))
        .orderBy(desc(reviews.createdAt), desc(reviews.id))
        .limit(PROFILE_LIMIT),
      ctx.db
        .select({
          id: brewRecipes.id,
          brewMethod: brewRecipes.brewMethod,
          coffeeDoseDg: brewRecipes.coffeeDoseDg,
          waterWeightG: brewRecipes.waterWeightG,
          waterTempC: brewRecipes.waterTempC,
          upvotesCount: brewRecipes.upvotesCount,
          createdAt: brewRecipes.createdAt,
          bean,
          roaster,
        })
        .from(brewRecipes)
        .innerJoin(coffeeBeans, eq(coffeeBeans.id, brewRecipes.coffeeBeanId))
        .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
        .where(eq(brewRecipes.userId, profile.id))
        .orderBy(desc(brewRecipes.createdAt), desc(brewRecipes.id))
        .limit(PROFILE_LIMIT),
      // Totals, not just what's listed. "Roasters" is how many roasters' coffees they've reviewed or brewed.
      ctx.db.execute<{ reviews: number; recipes: number; roasters: number }>(sql`
        select
          (select count(*)::int from ${reviews} where ${reviews.userId} = ${profile.id}) as reviews,
          (select count(*)::int from ${brewRecipes} where ${brewRecipes.userId} = ${profile.id}) as recipes,
          (select count(distinct b.roaster_id)::int from ${coffeeBeans} b
            where b.id in (select coffee_bean_id from ${reviews} where user_id = ${profile.id}
                           union select coffee_bean_id from ${brewRecipes} where user_id = ${profile.id})) as roasters
      `).then((r) => [...r]),
    ]);

    return {
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      memberSince: profile.createdAt,
      gear: { grinder: profile.defaultGrinder, brewMethod: profile.defaultBrewMethod },
      isYou: ctx.user?.id === profile.id,
      stats: counts ?? { reviews: 0, recipes: 0, roasters: 0 },
      reviews: reviewRows.map((r) => ({ ...withRoaster(r), rating: ratingFromDb(r.rating) })),
      recipes: recipeRows.map(({ coffeeDoseDg, ...r }) => ({ ...withRoaster(r), coffeeDoseG: coffeeDoseDg / 10 })),
    };
  }),
});
