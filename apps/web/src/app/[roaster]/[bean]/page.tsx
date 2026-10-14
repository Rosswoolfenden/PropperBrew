import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TRPCClientError } from "@trpc/client";
import { brewRatio, formatGbp, humanize } from "@propperbrew/shared";
import { Rating, Stars } from "@/components/rating";
import { api } from "@/lib/trpc";

export const revalidate = 300;

type Params = Promise<{ roaster: string; bean: string }>;

async function loadBean(params: Params) {
  const { roaster, bean } = await params;
  try {
    return await api.beans.bySlug.query({ roasterSlug: roaster, beanSlug: bean });
  } catch (err) {
    if (err instanceof TRPCClientError && err.data?.code === "NOT_FOUND") notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const bean = await loadBean(params);
  const notes = bean.tastingNotes.slice(0, 3).join(", ");
  return {
    title: `${bean.name} by ${bean.roaster.name}`,
    description: `${bean.name} from ${bean.roaster.name}${bean.originCountry ? `, ${bean.originCountry}` : ""}. ${notes ? `Tasting notes: ${notes}. ` : ""}Reviews and community brew recipes.`,
    openGraph: bean.imageUrl ? { images: [bean.imageUrl] } : undefined,
  };
}

export default async function BeanPage({ params }: { params: Params }) {
  const bean = await loadBean(params);
  const [reviews, recipes] = await Promise.all([
    api.reviews.forBean.query({ coffeeBeanId: bean.id, limit: 10 }),
    api.recipes.forBean.query({ coffeeBeanId: bean.id, limit: 5 }),
  ]);

  const specs: [string, string | null][] = [
    ["Origin", [bean.region, bean.originCountry].filter(Boolean).join(", ") || null],
    ["Producer", bean.producer],
    ["Process", bean.process && humanize(bean.process)],
    ["Varietals", bean.varietals.join(", ") || null],
    ["Altitude", bean.altitudeMasl ? `${bean.altitudeMasl} masl` : null],
    ["Roast", bean.roastLevel && humanize(bean.roastLevel)],
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: bean.name,
    brand: { "@type": "Brand", name: bean.roaster.name },
    image: bean.imageUrl ?? undefined,
    aggregateRating:
      bean.avgRating !== null && bean.reviewCount > 0
        ? { "@type": "AggregateRating", ratingValue: bean.avgRating, reviewCount: bean.reviewCount, bestRating: 5, worstRating: 1 }
        : undefined,
    offers: bean.variants.map((v) => ({
      "@type": "Offer",
      name: v.title,
      price: (v.pricePence / 100).toFixed(2),
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
    })),
  };

  const prices = bean.variants.map((v) => v.pricePence);
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
  const subtitle = [bean.originCountry, bean.roastLevel && `${humanize(bean.roastLevel)} roast`].filter(Boolean).join(" • ");

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="bean">
        <div className="frame">{bean.imageUrl && <img src={bean.imageUrl} alt={bean.name} />}</div>
        <div className="bean-info">
          <p className="eyebrow">
            {bean.roaster.name}
            {bean.roaster.city ? ` · ${bean.roaster.city}` : ""}
          </p>
          <div className="title-row">
            <h1 className="display">{bean.name}</h1>
            {lowestPrice !== null && (
              <span className="price">
                {new Set(prices).size > 1 ? "from " : ""}
                {formatGbp(lowestPrice)}
              </span>
            )}
          </div>
          {subtitle && <p className="subtitle">{subtitle}</p>}
          {bean.avgRating !== null && <Rating value={bean.avgRating} count={bean.reviewCount} />}
          {bean.tastingNotes.length > 0 && (
            <ul className="chips" aria-label="Tasting notes">
              {bean.tastingNotes.map((n) => (
                <li key={n} className="chip">
                  {n}
                </li>
              ))}
            </ul>
          )}
          <dl className="specs">
            {specs
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="spec">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>

          <section>
            <h2>Buy</h2>
            {bean.isArchived || bean.variants.length === 0 ? (
              <p className="note">This lot has sold out. Reviews and recipes stay here for reference.</p>
            ) : (
              <ul className="variants">
                {bean.variants.map((v) => (
                  <li key={v.id} className="variant">
                    <span>{v.title}</span>
                    <span className="variant-price">{formatGbp(v.pricePence)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="section">
        <h2>How people are brewing it</h2>
        {recipes.length === 0 && <p className="muted">No recipes yet — be the first to share your dial-in.</p>}
        <div className="stack">
          {recipes.map((r) => (
            <div key={r.id} className="card">
              <div className="card-head">
                <h3>{humanize(r.brewMethod)}</h3>
                <span className="eyebrow">
                  ▲ {r.upvotesCount} · by {r.user.username}
                </span>
              </div>
              <div className="steps">
                <Step icon="scale" title="Ratio">
                  {r.coffeeDoseG}g → {r.waterWeightG}g ({brewRatio(r.coffeeDoseG, r.waterWeightG)})
                </Step>
                {r.waterTempC ? (
                  <Step icon="thermostat" title="Temperature">
                    {r.waterTempC}°C
                  </Step>
                ) : null}
                {r.grinderModel && (
                  <Step icon="grain" title="Grind">
                    {r.grinderModel}
                    {r.grindSetting ? ` @ ${r.grindSetting}` : ""}
                  </Step>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Reviews</h2>
        {reviews.length === 0 && <p className="muted">No reviews yet.</p>}
        <div className="stack">
          {reviews.map((r) => (
            <div key={r.id} className="review">
              <div className="review-head">
                <span className="review-author">{r.user.username}</span>
                <Stars value={r.rating} />
              </div>
              {r.tastingNotes.length > 0 && (
                <ul className="chips" aria-label="Tasted">
                  {r.tastingNotes.map((n) => (
                    <li key={n} className="chip chip-sm">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
              {r.body && <p className="review-body">{r.body}</p>}
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function Step({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="step">
      <span className="step-icon material-symbols-outlined" aria-hidden>
        {icon}
      </span>
      <div>
        <h4>{title}</h4>
        <p>{children}</p>
      </div>
    </div>
  );
}
