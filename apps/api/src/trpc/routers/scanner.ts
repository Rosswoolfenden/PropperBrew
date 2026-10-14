import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { coffeeBeans, roasters } from "@propperbrew/db";
import { env } from "../../env";
import { readBagPhoto } from "../../enrichment/claude";
import { protectedProcedure, router } from "../init";

export const scannerRouter = router({
  /** Photo of a bag → best-matching beans. */
  scanBag: protectedProcedure
    .input(
      z.object({
        imageBase64: z.string().max(14_000_000),
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!env.ANTHROPIC_API_KEY) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Scanner not configured" });
      const read = await readBagPhoto(input.imageBase64, input.mediaType);
      if (!read.roasterName && !read.beanName) return { read, matches: [] };

      // Fuzzy match on roaster + bean name (pg_trgm).
      const roasterScore = read.roasterName ? sql`extensions.word_similarity(${read.roasterName}, ${roasters.name})` : sql`0`;
      const beanScore = read.beanName ? sql`extensions.word_similarity(${read.beanName}, ${coffeeBeans.name})` : sql`0`;
      const score = sql<number>`(${roasterScore} * 0.4 + ${beanScore} * 0.6)`;

      const matches = await ctx.db
        .select({
          id: coffeeBeans.id,
          slug: coffeeBeans.slug,
          name: coffeeBeans.name,
          imageUrl: coffeeBeans.imageUrl,
          isArchived: coffeeBeans.isArchived,
          roaster: { slug: roasters.slug, name: roasters.name },
          score,
        })
        .from(coffeeBeans)
        .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
        .where(sql`${score} > 0.3`)
        .orderBy(desc(score))
        .limit(5);

      return { read, matches };
    }),
});
