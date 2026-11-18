import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { coffeeBeans, roasters, shopifyVariants, subscriptions, type Db } from "@propperbrew/db";
import { shippingFor, StartSubscriptionInput } from "@propperbrew/shared";
import { env } from "../../env";
import { findVariant, purchasable } from "../../payments/basket";
import { requireStripe, stripe } from "../../payments/stripe";
import { limitedProcedure, protectedProcedure, router } from "../init";

async function emailOf(db: Db, user: { id: string; email?: string }) {
  if (user.email) return user.email;
  const [row] = await db.execute<{ email: string | null }>(sql`select email from auth.users where id = ${user.id}`);
  if (!row?.email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add an email address to your account to subscribe." });
  return row.email;
}

async function findOwn(db: Db, userId: string, id: string) {
  const sub = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)) });
  if (!sub?.stripeSubscriptionId) throw new TRPCError({ code: "NOT_FOUND" });
  return sub as typeof sub & { stripeSubscriptionId: string };
}

export const subscriptionsRouter = router({
  /**
   * Subscribe to a coffee: a Stripe Checkout Session in subscription mode, billed every 2 or 4
   * weeks at today's price and the roaster's delivery charge. Each paid invoice is a delivery.
   */
  start: limitedProcedure("subscribe", 10)
    .input(StartSubscriptionInput)
    .mutation(async ({ ctx, input }) => {
      if (!stripe) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Subscriptions aren't available right now." });
      const variant = await findVariant(ctx.db, input.variantId);
      if (!variant || !purchasable(variant)) throw new TRPCError({ code: "BAD_REQUEST", message: "This coffee can't be subscribed to right now." });
      const subtotal = variant.unitPricePence * input.quantity;
      const shippingPence = shippingFor(subtotal, variant.roaster);
      const email = await emailOf(ctx.db, ctx.user);
      const title = `${variant.bean.name} · ${variant.variantTitle}`;

      const [sub] = await ctx.db
        .insert(subscriptions)
        .values({
          userId: ctx.user.id,
          roasterId: variant.roaster.id,
          shopifyVariantRowId: variant.variantId,
          title,
          quantity: input.quantity,
          intervalWeeks: input.intervalWeeks,
          unitPricePence: variant.unitPricePence,
          shippingPence,
          email,
          shippingAddress: input.address,
        })
        .returning({ id: subscriptions.id });
      const recurring = { interval: "week" as const, interval_count: input.intervalWeeks };
      const back =
        input.client === "app"
          ? { success: `${env.PUBLIC_API_URL}/checkout/return?status=paid`, cancel: `${env.PUBLIC_API_URL}/checkout/return?status=cancelled` }
          : { success: `${env.PUBLIC_WEB_URL}/subscriptions?started=${sub!.id}`, cancel: `${env.PUBLIC_WEB_URL}/subscriptions` };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer_email: email,
          client_reference_id: sub!.id,
          metadata: { subscriptionId: sub!.id },
          subscription_data: { metadata: { subscriptionId: sub!.id } },
          line_items: [
            {
              quantity: input.quantity,
              price_data: {
                currency: "gbp",
                unit_amount: variant.unitPricePence,
                recurring,
                product_data: { name: variant.bean.name, description: `${variant.roaster.name} · ${variant.variantTitle}` },
              },
            },
            ...(shippingPence > 0
              ? [{ quantity: 1, price_data: { currency: "gbp", unit_amount: shippingPence, recurring, product_data: { name: `Delivery from ${variant.roaster.name}` } } }]
              : []),
          ],
          success_url: back.success,
          cancel_url: back.cancel,
        },
        { idempotencyKey: `subscription-${sub!.id}` },
      );
      await ctx.db.update(subscriptions).set({ stripeSessionId: session.id }).where(eq(subscriptions.id, sub!.id));
      return { subscriptionId: sub!.id, url: session.url! };
    }),

  /** Your subscriptions (ones you've paid for), newest first. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        sub: subscriptions,
        roaster: { slug: roasters.slug, name: roasters.name },
        bean: { slug: coffeeBeans.slug, name: coffeeBeans.name, imageUrl: coffeeBeans.imageUrl },
      })
      .from(subscriptions)
      .innerJoin(roasters, eq(roasters.id, subscriptions.roasterId))
      .innerJoin(shopifyVariants, eq(shopifyVariants.id, subscriptions.shopifyVariantRowId))
      .innerJoin(coffeeBeans, eq(coffeeBeans.id, shopifyVariants.coffeeBeanId))
      .where(and(eq(subscriptions.userId, ctx.user.id), sql`${subscriptions.status} <> 'pending'`))
      .orderBy(desc(subscriptions.createdAt));
    return rows.map(({ sub, roaster, bean }) => ({
      id: sub.id,
      status: sub.status,
      title: sub.title,
      quantity: sub.quantity,
      intervalWeeks: sub.intervalWeeks,
      pricePence: sub.unitPricePence * sub.quantity + sub.shippingPence,
      nextDeliveryAt: sub.nextDeliveryAt,
      createdAt: sub.createdAt,
      roaster,
      bean,
    }));
  }),

  /** Pause deliveries (nothing is charged while paused). */
  pause: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const sub = await findOwn(ctx.db, ctx.user.id, input.id);
    if (sub.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Only an active subscription can be paused." });
    await requireStripe().subscriptions.update(sub.stripeSubscriptionId, { pause_collection: { behavior: "void" } });
    await ctx.db.update(subscriptions).set({ status: "paused", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    return { status: "paused" as const };
  }),

  resume: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const sub = await findOwn(ctx.db, ctx.user.id, input.id);
    if (sub.status !== "paused") throw new TRPCError({ code: "BAD_REQUEST", message: "Only a paused subscription can be resumed." });
    await requireStripe().subscriptions.update(sub.stripeSubscriptionId, { pause_collection: "" });
    await ctx.db.update(subscriptions).set({ status: "active", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    return { status: "active" as const };
  }),

  /** Stop for good. Deliveries already paid for still arrive. */
  cancel: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const sub = await findOwn(ctx.db, ctx.user.id, input.id);
    if (sub.status === "cancelled") return { status: "cancelled" as const };
    await requireStripe().subscriptions.cancel(sub.stripeSubscriptionId);
    await ctx.db.update(subscriptions).set({ status: "cancelled", nextDeliveryAt: null, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    return { status: "cancelled" as const };
  }),
});
