import Link from "next/link";
import { humanize } from "@propperbrew/shared";
import { Rating } from "@/components/rating";
import { api } from "@/lib/trpc";

export const revalidate = 300;

export default async function HomePage() {
  const { items } = await api.beans.search.query({ inStockOnly: false, limit: 24 });

  return (
    <>
      <section className="intro">
        <p className="eyebrow">UK specialty coffee</p>
        <h1 className="display">Fresh from UK roasters</h1>
        <p className="lead">Reviews, brew recipes and one-basket checkout for the UK&apos;s independent coffee roasters.</p>
      </section>
      {items.length === 0 ? (
        <p className="muted">No coffees yet. Install the Shopify connector on a roaster's store to sync their range.</p>
      ) : (
        <div className="bean-grid">
          {items.map((bean) => (
            <Link key={bean.id} href={`/${bean.roaster.slug}/${bean.slug}`} className="bean-row">
              <div className="frame">{bean.imageUrl && <img src={bean.imageUrl} alt="" loading="lazy" />}</div>
              <div className="bean-row-body">
                {bean.roastLevel && <span className="chip chip-sm">{humanize(bean.roastLevel)} roast</span>}
                <h3>{bean.name}</h3>
                <p className="subtitle">
                  {bean.roaster.name}
                  {bean.originCountry ? ` · ${bean.originCountry}` : ""}
                </p>
                {bean.tastingNotes.length > 0 && <p className="notes">Notes of {bean.tastingNotes.join(", ")}</p>}
                {bean.avgRating !== null && <Rating value={bean.avgRating} count={bean.reviewCount} />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
