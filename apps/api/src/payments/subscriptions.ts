import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { checkouts, orderLines, orders, roasters, subscriptions, type Db } from "@propperbrew/db";
import { platformFee } from "@propperbrew/shared";
import { fulfilCheckout } from "./fulfil";
import { requireStripe } from "./stripe";

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

/** Stripe moved these between API versions; read whichever is there. */
function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  return idOf(legacy) ?? idOf(invoice.parent?.subscription_details?.subscription);
}
function periodEnd(sub: Stripe.Subscription) {
  const end = sub.items?.data?.[0]?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return end ? new Date(end * 1000) : null;
}
const statusOf = (sub: Stripe.Subscription) =>
  sub.status === "canceled" || sub.status === "incomplete_expired" ? "cancelled" : sub.pause_collection ? "paused" : "active";

/** Checkout finished: the subscription exists in Stripe now. */
export async function activateSubscription(db: Db, subscriptionId: string, session: Stripe.Checkout.Session) {
  const stripeSubscriptionId = idOf(session.subscription);
  if (!stripeSubscriptionId) return;
  const sub = await requireStripe().subscriptions.retrieve(stripeSubscriptionId);
  await db
    .update(subscriptions)
    .set({ stripeSubscriptionId, stripeCustomerId: idOf(session.customer), status: statusOf(sub), nextDeliveryAt: periodEnd(sub), updatedAt: new Date() })
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.status, "pending")));
}

/** Stripe's view of a subscription changed (paused, resumed, cancelled, renewed). */
export async function syncSubscription(db: Db, sub: Stripe.Subscription) {
  await db
    .update(subscriptions)
    .set({ status: statusOf(sub), nextDeliveryAt: periodEnd(sub), updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
}

/**
 * An invoice was paid: that's one delivery. It becomes a paid checkout with one order, which goes
 * the usual way (payout to the roaster, order into their Shopify). Each invoice only once.
 */
export async function deliverInvoice(db: Db, invoice: Stripe.Invoice) {
  const stripeSubscriptionId = invoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId || !invoice.id) return;
  const [row] = await db
    .select({ sub: subscriptions, commissionBps: roasters.commissionBps })
    .from(subscriptions)
    .innerJoin(roasters, eq(roasters.id, subscriptions.roasterId))
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
  if (!row) return;
  const { sub } = row;
  const subtotal = sub.unitPricePence * sub.quantity;
  const chargeId = idOf((invoice as unknown as { charge?: string | { id: string } | null }).charge);

  const checkoutId = await db.transaction(async (tx) => {
    const [checkout] = await tx
      .insert(checkouts)
      .values({
        userId: sub.userId,
        status: "paid",
        totalPence: subtotal + sub.shippingPence,
        email: sub.email,
        shippingAddress: sub.shippingAddress,
        subscriptionId: sub.id,
        stripeInvoiceId: invoice.id,
        stripeChargeId: chargeId,
        paidAt: new Date(),
      })
      .onConflictDoNothing({ target: checkouts.stripeInvoiceId })
      .returning({ id: checkouts.id });
    if (!checkout) return null;
    const [order] = await tx
      .insert(orders)
      .values({
        checkoutId: checkout.id,
        userId: sub.userId,
        roasterId: sub.roasterId,
        status: "paid",
        subtotalPence: subtotal,
        shippingPence: sub.shippingPence,
        platformFeePence: platformFee(subtotal, row.commissionBps),
        shippingAddress: sub.shippingAddress,
      })
      .returning({ id: orders.id });
    await tx.insert(orderLines).values({ orderId: order!.id, shopifyVariantRowId: sub.shopifyVariantRowId, quantity: sub.quantity, unitPricePence: sub.unitPricePence, title: sub.title });
    return checkout.id;
  });
  if (checkoutId) await fulfilCheckout(db, checkoutId);
}
