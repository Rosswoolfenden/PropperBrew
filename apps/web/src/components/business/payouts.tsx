"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DEFAULT_SHIPPING_PENCE, DeliveryInput, formatGbp } from "@propperbrew/shared";
import { refreshAllCoffeePages } from "@/app/[roaster]/actions";
import { useTRPC } from "@/app/providers";
import type { RouterOutputs } from "@/lib/trpc";

type Roaster = RouterOutputs["business"]["me"]["roasters"][number];

const pounds = (pence: number | null) => (pence === null ? "" : (pence / 100).toFixed(2));
/** "3.95" or "£3.95" → 395; blank → null; anything else → NaN (refused by DeliveryInput). */
const toPence = (text: string) => {
  const t = text.trim().replace(/^£/, "");
  if (t === "") return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
};

/** Selling here: Stripe payouts (owner sets up), what they charge for delivery, and what they're paid. */
export function Payouts({ roaster: r }: { roaster: Roaster }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const setup = useMutation(trpc.business.setupPayouts.mutationOptions({ onSuccess: ({ url }) => window.location.assign(url) }));
  const refresh = useMutation(
    trpc.business.refreshPayouts.mutationOptions({
      onSuccess: async ({ enabled }) => {
        if (enabled) await refreshAllCoffeePages(r.slug);
        await queryClient.invalidateQueries({ queryKey: trpc.business.pathKey() });
      },
    }),
  );

  // Back from Stripe's onboarding: ask whether it's finished, once.
  const returned = params.get("roaster") === r.id && params.get("payouts") === "done";
  const asked = useRef(false);
  useEffect(() => {
    if (returned && !asked.current) {
      asked.current = true;
      refresh.mutate({ roasterId: r.id });
    }
  }, [returned, r.id, refresh]);

  if (!r.payouts.available) return null;

  return (
    <section className="card business-form" aria-label="Selling on PropperBrew">
      <div className="card-head">
        <h3>Selling on PropperBrew</h3>
        <span className={`status ${r.payouts.enabled ? "status-in_stock" : "status-sold_out"}`}>{r.payouts.enabled ? "Payouts on" : "Payouts off"}</span>
      </div>
      {r.payouts.enabled ? (
        <p className="muted">
          People can buy your coffees in the PropperBrew app and website. Each order arrives in Shopify, already paid, and Stripe pays you out, less
          PropperBrew&apos;s commission on the coffee.
        </p>
      ) : (
        <>
          <p className="muted">
            Set up payouts with Stripe to let people buy your coffees here, in one basket with other roasters. Until then, &ldquo;Order&rdquo; sends
            them to your Shopify store.
          </p>
          {returned && refresh.isSuccess && !refresh.data.enabled && (
            <p className="alert alert-info" role="status">
              Stripe is still checking your details. This page updates when they&apos;re done.
            </p>
          )}
          {r.role === "owner" ? (
            <button type="button" className="button" disabled={setup.isPending || setup.isSuccess} onClick={() => setup.mutate({ roasterId: r.id })}>
              {setup.isPending || setup.isSuccess ? "Opening Stripe…" : r.payouts.started ? "Finish setting up payouts" : "Set up payouts with Stripe"}
            </button>
          ) : (
            <p className="note">Ask your roaster&apos;s owner to set up payouts.</p>
          )}
          {setup.error && (
            <p className="alert alert-error" role="alert">
              {setup.error.message}
            </p>
          )}
        </>
      )}
      <Delivery roaster={r} />
    </section>
  );
}

function Delivery({ roaster: r }: { roaster: Roaster }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [flat, setFlat] = useState(pounds(r.delivery.shippingFlatPence ?? DEFAULT_SHIPPING_PENCE));
  const [free, setFree] = useState(pounds(r.delivery.freeShippingThresholdPence));
  const [errors, setErrors] = useState<{ flat?: string; free?: string }>({});
  const [saved, setSaved] = useState(false);
  const save = useMutation(
    trpc.business.updateDelivery.mutationOptions({
      onSuccess: async () => {
        await refreshAllCoffeePages(r.slug);
        await queryClient.invalidateQueries({ queryKey: trpc.business.pathKey() });
        setSaved(true);
      },
    }),
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = DeliveryInput.safeParse({ roasterId: r.id, shippingFlatPence: toPence(flat), freeShippingThresholdPence: toPence(free) });
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      return setErrors({
        flat: paths.includes("shippingFlatPence") ? "Enter a delivery charge up to £50, like 3.95" : undefined,
        free: paths.includes("freeShippingThresholdPence") ? "Enter an amount like 30, or leave it empty" : undefined,
      });
    }
    setErrors({});
    save.mutate(result.data);
  };
  const edit = (set: (v: string) => void) => (e: { target: { value: string } }) => (set(e.target.value), setSaved(false));

  return (
    <form className="rec-form" onSubmit={submit} aria-label="Delivery" noValidate>
      <h4>Delivery</h4>
      <p className="muted">What you charge for orders placed here. You post them from Shopify as usual.</p>
      <div className="form-row">
        <label className="field">
          <span className="eyebrow">Delivery charge (£)</span>
          <input inputMode="decimal" value={flat} onChange={edit(setFlat)} aria-invalid={!!errors.flat} />
          {errors.flat && <span className="field-error">{errors.flat}</span>}
        </label>
        <label className="field">
          <span className="eyebrow">Free delivery from (£)</span>
          <input inputMode="decimal" placeholder="Never" value={free} onChange={edit(setFree)} aria-invalid={!!errors.free} />
          {errors.free && <span className="field-error">{errors.free}</span>}
        </label>
      </div>
      {saved && (
        <p className="alert alert-info" role="status">
          Saved. Delivery is {toPence(flat) === 0 ? "free" : formatGbp(toPence(flat)!)}
          {toPence(free) !== null && toPence(flat) !== 0 ? `, free from ${formatGbp(toPence(free)!)}` : ""}.
        </p>
      )}
      <button type="submit" className="button button-secondary" disabled={save.isPending}>
        Save delivery
      </button>
    </form>
  );
}
