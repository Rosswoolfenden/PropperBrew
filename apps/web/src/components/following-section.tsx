"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { formatGbp, humanize } from "@propperbrew/shared";
import { useSession, useTRPC } from "@/app/providers";

/** On the home page, for people who follow roasters: their coffees added in the last month. */
export function FollowingSection() {
  const { session } = useSession();
  const trpc = useTRPC();
  const mine = useQuery({ ...trpc.follows.mine.queryOptions(), enabled: !!session });
  if (!mine.data || mine.data.roasters.length === 0) return null;
  const { roasters, newCoffees } = mine.data;
  return (
    <section className="section-tight following" aria-labelledby="following-heading">
      <h2 id="following-heading">From roasters you follow</h2>
      {newCoffees.length === 0 ? (
        <p className="muted italic">
          Nothing new from {roasters.map((r) => r.name).join(", ")} this month. We&apos;ll show their new coffees here.
        </p>
      ) : (
        <ul className="roast-grid">
          {newCoffees.map((c) => (
            <li key={c.id}>
              <Link href={`/${c.roaster.slug}/${c.slug}`} className="roast-card">
                <div className="frame frame-contain">{c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" />}</div>
                {c.roastLevel && <span className="chip chip-sm">{humanize(c.roastLevel)} roast</span>}
                <h3>{c.name}</h3>
                <p className="subtitle">{c.roaster.name}</p>
                {c.fromPricePence !== null && <span className="roast-price">{formatGbp(c.fromPricePence)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
