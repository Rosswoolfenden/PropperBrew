import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { basketItems, checkouts, orderLines, orders, roasters, shopifyVariants, type Db } from "@propperbrew/db";
import { orderReference } from "@propperbrew/shared";
import { createShopifyOrder } from "../shopify/orders";
import { requireStripe } from "./stripe";

/** Give up on paying a roaster or creating their Shopify order after this many tries (then it needs a person). */
export const MAX_ATTEMPTS = 5;

/**
 * Stripe says the checkout is paid. Safe to call more than once (webhook retries, the order page
 * checking in): only the first call changes anything.
 */
export async function markCheckoutPaid(db: Db, checkoutId: string, payment: { paymentIntentId: string | null }) {
  const current = await db.query.checkouts.findFirst({ where: eq(checkouts.id, checkoutId), columns: { status: true } });
  if (current?.status !== "open") return;
  const chargeId = payment.paymentIntentId
    ? await requireStripe()
        .paymentIntents.retrieve(payment.paymentIntentId)
        .then((pi) => (typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null)))
    : null;

  const paid = await db.transaction(async (tx) => {
    const [checkout] = await tx
      .update(checkouts)
      .set({ status: "paid", paidAt: new Date(), stripePaymentIntentId: payment.paymentIntentId, stripeChargeId: chargeId, updatedAt: new Date() })
      .where(and(eq(checkouts.id, checkoutId), eq(checkouts.status, "open")))
      .returning();
    if (!checkout) return null;
    const paidOrders = await tx
      .update(orders)
      .set({ status: "paid", stripePaymentIntentId: payment.paymentIntentId, updatedAt: new Date() })
      .where(and(eq(orders.checkoutId, checkoutId), eq(orders.status, "pending_payment")))
      .returning({ id: orders.id });
    // What they bought leaves their basket (anything they added since stays).
    const bought = await tx
      .select({ variantId: orderLines.shopifyVariantRowId })
      .from(orderLines)
      .where(inArray(orderLines.orderId, paidOrders.map((o) => o.id)));
    if (checkout.userId && bought.length > 0) {
      await tx.delete(basketItems).where(and(eq(basketItems.userId, checkout.userId), inArray(basketItems.shopifyVariantRowId, bought.map((b) => b.variantId))));
    }
    return checkout;
  });
  if (paid) await fulfilCheckout(db, checkoutId);
}

/** They never paid (Stripe expired the session): nothing will be sent. */
export async function markCheckoutExpired(db: Db, checkoutId: string) {
  await db.transaction(async (tx) => {
    const [checkout] = await tx
      .update(checkouts)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(checkouts.id, checkoutId), eq(checkouts.status, "open")))
      .returning({ id: checkouts.id });
    if (checkout) await tx.update(orders).set({ status: "failed", updatedAt: new Date() }).where(eq(orders.checkoutId, checkoutId));
  });
}

/** Pay each roaster their share and create their Shopify order, for every paid order in the checkout. */
export async function fulfilCheckout(db: Db, checkoutId: string) {
  const pending = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.checkoutId, checkoutId), eq(orders.status, "paid")));
  for (const { id } of pending) await fulfilOrder(db, id);
}

async function fulfilOrder(db: Db, orderId: string) {
  const [row] = await db
    .select({ order: orders, checkout: checkouts, roaster: { stripeAccountId: roasters.stripeAccountId } })
    .from(orders)
    .innerJoin(checkouts, eq(checkouts.id, orders.checkoutId))
    .innerJoin(roasters, eq(roasters.id, orders.roasterId))
    .where(eq(orders.id, orderId));
  if (!row || row.order.status !== "paid") return;
  const { order, checkout, roaster } = row;
  const reference = orderReference(checkout.id);

  try {
    if (!order.stripeTransferId) {
      if (!roaster.stripeAccountId) throw new Error("The roaster has no Stripe account to pay");
      // Separate charges and transfers: the customer paid us once; each roaster gets their coffee
      // and delivery, less our commission. The idempotency key stops a retry paying twice.
      const transfer = await requireStripe().transfers.create(
        {
          amount: order.subtotalPence + order.shippingPence - order.platformFeePence,
          currency: "gbp",
          destination: roaster.stripeAccountId,
          transfer_group: checkout.id,
          ...(checkout.stripeChargeId && { source_transaction: checkout.stripeChargeId }),
          metadata: { orderId: order.id, reference },
        },
        { idempotencyKey: `transfer-${order.id}` },
      );
      await db.update(orders).set({ stripeTransferId: transfer.id, updatedAt: new Date() }).where(eq(orders.id, order.id));
    }

    const lines = await db
      .select({ shopifyVariantId: shopifyVariants.shopifyVariantId, quantity: orderLines.quantity, unitPricePence: orderLines.unitPricePence })
      .from(orderLines)
      .innerJoin(shopifyVariants, eq(shopifyVariants.id, orderLines.shopifyVariantRowId))
      .where(eq(orderLines.orderId, order.id));
    const shopifyOrder = await createShopifyOrder({
      roasterId: order.roasterId,
      reference,
      email: checkout.email,
      address: checkout.shippingAddress,
      lines,
      shippingPence: order.shippingPence,
      totalPence: order.subtotalPence + order.shippingPence,
    });
    await db
      .update(orders)
      .set({ status: "pushed_to_shopify", shopifyOrderId: shopifyOrder.id, shopifyOrderName: shopifyOrder.name, lastError: null, updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.status, "paid")));
  } catch (err) {
    console.error(`Order ${order.id} (${reference}) not sent yet:`, err);
    await db
      .update(orders)
      .set({ attempts: sql`${orders.attempts} + 1`, lastError: err instanceof Error ? err.message : String(err), updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  }
}

/**
 * Every minute: retry paid orders that didn't reach the roaster (Stripe or Shopify was down), and
 * expire checkouts nobody paid for (Stripe sessions last 24 hours).
 */
export function startOrderSweeper(db: Db, intervalMs = 60_000) {
  const run = async () => {
    try {
      const stuck = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.status, "paid"), lt(orders.attempts, MAX_ATTEMPTS), lt(orders.updatedAt, sql`now() - interval '30 seconds'`)));
      for (const { id } of stuck) await fulfilOrder(db, id);

      const stale = await db
        .select({ id: checkouts.id })
        .from(checkouts)
        .where(and(eq(checkouts.status, "open"), lt(checkouts.createdAt, sql`now() - interval '25 hours'`)));
      for (const { id } of stale) await markCheckoutExpired(db, id);
    } catch (err) {
      console.error("Order sweeper failed:", err);
    }
  };
  return setInterval(run, intervalMs);
}
