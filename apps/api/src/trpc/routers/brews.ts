import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { brewRecipes, brews, coffeeBeans, roasters, shelfEntries, type Db } from "@propperbrew/db";
import { BrewLogInput } from "@propperbrew/shared";
import { limitedProcedure, protectedProcedure, router } from "../init";

const PAGE = 30;

/** Input → columns. Doses are kept in decigrams, like recipes. */
function brewColumns(input: z.output<typeof BrewLogInput>) {
  return {
    coffeeBeanId: input.coffeeBeanId,
    shelfEntryId: input.shelfEntryId ?? null,
    recipeId: input.recipeId ?? null,
    brewMethod: input.brewMethod,
    coffeeDoseDg: Math.round(input.coffeeDoseG * 10),
    waterWeightG: Math.round(input.waterWeightG),
    waterTempC: input.waterTempC == null ? null : Math.round(input.waterTempC),
    grinderModel: input.grinderModel || null,
    grindSetting: input.grindSetting || null,
    totalBrewTimeSeconds: input.totalBrewTimeSeconds ?? null,
    rating: input.rating ?? null,
    notes: input.notes || null,
    ...(input.brewedAt && { brewedAt: input.brewedAt }),
  };
}

/** The bag and recipe it points at must exist, and the bag must be theirs and of this coffee. */
async function checkLinks(db: Db, userId: string, input: z.output<typeof BrewLogInput>) {
  const bean = await db.query.coffeeBeans.findFirst({ where: eq(coffeeBeans.id, input.coffeeBeanId), columns: { id: true } });
  if (!bean) throw new TRPCError({ code: "NOT_FOUND", message: "That coffee doesn't exist." });
  if (input.shelfEntryId) {
    const bag = await db.query.shelfEntries.findFirst({
      where: and(eq(shelfEntries.id, input.shelfEntryId), eq(shelfEntries.userId, userId), eq(shelfEntries.coffeeBeanId, input.coffeeBeanId)),
      columns: { id: true },
    });
    if (!bag) throw new TRPCError({ code: "BAD_REQUEST", message: "That bag isn't on your shelf." });
  }
  if (input.recipeId) {
    const recipe = await db.query.brewRecipes.findFirst({ where: eq(brewRecipes.id, input.recipeId), columns: { id: true } });
    if (!recipe) throw new TRPCError({ code: "BAD_REQUEST", message: "That recipe doesn't exist." });
  }
}

const toBrew = <T extends { coffeeDoseDg: number }>({ coffeeDoseDg, ...b }: T) => ({ ...b, coffeeDoseG: coffeeDoseDg / 10 });

async function findOwn(db: Db, userId: string, id: string) {
  const brew = await db.query.brews.findFirst({ where: and(eq(brews.id, id), eq(brews.userId, userId)) });
  if (!brew) throw new TRPCError({ code: "NOT_FOUND" });
  return brew;
}

export const brewsRouter = router({
  /** Your journal, newest first (optionally for one coffee), with a few numbers about it. */
  list: protectedProcedure
    .input(z.object({ coffeeBeanId: z.uuid().optional(), limit: z.number().int().min(1).max(100).default(PAGE) }).default({ limit: PAGE }))
    .query(async ({ ctx, input }) => {
      const mine = eq(brews.userId, ctx.user.id);
      const where = input.coffeeBeanId ? and(mine, eq(brews.coffeeBeanId, input.coffeeBeanId)) : mine;
      const [rows, [stats], [favourite]] = await Promise.all([
        ctx.db
          .select({
            brew: brews,
            bean: { slug: coffeeBeans.slug, name: coffeeBeans.name, imageUrl: coffeeBeans.imageUrl },
            roaster: { slug: roasters.slug, name: roasters.name },
          })
          .from(brews)
          .innerJoin(coffeeBeans, eq(coffeeBeans.id, brews.coffeeBeanId))
          .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
          .where(where)
          .orderBy(desc(brews.brewedAt), desc(brews.id))
          .limit(input.limit),
        ctx.db
          .select({
            total: sql<number>`count(*)::int`,
            thisWeek: sql<number>`(count(*) filter (where ${brews.brewedAt} >= now() - interval '7 days'))::int`,
            coffees: sql<number>`count(distinct ${brews.coffeeBeanId})::int`,
          })
          .from(brews)
          .where(where),
        ctx.db
          .select({ method: brews.brewMethod, n: sql<number>`count(*)::int` })
          .from(brews)
          .where(where)
          .groupBy(brews.brewMethod)
          .orderBy(desc(sql`count(*)`), brews.brewMethod)
          .limit(1),
      ]);
      return {
        brews: rows.map(({ brew, bean, roaster }) => ({ ...toBrew(brew), bean: { ...bean, roaster } })),
        stats: { ...stats!, favouriteMethod: favourite?.method ?? null },
      };
    }),

  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => toBrew(await findOwn(ctx.db, ctx.user.id, input.id))),

  /**
   * Where a new log for this coffee should start: their last brew of it, else the recipe they're
   * following, else nothing (the form's blank).
   */
  startingPoint: protectedProcedure
    .input(z.object({ coffeeBeanId: z.uuid(), recipeId: z.uuid().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.recipeId) {
        const recipe = await ctx.db.query.brewRecipes.findFirst({ where: eq(brewRecipes.id, input.recipeId) });
        if (recipe) {
          return {
            from: "recipe" as const,
            brewMethod: recipe.brewMethod,
            coffeeDoseG: recipe.coffeeDoseDg / 10,
            waterWeightG: recipe.waterWeightG,
            waterTempC: recipe.waterTempC,
            grinderModel: recipe.grinderModel,
            grindSetting: recipe.grindSetting,
            totalBrewTimeSeconds: recipe.totalBrewTimeSeconds,
          };
        }
      }
      const last = await ctx.db.query.brews.findFirst({
        where: and(eq(brews.userId, ctx.user.id), eq(brews.coffeeBeanId, input.coffeeBeanId)),
        orderBy: desc(brews.brewedAt),
      });
      if (!last) return null;
      return {
        from: "last" as const,
        brewMethod: last.brewMethod,
        coffeeDoseG: last.coffeeDoseDg / 10,
        waterWeightG: last.waterWeightG,
        waterTempC: last.waterTempC,
        grinderModel: last.grinderModel,
        grindSetting: last.grindSetting,
        totalBrewTimeSeconds: last.totalBrewTimeSeconds,
      };
    }),

  create: limitedProcedure("brew", 60)
    .input(BrewLogInput)
    .mutation(async ({ ctx, input }) => {
      await checkLinks(ctx.db, ctx.user.id, input);
      const [brew] = await ctx.db.insert(brews).values({ userId: ctx.user.id, ...brewColumns(input) }).returning();
      return toBrew(brew!);
    }),

  update: limitedProcedure("brew", 60)
    .input(BrewLogInput.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await findOwn(ctx.db, ctx.user.id, id);
      await checkLinks(ctx.db, ctx.user.id, input);
      const [brew] = await ctx.db
        .update(brews)
        .set({ ...brewColumns(input), updatedAt: new Date() })
        .where(and(eq(brews.id, id), eq(brews.userId, ctx.user.id)))
        .returning();
      return toBrew(brew!);
    }),

  delete: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await findOwn(ctx.db, ctx.user.id, input.id);
    await ctx.db.delete(brews).where(and(eq(brews.id, input.id), eq(brews.userId, ctx.user.id)));
    return { deleted: true };
  }),
});

