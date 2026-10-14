import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TRPCClientError } from "@trpc/client";
import { BREW_METHOD_LABELS, brewRatio, formatAltitude, formatPriceFrom, humanize } from "@propperbrew/shared";
import { OrderForm } from "@/components/order-form";
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
    api.recipes.forBean.query({ coffeeBeanId: bean.id, limit: 10 }),
  ]);

  const specs: [string, string | null][] = [
    ["Roaster", [bean.roaster.name, bean.roaster.city].filter(Boolean).join(", ")],
    ["Region", [bean.region, bean.originCountry].filter(Boolean).join(", ") || null],
    ["Producer", bean.producer],
    ["Altitude", bean.altitudeMasl ? formatAltitude(bean.altitudeMasl) : null],
    ["Process", bean.process && humanize(bean.process)],
    ["Varietals", bean.varietals.join(", ") || null],
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
  const [firstVariant, ...otherVariants] = bean.variants;
  const orderable =
    firstVariant && bean.checkoutDomain ? { variants: [firstVariant, ...otherVariants] as const, domain: bean.checkoutDomain } : null;
  const subtitle = [bean.originCountry, bean.roastLevel && `${humanize(bean.roastLevel)} roast`].filter(Boolean).join(" • ");

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="bean">
        <div className="frame">{bean.imageUrl && <img src={bean.imageUrl} alt={bean.name} />}</div>
        <div className="bean-info">
          <div className="title-row">
            <h1 className="display">{bean.name}</h1>
            {lowestPrice !== null && <span className="price">{formatPriceFrom(lowestPrice, new Set(prices).size)}</span>}
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
            <h2>Order</h2>
            {orderable ? (
              <OrderForm variants={orderable.variants} checkoutDomain={orderable.domain} roasterName={bean.roaster.name} />
            ) : (
              <p className="note">This lot has sold out. Reviews and recipes stay here for reference.</p>
            )}
          </section>
        </div>
      </div>

      <section className="section">
        <h2>Brewing guide</h2>
        {recipes.length === 0 && <p className="muted">No recipes yet — be the first to share your dial-in.</p>}
        {[
          { label: "From the roaster", items: recipes.filter((r) => r.author.type === "roaster") },
          { label: "From the community", items: recipes.filter((r) => r.author.type === "user") },
        ]
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <section key={group.label} className="recipe-group" aria-label={group.label}>
              <h3 className="eyebrow">{group.label}</h3>
              <div className="stack">
                {group.items.map((r) => (
                  <div key={r.id} className="card">
                    <div className="card-head">
                      <div className="card-title">
                        {r.author.type === "roaster" && <span className="chip chip-sm">Roaster&apos;s pick</span>}
                        <h3>{BREW_METHOD_LABELS[r.brewMethod]}</h3>
                        <span className="eyebrow">By {r.author.type === "roaster" ? r.author.name : r.author.username}</span>
                      </div>
                      <span className="upvotes" aria-label={`${r.upvotesCount} upvotes`}>
                        ↑ {r.upvotesCount}
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
                      {r.grinderModel || r.grindSetting ? (
                        <Step icon="grain" title="Grind">
                          {[r.grinderModel, r.grindSetting].filter(Boolean).join(" @ ")}
                        </Step>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
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
