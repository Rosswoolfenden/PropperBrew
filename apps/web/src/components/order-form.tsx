"use client";

import { useState } from "react";
import { formatGbp, MAX_ORDER_QUANTITY, possessive, shopifyCartUrl } from "@propperbrew/shared";
import type { RouterOutputs } from "@/lib/trpc";

type Variant = RouterOutputs["beans"]["bySlug"]["variants"][number];

/** Size + quantity, then off to the roaster's own Shopify checkout with the cart pre-filled. */
export function OrderForm({
  variants,
  checkoutDomain,
  roasterName,
}: {
  variants: readonly [Variant, ...Variant[]];
  checkoutDomain: string;
  roasterName: string;
}) {
  const [variant, setVariant] = useState(variants[0]);
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="order">
      <fieldset className="variants">
        <legend className="eyebrow">Size</legend>
        {variants.map((v) => (
          <label key={v.id} className="variant">
            <input type="radio" name="variant" checked={v.id === variant.id} onChange={() => setVariant(v)} />
            <span>{v.title}</span>
            <span className="variant-price">{formatGbp(v.pricePence)}</span>
          </label>
        ))}
      </fieldset>
      <div className="order-bar">
        <div className="stepper" role="group" aria-label="Quantity">
          <button type="button" aria-label="Fewer" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}>
            −
          </button>
          <output aria-live="polite">{quantity}</output>
          <button
            type="button"
            aria-label="More"
            disabled={quantity >= MAX_ORDER_QUANTITY}
            onClick={() => setQuantity(quantity + 1)}
          >
            +
          </button>
        </div>
        <a
          className="button"
          href={shopifyCartUrl(checkoutDomain, variant.shopifyVariantId, quantity)}
          target="_blank"
          rel="noopener"
        >
          Order · {formatGbp(variant.pricePence * quantity)}
        </a>
      </div>
      <p className="muted order-note">You&apos;ll check out on {possessive(roasterName)} own shop.</p>
    </div>
  );
}
