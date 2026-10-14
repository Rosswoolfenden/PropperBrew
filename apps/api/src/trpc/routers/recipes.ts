import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { brewRecipes, coffeeBeans, profiles, recipeVotes, roasters } from "@propperbrew/db";
import { CreateBrewRecipeInput, ListRecipesInput } from "@propperbrew/shared";
import { protectedProcedure, publicProcedure, router, type Context } from "../init";

const grinderKey = (model?: string) => model?.trim().toLowerCase().replace(/\s+/g, " ") || null;

const roasterAuthors = alias(roasters, "roaster_authors");

/** Recipe rows with their author (a user or the roaster) and whether `viewerId` has upvoted them. */
function recipesWithAuthor(db: Context["db"], viewerId: string | undefined) {
  const myVote = db
    .select({ recipeId: recipeVotes.recipeId })
    .from(recipeVotes)
    // No viewer: match nothing.
    .where(viewerId ? eq(recipeVotes.userId, viewerId) : sql`false`)
    .as("my_vote");
  return db
    .select({
      recipe: brewRecipes,
      user: { username: profiles.username, avatarUrl: profiles.avatarUrl },
      roasterAuthor: { slug: roasterAuthors.slug, name: roasterAuthors.name },
      upvotedByMe: sql<boolean>`${myVote.recipeId} is not null`,
    })
    .from(brewRecipes)
    .leftJoin(profiles, eq(profiles.id, brewRecipes.userId))
    .leftJoin(roasterAuthors, eq(roasterAuthors.id, brewRecipes.roasterId))
    .leftJoin(myVote, eq(myVote.recipeId, brewRecipes.id))
    .$dynamic();
}

type RecipeRow = Awaited<ReturnType<typeof recipesWithAuthor>>[number];

function toRecipe({ recipe: { coffeeDoseDg, grinderKey: _k, userId: _u, roasterId: _r, ...recipe }, user, roasterAuthor, upvotedByMe }: RecipeRow) {
  const author = roasterAuthor
    ? ({ type: "roaster", slug: roasterAuthor.slug, name: roasterAuthor.name } as const)
    : ({ type: "user", username: user!.username, avatarUrl: user!.avatarUrl } as const);
  return { ...recipe, coffeeDoseG: coffeeDoseDg / 10, author, upvotedByMe };
}

export const recipesRouter = router({
  /** "How are people brewing this?" The roaster's own recommendations first, then the community's by upvotes. */
  forBean: publicProcedure.input(ListRecipesInput).query(async ({ ctx, input }) => {
    const rows = await recipesWithAuthor(ctx.db, ctx.user?.id)
      .where(
        and(
          eq(brewRecipes.coffeeBeanId, input.coffeeBeanId),
          input.brewMethod ? eq(brewRecipes.brewMethod, input.brewMethod) : undefined,
          input.grinderModel ? eq(brewRecipes.grinderKey, grinderKey(input.grinderModel)!) : undefined,
        ),
      )
      .orderBy(sql`${brewRecipes.roasterId} is null`, desc(brewRecipes.upvotesCount), desc(brewRecipes.createdAt))
      .limit(input.limit);
    return rows.map(toRecipe);
  }),

  /** The recipe screen: the full recipe plus the coffee it's for. */
  byId: publicProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const [row] = await recipesWithAuthor(ctx.db, ctx.user?.id).where(eq(brewRecipes.id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    const bean = await ctx.db.query.coffeeBeans.findFirst({
      where: eq(coffeeBeans.id, row.recipe.coffeeBeanId),
      columns: { slug: true, name: true, imageUrl: true, tastingNotes: true },
      with: { roaster: { columns: { slug: true, name: true } } },
    });
    return { ...toRecipe(row), bean: bean! };
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
      const recipe = await tx.query.brewRecipes.findFirst({ where: eq(brewRecipes.id, input.recipeId), columns: { id: true } });
      if (!recipe) throw new TRPCError({ code: "NOT_FOUND" });
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
