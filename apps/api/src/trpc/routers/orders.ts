import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { checkouts, orderLines, orders, roasters, type Db } from "@propperbrew/db";
import { addWorkingDays, DELIVERY_WORKING_DAYS, orderReference, platformFee, StartCheckoutInput } from "@propperbrew/shared";
import { env } from "../../env";
import { loadBasket } from "../../payments/basket";
import { markCheckoutExpired, markCheckoutPaid } from "../../payments/fulfil";
import { requireStripe, stripe } from "../../payments/stripe";
import { limitedProcedure, protectedProcedure, router } from "../init";

/** The email Stripe receipts and Shopify shipping updates go to: the account's. */
async function emailOf(db: Db, user: { id: string; email?: string }) {
  if (user.email) return user.email;
  const [row] = await db.execute<{ email: string | null }>(sql`select email from auth.users where id = ${user.id}`);
  if (!row?.email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add an email address to your account to order." });
  return row.email;
}

/** Stripe only shows product photos it can fetch over https. */
const httpsImage = (url: string | null) => (url?.startsWith("https://") ? [url] : undefined);

export const ordersRouter = router({
  /**
   * Turn the basket into an order per roaster, and a Stripe Checkout Session to pay for them all.
   * Prices are read again here; nothing the client sends is trusted except the address.
   */
  start: limitedProcedure("checkout", 20).input(StartCheckoutInput).mutation(async ({ ctx, input }) => {
    if (!stripe) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkout isn't available right now." });
    const basket = await loadBasket(ctx.db, ctx.user.id);
    if (basket.hasUnavailable) {
      throw new TRPCError({ code: "CONFLICT", message: "Some coffees in your basket can't be bought right now. Remove them to continue." });
    }
    if (basket.count === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Your basket is empty." });
    const email = await emailOf(ctx.db, ctx.user);

    const checkoutId = await ctx.db.transaction(async (tx) => {
      const [checkout] = await tx
        .insert(checkouts)
        .values({ userId: ctx.user.id, totalPence: basket.totalPence, email, shippingAddress: input.address })
        .returning({ id: checkouts.id });
      for (const group of basket.groups) {
        const [order] = await tx
          .insert(orders)
          .values({
            checkoutId: checkout!.id,
            userId: ctx.user.id,
            roasterId: group.roaster.id,
            subtotalPence: group.subtotalPence,
            shippingPence: group.shippingPence,
            platformFeePence: platformFee(group.subtotalPence, group.roaster.commissionBps),
            shippingAddress: input.address,
          })
          .returning({ id: orders.id });
        await tx.insert(orderLines).values(
          group.items.map((i) => ({
            orderId: order!.id,
            shopifyVariantRowId: i.variantId,
            quantity: i.quantity,
            unitPricePence: i.unitPricePence,
            title: `${i.bean.name} · ${i.variantTitle}`,
          })),
        );
      }
      return checkout!.id;
    });

    const back =
      input.client === "app"
        ? { success: `${env.PUBLIC_API_URL}/checkout/return?status=paid`, cancel: `${env.PUBLIC_API_URL}/checkout/return?status=cancelled` }
        : { success: `${env.PUBLIC_WEB_URL}/orders/${checkoutId}`, cancel: `${env.PUBLIC_WEB_URL}/basket` };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        currency: "gbp",
        customer_email: email,
        client_reference_id: checkoutId,
        metadata: { checkoutId },
        payment_intent_data: { transfer_group: checkoutId, metadata: { checkoutId } },
        line_items: basket.groups.flatMap((group) => [
          ...group.items.map((i) => ({
            quantity: i.quantity,
            price_data: {
              currency: "gbp",
              unit_amount: i.unitPricePence,
              product_data: { name: i.bean.name, description: `${group.roaster.name} · ${i.variantTitle}`, images: httpsImage(i.bean.imageUrl) },
            },
          })),
          ...(group.shippingPence > 0
            ? [{ quantity: 1, price_data: { currency: "gbp", unit_amount: group.shippingPence, product_data: { name: `Delivery from ${group.roaster.name}` } } }]
            : []),
        ]),
        success_url: back.success,
        cancel_url: back.cancel,
      },
      { idempotencyKey: `checkout-${checkoutId}` },
    );
    await ctx.db.update(checkouts).set({ stripeSessionId: session.id }).where(eq(checkouts.id, checkoutId));
    return { checkoutId, url: session.url! };
  }),

  /** One checkout, for its confirmation page. Yours only. */
  get: protectedProcedure.input(z.object({ checkoutId: z.uuid() })).query(async ({ ctx, input }) => {
    const find = () => ctx.db.query.checkouts.findFirst({ where: and(eq(checkouts.id, input.checkoutId), eq(checkouts.userId, ctx.user.id)) });
    let checkout = await find();
    if (!checkout) throw new TRPCError({ code: "NOT_FOUND" });

    // Back from paying before Stripe's webhook arrived: ask Stripe directly.
    if (checkout.status === "open" && checkout.stripeSessionId) {
      const session = await requireStripe().checkout.sessions.retrieve(checkout.stripeSessionId);
      if (session.payment_status === "paid") {
        await markCheckoutPaid(ctx.db, checkout.id, { paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null) });
      } else if (session.status === "expired") {
        await markCheckoutExpired(ctx.db, checkout.id);
      }
      checkout = (await find())!;
    }

    const rows = await ctx.db
      .select({ order: orders, roaster: { slug: roasters.slug, name: roasters.name } })
      .from(orders)
      .innerJoin(roasters, eq(roasters.id, orders.roasterId))
      .where(eq(orders.checkoutId, checkout.id))
      .orderBy(asc(orders.createdAt), asc(orders.id));
    const lines = await ctx.db
      .select({ orderId: orderLines.orderId, title: orderLines.title, quantity: orderLines.quantity, unitPricePence: orderLines.unitPricePence })
      .from(orderLines)
      .where(inArray(orderLines.orderId, rows.map((r) => r.order.id)))
      .orderBy(asc(orderLines.title));

    return {
      id: checkout.id,
      reference: orderReference(checkout.id),
      status: checkout.status,
      createdAt: checkout.createdAt,
      paidAt: checkout.paidAt,
      arrivesBy: checkout.paidAt ? addWorkingDays(checkout.paidAt, DELIVERY_WORKING_DAYS) : null,
      email: checkout.email,
      address: checkout.shippingAddress,
      totalPence: checkout.totalPence,
      orders: rows.map(({ order, roaster }) => ({
        id: order.id,
        roaster,
        status: order.status,
        subtotalPence: order.subtotalPence,
        shippingPence: order.shippingPence,
        shopifyOrderName: order.shopifyOrderName,
        lines: lines.filter((l) => l.orderId === order.id).map(({ orderId: _o, ...l }) => l),
      })),
    };
  }),

  /** Your paid orders, newest first. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: checkouts.id,
        status: checkouts.status,
        totalPence: checkouts.totalPence,
        createdAt: checkouts.createdAt,
        roasters: sql<string[]>`array_agg(distinct ${roasters.name} order by ${roasters.name})`,
        items: sql<number>`(select coalesce(sum(l.quantity), 0)::int from ${orderLines} l join ${orders} o on o.id = l.order_id where o.checkout_id = ${checkouts.id})`,
      })
      .from(checkouts)
      .innerJoin(orders, eq(orders.checkoutId, checkouts.id))
      .innerJoin(roasters, eq(roasters.id, orders.roasterId))
      .where(and(eq(checkouts.userId, ctx.user.id), eq(checkouts.status, "paid")))
      .groupBy(checkouts.id)
      .orderBy(desc(checkouts.createdAt))
      .limit(50);
    return rows.map((r) => ({ ...r, reference: orderReference(r.id) }));
  }),
});
