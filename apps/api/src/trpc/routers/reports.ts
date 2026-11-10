import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { brewRecipes, profiles, reports, reviews } from "@propperbrew/db";
import { ReportInput } from "@propperbrew/shared";
import { limitedProcedure, router } from "../init";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const reportsRouter = router({
  /** Report a review, recipe or profile. Reporting the same thing again updates the report. */
  create: limitedProcedure("report", 20)
    .input(ReportInput)
    .mutation(async ({ ctx, input }) => {
      // Who it's about, so people can't report their own things (and ids that don't exist are refused).
      const target =
        input.targetType === "profile"
          ? await ctx.db.query.profiles.findFirst({ where: eq(profiles.username, input.targetId), columns: { id: true } }).then((p) => p && { id: p.id, owner: p.id })
          : !UUID.test(input.targetId)
            ? undefined
            : input.targetType === "review"
              ? await ctx.db.query.reviews.findFirst({ where: eq(reviews.id, input.targetId), columns: { id: true, userId: true } }).then((r) => r && { id: r.id, owner: r.userId })
              : await ctx.db.query.brewRecipes.findFirst({ where: eq(brewRecipes.id, input.targetId), columns: { id: true, userId: true } }).then((r) => r && { id: r.id, owner: r.userId });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "That's no longer here." });
      if (target.owner === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't report your own posts." });

      await ctx.db
        .insert(reports)
        .values({ reporterId: ctx.user.id, targetType: input.targetType, targetId: target.id, reason: input.reason, note: input.note })
        .onConflictDoUpdate({
          target: [reports.reporterId, reports.targetType, reports.targetId],
          set: { reason: input.reason, note: input.note ?? null, status: "open", updatedAt: new Date() },
        });
      return { reported: true };
    }),
});
