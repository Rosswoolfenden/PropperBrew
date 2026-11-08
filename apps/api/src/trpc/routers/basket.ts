import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { basketItems } from "@propperbrew/db";
import { BasketQuantityInput, MAX_ORDER_QUANTITY } from "@propperbrew/shared";
import { basketRow, findVariant, loadBasket, purchasable, type Basket } from "../../payments/basket";
import { checkoutEnabled } from "../../payments/stripe";
import { protectedProcedure, publicProcedure, router } from "../init";

/** The basket without what only the server needs (roasters' Stripe accounts and commission). */
const toPublic = (basket: Basket) => ({
  ...basket,
  groups: basket.groups.map(({ roaster: { stripeAccountId: _a, commissionBps: _c, ...roaster }, ...group }) => ({ ...group, roaster })),
});

export const basketRouter = router({
  /** Whether coffees can be bought here at all (Stripe is configured). */
  enabled: publicProcedure.query(() => checkoutEnabled),

  get: protectedProcedure.query(async ({ ctx }) => toPublic(await loadBasket(ctx.db, ctx.user.id))),

  /** Add some of a coffee (to what's already there, up to the limit). */
  add: protectedProcedure.input(BasketQuantityInput.refine((i) => i.quantity > 0)).mutation(async ({ ctx, input }) => {
    const variant = await findVariant(ctx.db, input.variantId);
    if (!variant || !purchasable(variant)) throw new TRPCError({ code: "BAD_REQUEST", message: "This coffee can't be bought here right now." });
    await ctx.db
      .insert(basketItems)
      .values({ userId: ctx.user.id, shopifyVariantRowId: input.variantId, quantity: input.quantity })
      .onConflictDoUpdate({
        target: [basketItems.userId, basketItems.shopifyVariantRowId],
        set: { quantity: sql`least(${basketItems.quantity} + ${input.quantity}, ${MAX_ORDER_QUANTITY})`, updatedAt: new Date() },
      });
    return toPublic(await loadBasket(ctx.db, ctx.user.id));
  }),

  /** Set how many; 0 takes it out. */
  setQuantity: protectedProcedure.input(BasketQuantityInput).mutation(async ({ ctx, input }) => {
    const where = basketRow(ctx.user.id, input.variantId);
    if (input.quantity === 0) await ctx.db.delete(basketItems).where(where);
    else await ctx.db.update(basketItems).set({ quantity: input.quantity, updatedAt: new Date() }).where(where);
    return toPublic(await loadBasket(ctx.db, ctx.user.id));
  }),
});
