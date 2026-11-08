"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { formatGbp, humanize, MAX_ORDER_QUANTITY, notesSentence } from "@propperbrew/shared";
import { useTRPC } from "@/app/providers";
import type { RouterOutputs } from "@/lib/trpc";

export type Basket = RouterOutputs["basket"]["get"];
type Item = Basket["groups"][number]["items"][number];

/** "Add £6.50 more from Hackney Heights for free delivery", while it's within reach. */
export function freeDeliveryNudge(group: Basket["groups"][number]) {
  const threshold = group.roaster.freeShippingThresholdPence;
  if (threshold === null || group.shippingPence === 0 || group.subtotalPence === 0) return null;
  return `Add ${formatGbp(threshold - group.subtotalPence)} more from ${group.roaster.name} for free delivery.`;
}

export function BasketView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const basket = useQuery(trpc.basket.get.queryOptions());
  const setQuantity = useMutation(
    trpc.basket.setQuantity.mutationOptions({ onSuccess: (data) => queryClient.setQueryData(trpc.basket.get.queryKey(), data) }),
  );

  if (basket.isPending) return <p className="muted">Loading your basket…</p>;
  if (basket.error) return <p className="alert alert-error">We couldn&apos;t load your basket. Refresh to try again.</p>;
  const b = basket.data;
  if (b.groups.length === 0) {
    return (
      <div className="review-cta">
        <p className="note">Your basket is empty.</p>
        <Link href="/search" className="button">
          Find a coffee
        </Link>
      </div>
    );
  }

  const stepper = (item: Item) => (
    <div className="basket-actions">
      <div className="stepper stepper-sm" role="group" aria-label={`Quantity of ${item.bean.name}`}>
        <button
          type="button"
          aria-label="Fewer"
          disabled={item.quantity <= 1 || setQuantity.isPending}
          onClick={() => setQuantity.mutate({ variantId: item.variantId, quantity: item.quantity - 1 })}
        >
          −
        </button>
        <output aria-live="polite">{String(item.quantity).padStart(2, "0")}</output>
        <button
          type="button"
          aria-label="More"
          disabled={item.quantity >= MAX_ORDER_QUANTITY || !item.available || setQuantity.isPending}
          onClick={() => setQuantity.mutate({ variantId: item.variantId, quantity: item.quantity + 1 })}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="text-button"
        aria-label={`Remove ${item.bean.name}`}
        disabled={setQuantity.isPending}
        onClick={() => setQuantity.mutate({ variantId: item.variantId, quantity: 0 })}
      >
        Remove
      </button>
    </div>
  );

  return (
    <div className="basket">
      <div className="basket-groups">
        {b.groups.map((group) => (
          <section key={group.roaster.id} className="basket-group" aria-label={`From ${group.roaster.name}`}>
            <h2>
              From <Link href={`/${group.roaster.slug}`}>{group.roaster.name}</Link>
            </h2>
            <ul className="basket-items">
              {group.items.map((item) => (
                <li key={item.variantId} className={`basket-item${item.available ? "" : " unavailable"}`}>
                  <Link href={`/${group.roaster.slug}/${item.bean.slug}`} className="frame frame-contain basket-photo" tabIndex={-1} aria-hidden="true">
                    {item.bean.imageUrl && <img src={item.bean.imageUrl} alt="" />}
                  </Link>
                  <div className="basket-detail">
                    <div className="basket-line">
                      {item.bean.originCountry ? <span className="chip chip-sm">{item.bean.originCountry}</span> : <span />}
                      <span className="basket-price">{formatGbp(item.unitPricePence * item.quantity)}</span>
                    </div>
                    <h3>
                      <Link href={`/${group.roaster.slug}/${item.bean.slug}`}>{item.bean.name}</Link>
                    </h3>
                    <p className="eyebrow">
                      {[item.variantTitle, item.bean.roastLevel && `${humanize(item.bean.roastLevel)} roast`].filter(Boolean).join(" · ")}
                    </p>
                    {item.bean.tastingNotes.length > 0 && <p className="muted">{notesSentence(item.bean.tastingNotes)}</p>}
                    {!item.available && (
                      <p className="alert alert-error" role="alert">
                        No longer available. Remove it to check out.
                      </p>
                    )}
                    {stepper(item)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside className="summary" aria-label="Order summary">
        <h2>Order Summary</h2>
        <dl className="summary-lines">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatGbp(b.subtotalPence)}</dd>
          </div>
          {b.groups.map((g) =>
            g.subtotalPence > 0 ? (
              <div key={g.roaster.id}>
                <dt>Delivery from {g.roaster.name}</dt>
                <dd>{g.shippingPence === 0 ? "Free" : formatGbp(g.shippingPence)}</dd>
              </div>
            ) : null,
          )}
          <div className="summary-total">
            <dt>Total</dt>
            <dd>{formatGbp(b.totalPence)}</dd>
          </div>
        </dl>
        <p className="muted summary-vat">Prices include VAT.</p>
        {b.hasUnavailable || b.count === 0 ? (
          <button type="button" className="button" disabled>
            Proceed to checkout
          </button>
        ) : (
          <Link href="/checkout" className="button">
            Proceed to checkout
          </Link>
        )}
        <Link href="/search" className="button button-secondary">
          Continue browsing
        </Link>
        {b.groups.map(freeDeliveryNudge).filter(Boolean).map((nudge) => (
          <p key={nudge} className="nudge">
            {nudge}
          </p>
        ))}
      </aside>
    </div>
  );
}
