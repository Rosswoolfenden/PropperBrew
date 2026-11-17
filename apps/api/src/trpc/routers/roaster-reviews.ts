import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { orders, profiles, roasterMembers, roasterReviews, roasters, type Db } from "@propperbrew/db";
import { RoasterReviewInput } from "@propperbrew/shared";
import { limitedProcedure, protectedProcedure, publicProcedure, router } from "../init";

/** Orders that mean someone really bought from the roaster through PropperBrew. */
const BOUGHT = ["paid", "pushed_to_shopify", "fulfilled", "partially_fulfilled"] as const;

/** Of these people, who has bought from this roaster here ("Verified purchase"). */
export async function verifiedBuyers(db: Db, roasterId: string, userIds: string[]) {
  if (userIds.length === 0) return new Set<string>();
  const rows = await db
    .selectDistinct({ userId: orders.userId })
    .from(orders)
    .where(and(eq(orders.roasterId, roasterId), inArray(orders.userId, userIds), inArray(orders.status, [...BOUGHT])));
  return new Set(rows.map((r) => r.userId!));
}

export const roasterReviewsRouter = router({
  /** A roaster's reviews, newest first, with the averages. */
  forRoaster: publicProcedure.input(z.object({ slug: z.string().min(1).max(80) })).query(async ({ ctx, input }) => {
    const roaster = await ctx.db.query.roasters.findFirst({ where: eq(roasters.slug, input.slug), columns: { id: true } });
    if (!roaster) throw new TRPCError({ code: "NOT_FOUND" });
    const [rows, [summary]] = await Promise.all([
      ctx.db
        .select({
          id: roasterReviews.id,
          userId: roasterReviews.userId,
          rating: roasterReviews.rating,
          traceability: roasterReviews.traceability,
          shipping: roasterReviews.shipping,
          body: roasterReviews.body,
          notes: roasterReviews.notes,
          createdAt: roasterReviews.createdAt,
          user: { username: profiles.username, avatarUrl: profiles.avatarUrl },
        })
        .from(roasterReviews)
        .innerJoin(profiles, eq(profiles.id, roasterReviews.userId))
        .where(eq(roasterReviews.roasterId, roaster.id))
        .orderBy(desc(roasterReviews.createdAt), desc(roasterReviews.id))
        .limit(20),
      ctx.db
        .select({
          count: sql<number>`count(*)::int`,
          rating: sql<number | null>`round(avg(${roasterReviews.rating}), 1)::float`,
          traceability: sql<number | null>`round(avg(${roasterReviews.traceability}), 1)::float`,
          shipping: sql<number | null>`round(avg(${roasterReviews.shipping}), 1)::float`,
        })
        .from(roasterReviews)
        .where(eq(roasterReviews.roasterId, roaster.id)),
    ]);
    const verified = await verifiedBuyers(ctx.db, roaster.id, rows.map((r) => r.userId));
    return {
      summary: summary!,
      reviews: rows.map(({ userId, ...r }) => ({ ...r, verifiedPurchase: verified.has(userId) })),
    };
  }),

  /** Your review of this roaster (to edit it), or null. */
  mine: protectedProcedure.input(z.object({ roasterId: z.uuid() })).query(async ({ ctx, input }) => {
    return (
      (await ctx.db.query.roasterReviews.findFirst({
        where: and(eq(roasterReviews.userId, ctx.user.id), eq(roasterReviews.roasterId, input.roasterId)),
      })) ?? null
    );
  }),

  /** Post or edit your review. A roaster's own team can't review it. */
  upsert: limitedProcedure("roaster-review", 20)
    .input(RoasterReviewInput)
    .mutation(async ({ ctx, input }) => {
      const roaster = await ctx.db.query.roasters.findFirst({ where: and(eq(roasters.id, input.roasterId), eq(roasters.isActive, true)), columns: { id: true } });
      if (!roaster) throw new TRPCError({ code: "NOT_FOUND", message: "That roaster isn't on PropperBrew." });
      const member = await ctx.db.query.roasterMembers.findFirst({
        where: and(eq(roasterMembers.roasterId, input.roasterId), eq(roasterMembers.userId, ctx.user.id)),
        columns: { role: true },
      });
      if (member) throw new TRPCError({ code: "FORBIDDEN", message: "You can't review a roaster you're part of." });

      const values = {
        rating: input.rating,
        traceability: input.traceability ?? null,
        shipping: input.shipping ?? null,
        body: input.body ?? null,
        notes: [...new Set(input.notes)],
      };
      const [review] = await ctx.db
        .insert(roasterReviews)
        .values({ userId: ctx.user.id, roasterId: input.roasterId, ...values })
        .onConflictDoUpdate({ target: [roasterReviews.userId, roasterReviews.roasterId], set: { ...values, updatedAt: new Date() } })
        .returning();
      return review!;
    }),
});
