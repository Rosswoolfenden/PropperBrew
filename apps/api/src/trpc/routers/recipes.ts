import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { brewRecipes, profiles, recipeVotes } from "@propperbrew/db";
import { CreateBrewRecipeInput, ListRecipesInput } from "@propperbrew/shared";
import { protectedProcedure, publicProcedure, router } from "../init";

const grinderKey = (model?: string) => model?.trim().toLowerCase().replace(/\s+/g, " ") || null;

export const recipesRouter = router({
  /** "How are people brewing this?" — filter by brewer and the user's own grinder. */
  forBean: publicProcedure.input(ListRecipesInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        recipe: brewRecipes,
        user: { username: profiles.username, avatarUrl: profiles.avatarUrl },
      })
      .from(brewRecipes)
      .innerJoin(profiles, eq(profiles.id, brewRecipes.userId))
      .where(
        and(
          eq(brewRecipes.coffeeBeanId, input.coffeeBeanId),
          input.brewMethod ? eq(brewRecipes.brewMethod, input.brewMethod) : undefined,
          input.grinderModel ? eq(brewRecipes.grinderKey, grinderKey(input.grinderModel)!) : undefined,
        ),
      )
      .orderBy(desc(brewRecipes.upvotesCount), desc(brewRecipes.createdAt))
      .limit(input.limit);
    return rows.map(({ recipe: { coffeeDoseDg, ...r }, user }) => ({ ...r, coffeeDoseG: coffeeDoseDg / 10, user }));
  }),

  create: protectedProcedure.input(CreateBrewRecipeInput).mutation(async ({ ctx, input }) => {
    const [recipe] = await ctx.db
      .insert(brewRecipes)
      .values({
        userId: ctx.user.id,
        coffeeBeanId: input.coffeeBeanId,
        brewMethod: input.brewMethod,
        coffeeDoseDg: Math.round(input.coffeeDoseG * 10),
        waterWeightG: Math.round(input.waterWeightG),
        waterTempC: input.waterTempC,
        grinderModel: input.grinderModel,
        grinderKey: grinderKey(input.grinderModel),
        grindSetting: input.grindSetting,
        totalBrewTimeSeconds: input.totalBrewTimeSeconds,
        steps: input.steps,
        notes: input.notes,
      })
      .returning({ id: brewRecipes.id });
    return recipe!;
  }),

  toggleUpvote: protectedProcedure.input(z.object({ recipeId: z.uuid() })).mutation(({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      const removed = await tx
        .delete(recipeVotes)
        .where(and(eq(recipeVotes.recipeId, input.recipeId), eq(recipeVotes.userId, ctx.user.id)))
        .returning();
      if (removed.length === 0) {
        await tx.insert(recipeVotes).values({ recipeId: input.recipeId, userId: ctx.user.id });
      }
      const delta = removed.length === 0 ? 1 : -1;
      const [updated] = await tx
        .update(brewRecipes)
        .set({ upvotesCount: sql`${brewRecipes.upvotesCount} + ${delta}` })
        .where(eq(brewRecipes.id, input.recipeId))
        .returning({ upvotesCount: brewRecipes.upvotesCount });
      return { upvoted: delta === 1, upvotesCount: updated?.upvotesCount ?? 0 };
    }),
  ),
});
