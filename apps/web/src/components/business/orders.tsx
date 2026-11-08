"use client";

import { formatGbp } from "@propperbrew/shared";
import type { RouterOutputs } from "@/lib/trpc";

type Roaster = RouterOutputs["business"]["me"]["roasters"][number];

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const STATUS = {
  paid: { label: "Paid · sending to Shopify", className: "status-sold_out" },
  pushed_to_shopify: { label: "In Shopify", className: "status-in_stock" },
  fulfilled: { label: "Posted", className: "status-in_stock" },
  partially_fulfilled: { label: "Partly posted", className: "status-in_stock" },
  refunded: { label: "Refunded", className: "status-archived" },
} as Record<string, { label: string; className: string }>;

/** Orders placed on PropperBrew for this roaster. */
export function RoasterOrders({ roaster: r }: { roaster: Roaster }) {
  if (!r.payouts.available || (!r.payouts.enabled && r.orders.length === 0)) return null;
  return (
    <section className="card business-form" aria-label="Orders from PropperBrew">
      <div className="card-head">
        <h3>Orders from PropperBrew</h3>
      </div>
      {r.orders.length === 0 ? (
        <p className="note">No orders yet. They show here, and in Shopify, as soon as they&apos;re paid.</p>
      ) : (
        <ul className="feedback-list">
          {r.orders.map((o) => (
            <li key={o.id} className="feedback-item order-line">
              <div>
                <strong>
                  {o.reference}
                  {o.shopifyOrderName ? ` · Shopify ${o.shopifyOrderName}` : ""}
                </strong>
                <div className="muted">
                  {o.customer}, {o.city} · {dateFormat.format(o.createdAt)}
                </div>
                <div>{o.lines.map((l) => `${l.quantity} × ${l.title}`).join(", ")}</div>
              </div>
              <div className="order-money">
                <span className={`status ${STATUS[o.status]?.className ?? ""}`}>{STATUS[o.status]?.label ?? o.status}</span>
                <span>{formatGbp(o.totalPence)}</span>
                <span className="muted">You receive {formatGbp(o.payoutPence)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
