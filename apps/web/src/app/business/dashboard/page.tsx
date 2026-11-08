"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { formatGbp } from "@propperbrew/shared";
import { useSession, useTRPC } from "@/app/providers";
import { Feedback } from "@/components/business/feedback";
import { RoasterOrders } from "@/components/business/orders";
import { Payouts } from "@/components/business/payouts";
import { ProfileForm } from "@/components/business/profile-form";
import { Recommendations } from "@/components/business/recommendations";
import { Rating } from "@/components/rating";
import type { RouterOutputs } from "@/lib/trpc";

type Roaster = RouterOutputs["business"]["me"]["roasters"][number];

const STATUS_LABEL = { in_stock: "In stock", sold_out: "Sold out", archived: "Archived" } as const;

export default function DashboardPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const { session, ready } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const trpc = useTRPC();
  const justConnected = params.get("connected");
  const me = useQuery({
    ...trpc.business.me.queryOptions(),
    enabled: !!session,
    // Right after connecting, products sync in the background: keep looking until coffees arrive.
    refetchInterval: (q) => (justConnected && !q.state.data?.roasters.some((r) => r.coffees.length > 0) ? 2000 : false),
  });

  useEffect(() => {
    if (ready && !session) router.replace("/business");
  }, [ready, session, router]);

  if (!ready || !session || me.isPending) return <p className="muted">Loading your dashboard…</p>;
  if (me.error) return <p className="alert alert-error">We couldn&apos;t load your dashboard. Please refresh to try again.</p>;

  const { roasters, accountType } = me.data;
  const connected = roasters.find((r) => r.slug === justConnected);

  return (
    <div className="dashboard">
      <section className="intro">
        <p className="eyebrow">Business dashboard</p>
        <h1 className="display">{roasters.length === 1 ? roasters[0]!.name : "Your roasters"}</h1>
      </section>

      {connected && (
        <p className="alert alert-info" role="status">
          {connected.name} is connected. Your products sync from Shopify automatically.
        </p>
      )}
      {params.get("error") === "link-expired" && (
        <p className="alert alert-error" role="alert">
          That connection took too long to finish. Please connect your store again.
        </p>
      )}

      {accountType !== "business" && roasters.length === 0 ? (
        <p className="note">This is a coffee drinker&apos;s account. Sign out and sign in with your business account to manage a roaster.</p>
      ) : (
        <>
          {roasters.map((r) => (
            // With one roaster the page heading already names it.
            <RoasterPanel key={r.id} roaster={r} showName={roasters.length > 1} />
          ))}
          <ConnectStore first={roasters.length === 0} />
        </>
      )}
    </div>
  );
}

function RoasterPanel({ roaster: r, showName }: { roaster: Roaster; showName: boolean }) {
  return (
    <section className="roaster-panel" aria-label={`${r.name} dashboard`}>
      <div className="panel-head">
        {showName && <h2>{r.name}</h2>}
        <span className="chip chip-sm">{r.role === "owner" ? "Owner" : "Staff"}</span>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="eyebrow">Shopify</span>
          <strong>{r.shopify.connected ? "Connected" : "Not connected"}</strong>
          <span className="muted">{r.shopifyDomain}</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Live on PropperBrew</span>
          <strong>{r.liveCount}</strong>
          <span className="muted">
            of {r.coffees.length} {r.coffees.length === 1 ? "coffee" : "coffees"}
          </span>
        </div>
      </div>

      <h3 className="panel-subhead">Your coffees</h3>
      {r.coffees.length === 0 ? (
        <p className="note">No coffees yet. They appear here as your Shopify products sync.</p>
      ) : (
        <ul className="coffee-lines">
          {r.coffees.map((c) => (
            <li key={c.id} className="coffee-line">
              <div className="frame">{c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" />}</div>
              <div className="coffee-line-body">
                <Link href={`/${r.slug}/${c.slug}`}>{c.name}</Link>
                {c.avgRating !== null && <Rating value={c.avgRating} count={c.reviewCount} />}
              </div>
              <span className={`status status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
              <span className="coffee-line-price">{c.fromPricePence !== null ? formatGbp(c.fromPricePence) : "—"}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="tools">
        <RoasterOrders roaster={r} />
        <Payouts roaster={r} />
        <ProfileForm roaster={r} />
        <Recommendations roaster={r} />
        <Feedback roaster={r} />
      </div>
    </section>
  );
}

function ConnectStore({ first }: { first: boolean }) {
  const trpc = useTRPC();
  const [shop, setShop] = useState("");
  const connect = useMutation(trpc.business.connectShopifyUrl.mutationOptions({ onSuccess: ({ url }) => window.location.assign(url) }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    connect.mutate({ shop });
  };

  return (
    <section className="card connect-store" aria-labelledby="connect-store">
      <h2 id="connect-store">{first ? "Connect your Shopify store" : "Connect another store"}</h2>
      <p className="muted">Your coffees, stock and prices come straight from Shopify, and orders go back into it.</p>
      <form className="connect-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="eyebrow">Shopify store</span>
          <input placeholder="your-store.myshopify.com" autoCapitalize="none" spellCheck={false} value={shop} onChange={(e) => setShop(e.target.value)} />
        </label>
        {connect.error && (
          <p className="alert alert-error" role="alert">
            {connect.error.message}
          </p>
        )}
        <button type="submit" className="button button-shopify" disabled={connect.isPending || connect.isSuccess}>
          {connect.isPending || connect.isSuccess ? "Opening Shopify…" : "Connect Shopify store"}
        </button>
      </form>
    </section>
  );
}
