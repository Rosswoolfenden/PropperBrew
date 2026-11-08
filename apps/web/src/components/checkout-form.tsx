"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { formatGbp, ShippingAddress } from "@propperbrew/shared";
import { useTRPC } from "@/app/providers";

const FIELDS = [
  { key: "name", label: "Full name", autoComplete: "name", placeholder: "Jo Bloggs", error: "Enter your name" },
  { key: "line1", label: "Street address", autoComplete: "address-line1", placeholder: "12 Call Lane", error: "Enter your street address" },
  { key: "line2", label: "Flat, floor or building (optional)", autoComplete: "address-line2", placeholder: "Flat 3", error: "Keep this under 120 characters" },
  { key: "city", label: "Town or city", autoComplete: "address-level2", placeholder: "Leeds", error: "Enter your town or city" },
  { key: "postcode", label: "Postcode", autoComplete: "postal-code", placeholder: "LS1 6DT", error: "Enter a UK postcode, like LS1 6DT" },
] as const;
type Key = (typeof FIELDS)[number]["key"];

/** Stitch Checkout: delivery address, delivery charges, then payment on Stripe's secure page. */
export function CheckoutForm() {
  const trpc = useTRPC();
  const basket = useQuery(trpc.basket.get.queryOptions());
  const [address, setAddress] = useState<Record<Key, string>>({ name: "", line1: "", line2: "", city: "", postcode: "" });
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const start = useMutation(trpc.orders.start.mutationOptions({ onSuccess: ({ url }) => window.location.assign(url) }));

  if (basket.isPending) return <p className="muted">Loading…</p>;
  if (basket.error) return <p className="alert alert-error">We couldn&apos;t load your basket. Refresh to try again.</p>;
  const b = basket.data;
  if (b.count === 0 || b.hasUnavailable) {
    return (
      <div className="review-cta">
        <p className="note">{b.count === 0 ? "Your basket is empty." : "Some coffees in your basket can't be bought right now."}</p>
        <Link href="/basket" className="button">
          Back to your basket
        </Link>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = ShippingAddress.safeParse(address);
    if (!result.success) {
      const found: Partial<Record<Key, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as Key;
        found[key] ??= FIELDS.find((f) => f.key === key)!.error;
      }
      return setErrors(found);
    }
    setErrors({});
    start.mutate({ address: result.data, client: "web" });
  };

  return (
    <form className="checkout" onSubmit={submit} noValidate aria-label="Checkout">
      <div className="checkout-steps">
        <section aria-labelledby="address-heading">
          <div className="step-head">
            <h1 id="address-heading">Delivery Address</h1>
            <span className="eyebrow">Step 01 / 03</span>
          </div>
          <div className="stack">
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span className="eyebrow">{f.label}</span>
                <input
                  name={f.key}
                  autoComplete={f.autoComplete}
                  placeholder={f.placeholder}
                  value={address[f.key]}
                  onChange={(e) => setAddress((a) => ({ ...a, [f.key]: e.target.value }))}
                  aria-invalid={!!errors[f.key]}
                />
                {errors[f.key] && <span className="field-error">{errors[f.key]}</span>}
              </label>
            ))}
            <p className="muted">We deliver to UK addresses.</p>
          </div>
        </section>

        <section aria-labelledby="delivery-heading">
          <div className="step-head">
            <h2 id="delivery-heading">Delivery</h2>
            <span className="eyebrow">Step 02 / 03</span>
          </div>
          <ul className="delivery-options">
            {b.groups.map((g) => (
              <li key={g.roaster.id}>
                <div>
                  <strong>{g.roaster.name}</strong>
                  <span className="muted italic">Posted by the roaster · 2–5 working days</span>
                </div>
                <span>{g.shippingPence === 0 ? "Free" : formatGbp(g.shippingPence)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="payment-heading">
          <div className="step-head">
            <h2 id="payment-heading">Payment</h2>
            <span className="eyebrow">Step 03 / 03</span>
          </div>
          <p className="muted">
            You&apos;ll pay on Stripe&apos;s secure page, by card, Apple Pay or Google Pay. Each roaster then posts their coffee to you.
          </p>
        </section>
      </div>

      <aside className="summary" aria-label="Your selection">
        <h2>Your Selection</h2>
        <ul className="summary-items">
          {b.groups.flatMap((g) =>
            g.items.map((i) => (
              <li key={i.variantId}>
                <div className="frame frame-contain">{i.bean.imageUrl && <img src={i.bean.imageUrl} alt="" />}</div>
                <div>
                  <strong>{i.bean.name}</strong>
                  <span className="muted italic">
                    {i.variantTitle} · {i.quantity === 1 ? "1 bag" : `${i.quantity} bags`}
                  </span>
                  <span className="eyebrow">{g.roaster.name}</span>
                </div>
                <span>{formatGbp(i.unitPricePence * i.quantity)}</span>
              </li>
            )),
          )}
        </ul>
        <dl className="summary-lines">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatGbp(b.subtotalPence)}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>{b.shippingPence === 0 ? "Free" : formatGbp(b.shippingPence)}</dd>
          </div>
          <div className="summary-total">
            <dt>Total</dt>
            <dd>{formatGbp(b.totalPence)}</dd>
          </div>
        </dl>
        <p className="muted summary-vat">Prices include VAT.</p>
        {start.error && (
          <p className="alert alert-error" role="alert">
            {start.error.message}
          </p>
        )}
        <button type="submit" className="button" disabled={start.isPending || start.isSuccess}>
          {start.isPending || start.isSuccess ? "Taking you to payment…" : `Pay ${formatGbp(b.totalPence)}`}
        </button>
        <Link href="/basket" className="rule-link">
          Back to basket
        </Link>
      </aside>
    </form>
  );
}
