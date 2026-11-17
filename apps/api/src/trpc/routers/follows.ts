import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { coffeeBeans, notifications, roasterFollows, roasters, shopifyVariants } from "@propperbrew/db";
import { protectedProcedure, router } from "../init";

/** How far back "new from roasters you follow" looks. */
const NEW_DAYS = 30;

export const followsRouter = router({
  /** Follow or unfollow a roaster. */
  toggle: protectedProcedure.input(z.object({ roasterId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const roaster = await ctx.db.query.roasters.findFirst({ where: eq(roasters.id, input.roasterId), columns: { id: true } });
    if (!roaster) throw new TRPCError({ code: "NOT_FOUND" });
    const removed = await ctx.db
      .delete(roasterFollows)
      .where(and(eq(roasterFollows.userId, ctx.user.id), eq(roasterFollows.roasterId, input.roasterId)))
      .returning();
    if (removed.length === 0) await ctx.db.insert(roasterFollows).values({ userId: ctx.user.id, roasterId: input.roasterId });
    return { following: removed.length === 0 };
  }),

  /** Whether you follow a roaster, and how many people do. */
  status: protectedProcedure.input(z.object({ roasterId: z.uuid() })).query(async ({ ctx, input }) => {
    const mine = await ctx.db.query.roasterFollows.findFirst({
      where: and(eq(roasterFollows.userId, ctx.user.id), eq(roasterFollows.roasterId, input.roasterId)),
    });
    return { following: !!mine };
  }),

  /** The roasters you follow, and their coffees added lately (newest first) for Discover. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const followed = await ctx.db
      .select({ id: roasters.id, slug: roasters.slug, name: roasters.name, logoUrl: roasters.logoUrl })
      .from(roasterFollows)
      .innerJoin(roasters, eq(roasters.id, roasterFollows.roasterId))
      .where(eq(roasterFollows.userId, ctx.user.id))
      .orderBy(roasters.name);
    const ids = followed.map((r) => r.id);
    const fresh = ids.length
      ? await ctx.db
          .select({
            id: coffeeBeans.id,
            slug: coffeeBeans.slug,
            name: coffeeBeans.name,
            imageUrl: coffeeBeans.imageUrl,
            roastLevel: coffeeBeans.roastLevel,
            addedAt: coffeeBeans.createdAt,
            fromPricePence: sql<number | null>`min(${shopifyVariants.pricePence}) filter (where ${shopifyVariants.inStock})`,
            roaster: { slug: roasters.slug, name: roasters.name },
          })
          .from(coffeeBeans)
          .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
          .leftJoin(shopifyVariants, eq(shopifyVariants.coffeeBeanId, coffeeBeans.id))
          .where(and(inArray(coffeeBeans.roasterId, ids), eq(coffeeBeans.isArchived, false), gte(coffeeBeans.createdAt, sql`now() - make_interval(days => ${NEW_DAYS})`)))
          .groupBy(coffeeBeans.id, roasters.id)
          .orderBy(desc(coffeeBeans.createdAt))
          .limit(12)
      : [];
    return { roasters: followed, newCoffees: fresh.filter((c) => c.fromPricePence !== null) };
  }),
});

export const notificationsRouter = router({
  /** Your notifications, newest first, and how many you haven't seen. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const [items, [unread]] = await Promise.all([
      ctx.db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(50),
      ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))),
    ]);
    return { items: items.map(({ userId: _u, ...n }) => n), unread: unread!.n };
  }),

  /** Mark one (or, without an id, all) as read. */
  markRead: protectedProcedure.input(z.object({ id: z.uuid().optional() })).mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt), input.id ? eq(notifications.id, input.id) : undefined));
    return { ok: true };
  }),
});
