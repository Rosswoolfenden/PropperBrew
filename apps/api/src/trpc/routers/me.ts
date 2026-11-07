import { eq } from "drizzle-orm";
import { z } from "zod";
import { profiles } from "@propperbrew/db";
import { UserProfileInput } from "@propperbrew/shared";
import { protectedProcedure, router } from "../init";

export const meRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.profiles.findFirst({ where: eq(profiles.id, ctx.user.id) }),
  ),

  update: protectedProcedure
    .input(UserProfileInput.partial().extend({ expoPushToken: z.string().max(200).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [profile] = await ctx.db.update(profiles).set(input).where(eq(profiles.id, ctx.user.id)).returning();
      return profile;
    }),
});
