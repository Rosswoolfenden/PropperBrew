"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { formatGbp } from "@propperbrew/shared";
import { useTRPC } from "@/app/providers";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function OrdersList() {
  const trpc = useTRPC();
  const orders = useQuery(trpc.orders.list.queryOptions());
  if (orders.isPending) return <p className="muted">Loading your orders…</p>;
  if (orders.error) return <p className="alert alert-error">We couldn&apos;t load your orders. Refresh to try again.</p>;
  if (orders.data.length === 0) return <p className="note">No orders yet.</p>;
  return (
    <ul className="rec-list" aria-label="Orders">
      {orders.data.map((o) => (
        <li key={o.id} className="rec-line">
          <div>
            <Link href={`/orders/${o.id}`}>
              <strong>{o.reference}</strong>
            </Link>
            <span className="muted"> · {dateFormat.format(o.createdAt)}</span>
            <div className="muted">
              {o.items} {o.items === 1 ? "bag" : "bags"} from {o.roasters.join(", ")}
            </div>
          </div>
          <strong>{formatGbp(o.totalPence)}</strong>
        </li>
      ))}
    </ul>
  );
}
