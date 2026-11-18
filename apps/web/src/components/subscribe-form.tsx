"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { deliveryNote, formatGbp, intervalLabel, MAX_ORDER_QUANTITY, ShippingAddress, shippingFor, SUBSCRIPTION_INTERVALS, type SubscriptionInterval } from "@propperbrew/shared";
import { useTRPC } from "@/app/providers";

const FIELDS = [
  { key: "name", label: "Full name", autoComplete: "name", error: "Enter your name" },
  { key: "line1", label: "Street address", autoComplete: "address-line1", error: "Enter your street address" },
  { key: "line2", label: "Flat, floor or building (optional)", autoComplete: "address-line2", error: "Keep this under 120 characters" },
  { key: "city", label: "Town or city", autoComplete: "address-level2", error: "Enter your town or city" },
  { key: "postcode", label: "Postcode", autoComplete: "postal-code", error: "Enter a UK postcode, like LS1 6DT" },
] as const;
type Key = (typeof FIELDS)[number]["key"];

/** A coffee every 2 or 4 weeks: size, how many, how often, where to; then Stripe takes the first payment. */
export function SubscribeForm({ roasterSlug, beanSlug }: { roasterSlug: string; beanSlug: string }) {
  const trpc = useTRPC();
  const id = useId();
  const bean = useQuery(trpc.beans.bySlug.queryOptions({ roasterSlug, beanSlug }));
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [weeks, setWeeks] = useState<SubscriptionInterval>(2);
  const [address, setAddress] = useState<Record<Key, string>>({ name: "", line1: "", line2: "", city: "", postcode: "" });
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const start = useMutation(trpc.subscriptions.start.mutationOptions({ onSuccess: ({ url }) => window.location.assign(url) }));

  if (bean.isPending) return <p className="muted">Loading…</p>;
  if (!bean.data) return <p className="note">That coffee isn&apos;t here.</p>;
  const b = bean.data;
  if (!b.inAppCheckout || b.variants.length === 0) {
    return (
      <p className="note">
        {b.name} can&apos;t be subscribed to here. <Link href={`/${roasterSlug}/${beanSlug}`}>Back to the coffee</Link>
      </p>
    );
  }
  const variant = b.variants.find((v) => v.id === variantId) ?? b.variants[0]!;
  const subtotal = variant.pricePence * quantity;
  const delivery = shippingFor(subtotal, b.roaster);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = ShippingAddress.safeParse(address);
    if (!result.success) {
      const found: Partial<Record<Key, string>> = {};
      for (const issue of result.error.issues) found[issue.path[0] as Key] ??= FIELDS.find((f) => f.key === issue.path[0])!.error;
      return setErrors(found);
    }
    setErrors({});
    start.mutate({ variantId: variant.id, quantity, intervalWeeks: weeks, address: result.data, client: "web" });
  };

  return (
    <form className="checkout" onSubmit={submit} noValidate aria-label="Subscribe">
      <div className="checkout-steps">
        <section aria-labelledby="sub-heading">
          <p className="eyebrow">Subscribe</p>
          <h1 id="sub-heading" className="display">
            {b.name}
          </h1>
          <p className="muted">
            From {b.roaster.name}. {deliveryNote(b.roaster)}
          </p>
        </section>

        <fieldset className="variants">
          <legend className="eyebrow">Size</legend>
          {b.variants.map((v) => (
            <label key={v.id} className="variant">
              <input type="radio" name={`${id}-size`} checked={v.id === variant.id} onChange={() => setVariantId(v.id)} />
              <span>{v.title}</span>
              <span className="variant-price">{formatGbp(v.pricePence)}</span>
            </label>
          ))}
        </fieldset>

        <div className="form-row">
          <div className="field">
            <label htmlFor={`${id}-qty`} className="eyebrow">
              Bags each time
            </label>
            <select id={`${id}-qty`} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
              {Array.from({ length: MAX_ORDER_QUANTITY }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="variants">
            <legend className="eyebrow">How often</legend>
            {SUBSCRIPTION_INTERVALS.map((w) => (
              <label key={w} className="variant">
                <input type="radio" name={`${id}-weeks`} checked={weeks === w} onChange={() => setWeeks(w)} />
                <span>{intervalLabel(w)}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <section aria-labelledby="sub-address">
          <h2 id="sub-address">Delivery address</h2>
          <div className="stack">
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span className="eyebrow">{f.label}</span>
                <input
                  autoComplete={f.autoComplete}
                  value={address[f.key]}
                  onChange={(e) => setAddress((a) => ({ ...a, [f.key]: e.target.value }))}
                  aria-invalid={!!errors[f.key]}
                />
                {errors[f.key] && <span className="field-error">{errors[f.key]}</span>}
              </label>
            ))}
          </div>
        </section>
      </div>

      <aside className="summary" aria-label="Your subscription">
        <h2>Your subscription</h2>
        <dl className="summary-lines">
          <div>
            <dt>
              {quantity} × {variant.title}
            </dt>
            <dd>{formatGbp(subtotal)}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>{delivery === 0 ? "Free" : formatGbp(delivery)}</dd>
          </div>
          <div className="summary-total">
            <dt>{intervalLabel(weeks)}</dt>
            <dd>{formatGbp(subtotal + delivery)}</dd>
          </div>
        </dl>
        <p className="muted summary-vat">Paid each time it&apos;s sent, at today&apos;s price. Pause or cancel whenever you like.</p>
        {start.error && (
          <p className="alert alert-error" role="alert">
            {start.error.message}
          </p>
        )}
        <button type="submit" className="button" disabled={start.isPending || start.isSuccess}>
          {start.isPending || start.isSuccess ? "Taking you to payment…" : `Subscribe · ${formatGbp(subtotal + delivery)}`}
        </button>
      </aside>
    </form>
  );
}
