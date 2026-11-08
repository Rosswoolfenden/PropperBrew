"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { formatGbp } from "@propperbrew/shared";
import { useTRPC } from "@/app/providers";

const arrival = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const ORDER_STATUS: Record<string, string> = {
  pending_payment: "Waiting for payment",
  paid: "Paid, on its way to the roaster",
  pushed_to_shopify: "With the roaster",
  fulfilled: "Posted",
  partially_fulfilled: "Partly posted",
  refunded: "Refunded",
  failed: "Not paid",
};

/** Stitch Order Confirmation. Until Stripe confirms the payment, it checks every couple of seconds. */
export function OrderConfirmation({ checkoutId }: { checkoutId: string }) {
  const trpc = useTRPC();
  const valid = /^[0-9a-f-]{36}$/i.test(checkoutId);
  const order = useQuery({
    ...trpc.orders.get.queryOptions({ checkoutId }),
    enabled: valid,
    retry: (n, err) => err.data?.code !== "NOT_FOUND" && n < 2,
    refetchInterval: (q) => (q.state.data?.status === "open" ? 2000 : false),
  });

  if (!valid || order.error?.data?.code === "NOT_FOUND" || order.error?.data?.code === "BAD_REQUEST") {
    return <p className="note">We can&apos;t find that order.</p>;
  }
  if (order.isPending) return <p className="muted">Loading your order…</p>;
  if (order.error) return <p className="alert alert-error">We couldn&apos;t load your order. Refresh to try again.</p>;
  const o = order.data;

  const headline =
    o.status === "paid"
      ? { title: "Your brew is on its way.", body: "Thank you. Your order has gone to the roaster, who'll post it to you." }
      : o.status === "open"
        ? { title: "Confirming your payment…", body: "This usually takes a few seconds." }
        : { title: "This order wasn't paid.", body: "Nothing was charged. Your coffees are still in your basket." };

  return (
    <div className="confirmation">
      <section className="confirmation-head">
        <div className={`confirmation-badge ${o.status}`} aria-hidden="true">
          {o.status === "paid" ? "✓" : o.status === "open" ? "…" : "!"}
        </div>
        <h1 className="display">{headline.title}</h1>
        <p className="profile-bio" role="status">
          {headline.body}
        </p>
      </section>

      <dl className="confirmation-card">
        <div>
          <dt className="eyebrow">Order reference</dt>
          <dd>{o.reference}</dd>
        </div>
        {o.arrivesBy && (
          <div>
            <dt className="eyebrow">Arrives by</dt>
            <dd>{arrival.format(o.arrivesBy)}</dd>
          </div>
        )}
      </dl>

      <section className="manifest" aria-label="What you ordered">
        <span className="eyebrow">What you ordered</span>
        {o.orders.map((r) => (
          <div key={r.id} className="manifest-group">
            <div className="manifest-roaster">
              <Link href={`/${r.roaster.slug}`}>{r.roaster.name}</Link>
              {o.status === "paid" && <span className="muted">{ORDER_STATUS[r.status]}</span>}
            </div>
            <ul>
              {r.lines.map((l) => (
                <li key={l.title}>
                  <span>{l.title}</span>
                  <span aria-label={`Quantity ${l.quantity}`}>{l.quantity}</span>
                </li>
              ))}
              <li className="muted">
                <span>Delivery</span>
                <span>{r.shippingPence === 0 ? "Free" : formatGbp(r.shippingPence)}</span>
              </li>
            </ul>
          </div>
        ))}
        <div className="manifest-total">
          <span className="eyebrow">Total</span>
          <span>{formatGbp(o.totalPence)}</span>
        </div>
        <p className="muted">
          To {o.address.name}, {[o.address.line1, o.address.line2, o.address.city, o.address.postcode].filter(Boolean).join(", ")}. Receipt sent to {o.email}.
        </p>
      </section>

      <div className="confirmation-actions">
        <Link href="/" className="button">
          Back to explore
        </Link>
        {o.status === "expired" ? (
          <Link href="/basket" className="rule-link">
            Go to your basket
          </Link>
        ) : (
          <Link href="/orders" className="rule-link">
            All your orders
          </Link>
        )}
      </div>
    </div>
  );
}
