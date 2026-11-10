import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { brewRecipes, profiles, recipeVotes, reviews, roasterMembers, roasters, uploads } from "@propperbrew/db";
import { DELETE_ACCOUNT_PHRASE, UserProfileInput } from "@propperbrew/shared";
import { deleteAuthUser } from "../../lib/auth-admin";
import { assertOwnUpload } from "../../uploads/own";
import { keyOf, removeObject } from "../../uploads/store";
import { limitedProcedure, protectedProcedure, router } from "../init";
import { refreshBeanAggregates } from "./reviews";

export const meRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.profiles.findFirst({ where: eq(profiles.id, ctx.user.id) }),
  ),

  update: protectedProcedure
    .input(UserProfileInput.partial().extend({ expoPushToken: z.string().max(200).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.avatarUrl) {
        const current = await ctx.db.query.profiles.findFirst({ where: eq(profiles.id, ctx.user.id), columns: { avatarUrl: true } });
        if (input.avatarUrl !== current?.avatarUrl) await assertOwnUpload(ctx.db, ctx.user.id, input.avatarUrl, "avatar");
      }
      const [profile] = await ctx.db.update(profiles).set(input).where(eq(profiles.id, ctx.user.id)).returning();
      return profile;
    }),

  /**
   * Delete the account and what's theirs: profile, photos, reviews, recipes, votes, shelf and basket.
   * Orders stay (unlinked) for the roasters' records. Ratings and vote counts they contributed to
   * are updated. A roaster's only owner has to hand it over first.
   */
  deleteAccount: limitedProcedure("delete-account", 5)
    .input(z.object({ confirm: z.string().trim().toLowerCase().pipe(z.literal(DELETE_ACCOUNT_PHRASE)) }))
    .mutation(async ({ ctx }) => {
      const userId = ctx.user.id;
      const owned = await ctx.db
        .select({ name: roasters.name })
        .from(roasterMembers)
        .innerJoin(roasters, eq(roasters.id, roasterMembers.roasterId))
        .where(
          and(
            eq(roasterMembers.userId, userId),
            eq(roasterMembers.role, "owner"),
            sql`not exists (select 1 from ${roasterMembers} other
                where other.roaster_id = ${roasterMembers.roasterId} and other.role = 'owner' and other.user_id <> ${userId})`,
          ),
        );
      if (owned.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You're the only owner of ${owned.map((r) => r.name).join(" and ")}. Contact PropperBrew to hand it over or close it before deleting your account.`,
        });
      }

      const [reviewed, voted] = await Promise.all([
        ctx.db.select({ beanId: reviews.coffeeBeanId }).from(reviews).where(eq(reviews.userId, userId)),
        ctx.db
          .select({ recipeId: recipeVotes.recipeId })
          .from(recipeVotes)
          .innerJoin(brewRecipes, eq(brewRecipes.id, recipeVotes.recipeId))
          // Their own recipes go with them; only other people's need recounting.
          .where(and(eq(recipeVotes.userId, userId), sql`${brewRecipes.userId} is distinct from ${userId}`)),
      ]);

      const photos = await ctx.db.select({ url: uploads.url }).from(uploads).where(eq(uploads.userId, userId));
      await deleteAuthUser(userId);
      // Their photos go too (the rows went with the profile).
      for (const { url } of photos) {
        const key = keyOf(url);
        if (key) await removeObject(key).catch((err) => console.error(`Couldn't remove ${key}:`, err));
      }

      for (const { beanId } of reviewed) await refreshBeanAggregates(ctx.db, beanId);
      if (voted.length > 0) {
        // One vote each, so take one off (as toggleUpvote does) rather than recounting.
        await ctx.db
          .update(brewRecipes)
          .set({ upvotesCount: sql`greatest(${brewRecipes.upvotesCount} - 1, 0)` })
          .where(inArray(brewRecipes.id, voted.map((v) => v.recipeId)));
      }
      return { deleted: true };
    }),
});
