import { eq } from "drizzle-orm";
import { z } from "zod";
import { profiles } from "@propperbrew/db";
import { BrewMethod } from "@propperbrew/shared";
import { protectedProcedure, router } from "../init";

export const meRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.profiles.findFirst({ where: eq(profiles.id, ctx.user.id) }),
  ),

  update: protectedProcedure
    .input(
      z.object({
        displayName: z.string().trim().max(60).optional(),
        defaultGrinder: z.string().trim().max(80).nullable().optional(),
        defaultBrewMethod: BrewMethod.nullable().optional(),
        expoPushToken: z.string().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [profile] = await ctx.db.update(profiles).set(input).where(eq(profiles.id, ctx.user.id)).returning();
      return profile;
    }),
});
