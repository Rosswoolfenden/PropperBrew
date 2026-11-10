import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { coffeeBeans, profiles, reviews, type Db } from "@propperbrew/db";
import { CreateReviewInput, ratingFromDb, ratingToDb, SENSORY_DIMENSIONS } from "@propperbrew/shared";
import { assertOwnUpload } from "../../uploads/own";
import { limitedProcedure, protectedProcedure, publicProcedure, router } from "../init";

/** Recompute the bean's rolling aggregates. Cheap at our scale; move to a trigger if it isn't. */
export async function refreshBeanAggregates(db: Db, coffeeBeanId: string) {
  await db
    .update(coffeeBeans)
    .set({
      avgRating: sql`(select round(avg(${reviews.rating}))::int from ${reviews} where ${reviews.coffeeBeanId} = ${coffeeBeanId})`,
      reviewCount: sql`(select count(*)::int from ${reviews} where ${reviews.coffeeBeanId} = ${coffeeBeanId})`,
      // Average of each dimension over the reviews that scored it (one decimal), or null if none did.
      avgFlavourScores: sql`(
        select nullif(jsonb_strip_nulls(jsonb_build_object(${sql.raw(
          SENSORY_DIMENSIONS.map((d) => `'${d}', round(avg((flavour_scores->>'${d}')::numeric), 1)`).join(", "),
        )})), '{}'::jsonb)
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

  /** Your review of a coffee (to edit it), or null. */
  mine: protectedProcedure.input(z.object({ coffeeBeanId: z.uuid() })).query(async ({ ctx, input }) => {
    const review = await ctx.db.query.reviews.findFirst({
      where: and(eq(reviews.userId, ctx.user.id), eq(reviews.coffeeBeanId, input.coffeeBeanId)),
    });
    return review ? { ...review, rating: ratingFromDb(review.rating) } : null;
  }),

  /** One review per user per bean; re-submitting edits it. */
  upsert: limitedProcedure("review", 20).input(CreateReviewInput).mutation(async ({ ctx, input }) => {
    if (input.photoUrl) {
      const current = await ctx.db.query.reviews.findFirst({
        where: and(eq(reviews.userId, ctx.user.id), eq(reviews.coffeeBeanId, input.coffeeBeanId)),
        columns: { photoUrl: true },
      });
      if (input.photoUrl !== current?.photoUrl) await assertOwnUpload(ctx.db, ctx.user.id, input.photoUrl, "review");
    }
    const values = {
      userId: ctx.user.id,
      coffeeBeanId: input.coffeeBeanId,
      rating: ratingToDb(input.rating),
      tastingNotes: input.tastingNotes,
      body: input.body,
      // Nothing scored is "no sensory profile", not an empty one.
      flavourScores: input.flavourScores && Object.values(input.flavourScores).some((v) => v !== undefined) ? input.flavourScores : null,
      // Leaving the photo out of an edit removes it.
      photoUrl: input.photoUrl ?? null,
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
