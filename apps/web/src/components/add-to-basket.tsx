"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { formatGbp, MAX_ORDER_QUANTITY } from "@propperbrew/shared";
import { useSession, useTRPC } from "@/app/providers";
import type { RouterOutputs } from "@/lib/trpc";

type Variant = RouterOutputs["beans"]["bySlug"]["variants"][number];

/** Size + quantity into the PropperBrew basket, for roasters paid through us (see OrderForm for the rest). */
export function AddToBasket({ variants, delivery }: { variants: readonly [Variant, ...Variant[]]; delivery: string }) {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [variant, setVariant] = useState(variants[0]);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState<string | null>(null);
  const add = useMutation(
    trpc.basket.add.mutationOptions({
      onSuccess: (basket) => {
        queryClient.setQueryData(trpc.basket.get.queryKey(), basket);
        setAdded(`${quantity} × ${variant.title}`);
      },
    }),
  );
  const change = (fn: () => void) => () => (fn(), setAdded(null), add.reset());

  return (
    <div className="order">
      <fieldset className="variants">
        <legend className="eyebrow">Size</legend>
        {variants.map((v) => (
          <label key={v.id} className="variant">
            <input type="radio" name="variant" checked={v.id === variant.id} onChange={change(() => setVariant(v))} />
            <span>{v.title}</span>
            <span className="variant-price">{formatGbp(v.pricePence)}</span>
          </label>
        ))}
      </fieldset>
      <div className="order-bar">
        <div className="stepper" role="group" aria-label="Quantity">
          <button type="button" aria-label="Fewer" disabled={quantity <= 1} onClick={change(() => setQuantity(quantity - 1))}>
            −
          </button>
          <output aria-live="polite">{quantity}</output>
          <button type="button" aria-label="More" disabled={quantity >= MAX_ORDER_QUANTITY} onClick={change(() => setQuantity(quantity + 1))}>
            +
          </button>
        </div>
        {ready && !session ? (
          <Link className="button" href={`/sign-in?next=${encodeURIComponent(pathname)}`}>
            Sign in to buy
          </Link>
        ) : (
          <button
            type="button"
            className="button"
            disabled={!ready || add.isPending}
            onClick={() => add.mutate({ variantId: variant.id, quantity })}
          >
            {add.isPending ? "Adding…" : `Add to basket · ${formatGbp(variant.pricePence * quantity)}`}
          </button>
        )}
      </div>
      {added && (
        <p className="alert alert-info" role="status">
          Added {added} to your basket. <Link href="/basket">View basket</Link>
        </p>
      )}
      {add.error && (
        <p className="alert alert-error" role="alert">
          {add.error.message}
        </p>
      )}
      <p className="muted order-note">{delivery}</p>
    </div>
  );
}
