import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { coffeeBeans, profiles, reviews, type Db } from "@propperbrew/db";
import { CreateReviewInput, ratingFromDb, ratingToDb } from "@propperbrew/shared";
import { protectedProcedure, publicProcedure, router } from "../init";

/** Recompute the bean's rolling aggregates. Cheap at our scale; move to a trigger if it isn't. */
async function refreshBeanAggregates(db: Db, coffeeBeanId: string) {
  await db
    .update(coffeeBeans)
    .set({
      avgRating: sql`(select round(avg(${reviews.rating}))::int from ${reviews} where ${reviews.coffeeBeanId} = ${coffeeBeanId})`,
      reviewCount: sql`(select count(*)::int from ${reviews} where ${reviews.coffeeBeanId} = ${coffeeBeanId})`,
      avgFlavourScores: sql`(
        select case when count(${reviews.flavourScores}) = 0 then null else jsonb_build_object(
          'acidity', round(avg((${reviews.flavourScores}->>'acidity')::numeric)),
          'sweetness', round(avg((${reviews.flavourScores}->>'sweetness')::numeric)),
          'body', round(avg((${reviews.flavourScores}->>'body')::numeric)),
          'bitterness', round(avg((${reviews.flavourScores}->>'bitterness')::numeric))
        ) end
        from ${reviews} where ${reviews.coffeeBeanId} = ${coffeeBeanId}
      )`,
    })
    .where(eq(coffeeBeans.id, coffeeBeanId));
}

export const reviewsRouter = router({
  forBean: publicProcedure
    .input(z.object({ coffeeBeanId: z.uuid(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          tastingNotes: reviews.tastingNotes,
          body: reviews.body,
          photoUrl: reviews.photoUrl,
          brewMethod: reviews.brewMethod,
          createdAt: reviews.createdAt,
          user: { username: profiles.username, avatarUrl: profiles.avatarUrl },
        })
        .from(reviews)
        .innerJoin(profiles, eq(profiles.id, reviews.userId))
        .where(eq(reviews.coffeeBeanId, input.coffeeBeanId))
        .orderBy(desc(reviews.createdAt))
        .limit(input.limit);
      return rows.map((r) => ({ ...r, rating: ratingFromDb(r.rating) }));
    }),

  /** One review per user per bean; re-submitting edits it. */
  upsert: protectedProcedure.input(CreateReviewInput).mutation(async ({ ctx, input }) => {
    const values = {
      userId: ctx.user.id,
      coffeeBeanId: input.coffeeBeanId,
      rating: ratingToDb(input.rating),
      tastingNotes: input.tastingNotes,
      body: input.body,
      flavourScores: input.flavourScores,
      photoUrl: input.photoUrl,
      brewMethod: input.brewMethod,
    };
    const { userId: _u, coffeeBeanId: _b, ...update } = values;
    const [review] = await ctx.db
      .insert(reviews)
      .values(values)
      .onConflictDoUpdate({ target: [reviews.userId, reviews.coffeeBeanId], set: update })
      .returning();
    await refreshBeanAggregates(ctx.db, input.coffeeBeanId);
    return { ...review!, rating: ratingFromDb(review!.rating) };
  }),
});
