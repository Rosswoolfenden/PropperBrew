"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatGbp, intervalLabel } from "@propperbrew/shared";
import { useTRPC } from "@/app/providers";

const STATUS = { active: "Active", paused: "Paused", cancelled: "Cancelled", pending: "Setting up" } as const;
const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Your subscriptions: what, how often, the next delivery; pause, resume or cancel. */
export function SubscriptionsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [started, setStarted] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => setStarted(new URLSearchParams(window.location.search).get("started")), []);
  const mine = useQuery({
    ...trpc.subscriptions.mine.queryOptions(),
    // Just subscribed: Stripe confirms it in a moment.
    refetchInterval: (q) => (started && !q.state.data?.some((s) => s.id === started) ? 1500 : false),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.subscriptions.pathKey() });
  const pause = useMutation(trpc.subscriptions.pause.mutationOptions({ onSuccess: refresh }));
  const resume = useMutation(trpc.subscriptions.resume.mutationOptions({ onSuccess: refresh }));
  const cancel = useMutation(trpc.subscriptions.cancel.mutationOptions({ onSuccess: async () => (await refresh(), setConfirming(null)) }));
  const busy = pause.isPending || resume.isPending || cancel.isPending;
  const error = pause.error ?? resume.error ?? cancel.error;

  if (mine.isPending) return <p className="muted">Loading…</p>;
  if (mine.error) return <p className="alert alert-error">We couldn&apos;t load your subscriptions. Refresh to try again.</p>;
  const justStarted = started && mine.data.find((s) => s.id === started);

  return (
    <div className="stack">
      {started && (
        <p className="alert alert-info" role="status">
          {justStarted ? "You're subscribed. Your first bag is on its way." : "Confirming your subscription…"}
        </p>
      )}
      {error && (
        <p className="alert alert-error" role="alert">
          {error.message}
        </p>
      )}
      {mine.data.length === 0 ? (
        <p className="note">No subscriptions yet. Subscribe from any coffee from a roaster that sells here.</p>
      ) : (
        <ul className="brew-list" aria-label="Subscriptions">
          {mine.data.map((s) => (
            <li key={s.id} className="brew-entry subscription" aria-label={s.title}>
              <div className="brew-head">
                <Link href={`/${s.roaster.slug}/${s.bean.slug}`}>{s.bean.name}</Link>
                <span className={`status ${s.status === "active" ? "status-in_stock" : s.status === "paused" ? "status-sold_out" : "status-archived"}`}>{STATUS[s.status]}</span>
              </div>
              <p className="muted">
                {s.quantity} × {s.title.split(" · ")[1]} from {s.roaster.name} · {intervalLabel(s.intervalWeeks).toLowerCase()} · {formatGbp(s.pricePence)} each time
              </p>
              {s.status === "active" && s.nextDeliveryAt && <p>Next one is paid for and sent on {date.format(s.nextDeliveryAt)}.</p>}
              {s.status === "paused" && <p>Paused: nothing is sent or charged until you resume.</p>}
              {s.status !== "cancelled" && (
                <div className="shelf-actions">
                  {s.status === "active" ? (
                    <button type="button" className="button button-secondary button-sm" disabled={busy} onClick={() => pause.mutate({ id: s.id })}>
                      Pause
                    </button>
                  ) : (
                    <button type="button" className="button button-secondary button-sm" disabled={busy} onClick={() => resume.mutate({ id: s.id })}>
                      Resume
                    </button>
                  )}
                  {confirming === s.id ? (
                    <>
                      <button type="button" className="button button-danger button-sm" disabled={busy} onClick={() => cancel.mutate({ id: s.id })}>
                        Yes, cancel it
                      </button>
                      <button type="button" className="text-button" onClick={() => setConfirming(null)}>
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button type="button" className="text-button" onClick={() => setConfirming(s.id)}>
                      Cancel subscription
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
