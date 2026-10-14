import Link from "next/link";
import { formatPriceFrom, humanize, notesSentence } from "@propperbrew/shared";
import { RoasterSpotlight } from "@/components/spotlight";
import { api, type RouterOutputs } from "@/lib/trpc";

export const revalidate = 300;

type Roaster = RouterOutputs["roasters"]["discover"][number];

/** How many roasters the spotlight cycles through, and how many coffees "New arrivals" lists. */
const SPOTLIGHT_COUNT = 4;
const NEW_ARRIVALS_COUNT = 4;

const coffeeCount = (n: number) => `${n} ${n === 1 ? "coffee" : "coffees"}`;
const roasterImage = (r: Roaster) => r.coffees.find((c) => c.imageUrl)?.imageUrl;

export default async function DiscoverPage() {
  const roasters = await api.roasters.discover.query({});
  const newest = roasters
    .flatMap((roaster) => roaster.coffees.map((coffee) => ({ coffee, roaster })))
    .sort((a, b) => b.coffee.addedAt.getTime() - a.coffee.addedAt.getTime())
    .slice(0, NEW_ARRIVALS_COUNT);

  return (
    <>
      {/* The design opens straight onto the spotlight; the heading is for screen readers and search. */}
      <h1 className="visually-hidden">Discover UK specialty coffee</h1>
      {roasters.length === 0 ? (
        <p className="muted">No coffees to order yet. Roasters appear here once they connect their shop.</p>
      ) : (
        <>
          <RoasterSpotlight roasters={roasters.slice(0, SPOTLIGHT_COUNT)} />

          <section className="section-tight" aria-label="The Collection">
            <h2>The Collection</h2>
            <ul className="collection">
              {roasters.map((r) => {
                const image = roasterImage(r);
                return (
                  <li key={r.id}>
                    <a href={`#roaster-${r.slug}`} className="collection-item" aria-label={`${r.name}, see their coffees`}>
                      <div className="frame">{image && <img src={image} alt="" loading="lazy" />}</div>
                      <strong>{r.name}</strong>
                      {r.city && <span className="subtitle">{r.city}</span>}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="section-tight" aria-label="New arrivals">
            <h2>New arrivals</h2>
            <ul className="arrivals">
              {newest.map(({ coffee, roaster }) => (
                <li key={coffee.id}>
                  <Link href={`/${roaster.slug}/${coffee.slug}`} className="arrival">
                    <div className="frame">{coffee.imageUrl && <img src={coffee.imageUrl} alt="" loading="lazy" />}</div>
                    <div className="arrival-body">
                      {coffee.roastLevel && <span className="chip chip-sm">{humanize(coffee.roastLevel)} roast</span>}
                      <h3>{coffee.name}</h3>
                      <p className="muted">
                        {[roaster.name, coffee.tastingNotes.length > 0 && notesSentence(coffee.tastingNotes)].filter(Boolean).join(" · ")}
                      </p>
                      <span className="arrival-price">{formatPriceFrom(coffee.fromPricePence, coffee.priceCount)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {roasters.map((roaster) => (
            <section key={roaster.id} id={`roaster-${roaster.slug}`} className="roaster-row" aria-label={`${roaster.name} coffees`}>
              <div className="roaster-row-head">
                <h2>{roaster.name}</h2>
                {roaster.city && <p className="subtitle">{roaster.city}</p>}
                <span className="eyebrow">{coffeeCount(roaster.coffeeCount)}</span>
              </div>
              <ul className="coffee-track">
                {roaster.coffees.map((coffee) => (
                  <li key={coffee.id}>
                    <Link href={`/${roaster.slug}/${coffee.slug}`} className="coffee-card">
                      <div className="frame frame-contain">{coffee.imageUrl && <img src={coffee.imageUrl} alt="" loading="lazy" />}</div>
                      <div className="coffee-card-title">
                        <h3>{coffee.name}</h3>
                        <span className="coffee-card-price">{formatPriceFrom(coffee.fromPricePence, coffee.priceCount)}</span>
                      </div>
                      <p className="eyebrow">
                        {[coffee.originCountry, coffee.process && humanize(coffee.process)].filter(Boolean).join(" • ")}
                      </p>
                      {coffee.tastingNotes.length > 0 && (
                        <ul className="chips">
                          {coffee.tastingNotes.slice(0, 2).map((n) => (
                            <li key={n} className="chip chip-sm chip-pill">
                              {n}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
