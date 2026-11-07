import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { coffeeBeans, profiles, roasterMembers } from "@propperbrew/db";
import { normalizeShopDomain, ratingFromDb } from "@propperbrew/shared";
import { connectToken } from "../../business/connect-token";
import { env } from "../../env";
import { protectedProcedure, router } from "../init";

export const businessRouter = router({
  /** The signed-in person's business side: the roasters they belong to, each with its coffees. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.query.profiles.findFirst({
      where: eq(profiles.id, ctx.user.id),
      columns: { username: true, accountType: true },
    });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

    const memberships = await ctx.db.query.roasterMembers.findMany({
      where: eq(roasterMembers.userId, ctx.user.id),
      columns: { role: true },
      with: {
        roaster: {
          columns: {
            id: true,
            slug: true,
            name: true,
            city: true,
            shopifyDomain: true,
            shopifyInstalledAt: true,
            shopifyUninstalledAt: true,
          },
        },
      },
    });
    const roasterIds = memberships.map((m) => m.roaster.id);
    const beans = roasterIds.length
      ? await ctx.db.query.coffeeBeans.findMany({
          where: inArray(coffeeBeans.roasterId, roasterIds),
          columns: { id: true, roasterId: true, slug: true, name: true, imageUrl: true, isArchived: true, avgRating: true, reviewCount: true },
          with: { variants: { columns: { pricePence: true, inStock: true } } },
          orderBy: (b, { asc }) => asc(b.name),
        })
      : [];

    return {
      email: ctx.user.email ?? null,
      username: profile.username,
      accountType: profile.accountType,
      roasters: memberships.map(({ role, roaster: { shopifyInstalledAt, shopifyUninstalledAt, ...roaster } }) => {
        const coffees = beans
          .filter((b) => b.roasterId === roaster.id)
          .map(({ variants, roasterId: _r, avgRating, ...b }) => {
            const inStock = variants.filter((v) => v.inStock).map((v) => v.pricePence);
            return {
              ...b,
              avgRating: avgRating === null ? null : ratingFromDb(avgRating),
              status: b.isArchived ? "archived" : inStock.length > 0 ? "in_stock" : "sold_out",
              fromPricePence: inStock.length > 0 ? Math.min(...inStock) : null,
            } as const;
          });
        return {
          ...roaster,
          role,
          shopify: {
            connected: !!shopifyInstalledAt && !shopifyUninstalledAt,
            connectedAt: shopifyUninstalledAt ? null : shopifyInstalledAt,
          },
          coffees,
          liveCount: coffees.filter((c) => c.status === "in_stock").length,
        };
      }),
    };
  }),

  /** Where to send a business account to connect its Shopify store (the install flow, linked to them). */
  connectShopifyUrl: protectedProcedure.input(z.object({ shop: z.string().trim().min(1).max(255) })).mutation(async ({ ctx, input }) => {
    const shop = normalizeShopDomain(input.shop);
    if (!shop) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Enter your store's myshopify.com address, e.g. your-store.myshopify.com" });
    }
    const profile = await ctx.db.query.profiles.findFirst({ where: eq(profiles.id, ctx.user.id), columns: { accountType: true } });
    if (profile?.accountType !== "business") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Use a business account to connect a store." });
    }
    const url = new URL("/api/shopify/auth", env.PUBLIC_API_URL);
    url.searchParams.set("shop", shop);
    url.searchParams.set("link", await connectToken(ctx.user.id));
    return { url: url.toString() };
  }),
});
