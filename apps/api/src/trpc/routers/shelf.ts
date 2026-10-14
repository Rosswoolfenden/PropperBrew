import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { shelfEntries } from "@propperbrew/db";
import { ShelfEntryInput, restState, restWindowDays } from "@propperbrew/shared";
import { protectedProcedure, router } from "../init";

export const shelfRouter = router({
  /** The user's current bags, with where each sits in its rest window. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const entries = await ctx.db.query.shelfEntries.findMany({
      where: and(eq(shelfEntries.userId, ctx.user.id), isNull(shelfEntries.finishedAt)),
      with: { bean: { columns: { id: true, name: true, slug: true, imageUrl: true, roastLevel: true } } },
      orderBy: desc(shelfEntries.createdAt),
    });
    return entries.map((e) => ({
      ...e,
      rest: e.roastDate ? restState(e.roastDate, restWindowDays({ roastLevel: e.bean.roastLevel })) : null,
    }));
  }),

  add: protectedProcedure.input(ShelfEntryInput).mutation(async ({ ctx, input }) => {
    const [entry] = await ctx.db
      .insert(shelfEntries)
      .values({
        userId: ctx.user.id,
        coffeeBeanId: input.coffeeBeanId,
        roastDate: input.roastDate ? new Date(input.roastDate) : null,
        openedDate: input.openedDate ? new Date(input.openedDate) : null,
      })
      .returning();
    return entry!;
  }),

  finish: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(shelfEntries)
      .set({ finishedAt: new Date() })
      .where(and(eq(shelfEntries.id, input.id), eq(shelfEntries.userId, ctx.user.id)));
  }),
});
