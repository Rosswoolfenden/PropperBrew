import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TRPCClientError } from "@trpc/client";
import { formatPriceFrom, humanize, notesSentence } from "@propperbrew/shared";
import { Rating, Stars } from "@/components/rating";
import { ReportButton } from "@/components/report-button";
import { RoasterReviewComposer } from "@/components/roaster-review-composer";
import { api } from "@/lib/trpc";

export const revalidate = 300;

type Params = Promise<{ roaster: string }>;

async function loadRoaster(params: Params) {
  const { roaster } = await params;
  try {
    return await api.roasters.bySlug.query({ slug: roaster });
  } catch (err) {
    if (err instanceof TRPCClientError && err.data?.code === "NOT_FOUND") notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = await loadRoaster(params);
  return {
    title: r.name,
    description: r.tagline ?? `${r.name}${r.city ? ` in ${r.city}` : ""}: their coffees, reviews and brew recipes on PropperBrew.`,
    openGraph: r.heroImageUrl ? { images: [r.heroImageUrl] } : undefined,
  };
}

/** A roaster's public page (Stitch "Roaster Profile"). */
export default async function RoasterPage({ params }: { params: Params }) {
  const r = await loadRoaster(params);
  const roasterReviews = await api.roasterReviews.forRoaster.query({ slug: r.slug });
  const website = r.websiteUrl ? new URL(r.websiteUrl) : null;

  return (
    <article className="roaster-page">
      <div className="roaster-hero frame">
        {r.heroImageUrl && <img src={r.heroImageUrl} alt="" />}
        <div className="roaster-hero-text">
          {r.logoUrl && <img className="roaster-logo" src={r.logoUrl} alt={`${r.name} logo`} />}
          {r.establishedYear && <p className="eyebrow">Established {r.establishedYear}</p>}
          <h1 className="display">{r.name}</h1>
          {r.city && (
            <ul className="chips" aria-label="About">
              <li className="chip chip-sm chip-pill">{r.city}</li>
            </ul>
          )}
        </div>
      </div>

      {(r.tagline || r.bio) && (
        <section className="section-tight roaster-story" aria-labelledby="philosophy">
          <h2 id="philosophy">Our Philosophy</h2>
          {r.tagline && <blockquote>“{r.tagline}”</blockquote>}
          {r.bio && <p className="lead">{r.bio}</p>}
        </section>
      )}

      <section className="section-tight" aria-labelledby="current-roasts">
        <h2 id="current-roasts">Current Roasts</h2>
        {r.coffees.length === 0 ? (
          <p className="muted">No coffees on PropperBrew yet.</p>
        ) : (
          <ul className="roast-grid">
            {r.coffees.map((c) => (
              <li key={c.id}>
                <Link href={`/${r.slug}/${c.slug}`} className="roast-card">
                  <div className="frame frame-contain">{c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" />}</div>
                  {c.roastLevel && <span className="chip chip-sm">{humanize(c.roastLevel)} roast</span>}
                  <h3>{c.name}</h3>
                  {c.tastingNotes.length > 0 && <p className="muted">{notesSentence(c.tastingNotes)}</p>}
                  {c.avgRating !== null && <Rating value={c.avgRating} count={c.reviewCount} />}
                  <span className="roast-price">{c.fromPricePence !== null ? formatPriceFrom(c.fromPricePence, c.priceCount) : "Sold out"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section-tight" aria-labelledby="roaster-reviews">
        <h2 id="roaster-reviews">What People Say</h2>
        {roasterReviews.summary.count > 0 && (
          <div className="roaster-review-summary">
            <Rating value={roasterReviews.summary.rating!} count={roasterReviews.summary.count} />
            <dl>
              {roasterReviews.summary.traceability !== null && (
                <div>
                  <dt className="eyebrow">Traceability</dt>
                  <dd>{roasterReviews.summary.traceability.toFixed(1)} / 5</dd>
                </div>
              )}
              {roasterReviews.summary.shipping !== null && (
                <div>
                  <dt className="eyebrow">Shipping</dt>
                  <dd>{roasterReviews.summary.shipping.toFixed(1)} / 5</dd>
                </div>
              )}
            </dl>
          </div>
        )}
        <RoasterReviewComposer roasterId={r.id} roasterSlug={r.slug} roasterName={r.name} />
        {roasterReviews.reviews.length === 0 ? (
          <p className="muted">No reviews of {r.name} yet.</p>
        ) : (
          <ul className="stack roaster-reviews">
            {roasterReviews.reviews.map((rv) => (
              <li key={rv.id} className="review">
                <div className="review-head">
                  <Link href={`/u/${rv.user.username}`} className="review-author">
                    {rv.user.username}
                  </Link>
                  <Stars value={rv.rating} />
                </div>
                {rv.verifiedPurchase && <span className="eyebrow verified">Verified purchase</span>}
                {(rv.traceability || rv.shipping) && (
                  <p className="muted">
                    {[rv.traceability && `Traceability ${rv.traceability}/5`, rv.shipping && `Shipping ${rv.shipping}/5`].filter(Boolean).join(" · ")}
                  </p>
                )}
                {rv.body && <p className="review-body">“{rv.body}”</p>}
                {rv.notes.length > 0 && (
                  <ul className="chips" aria-label="Notes found">
                    {rv.notes.map((n) => (
                      <li key={n} className="chip chip-sm">
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
                <ReportButton targetType="roaster_review" targetId={rv.id} what={`${rv.user.username}'s review of ${r.name}`} ownerUsername={rv.user.username} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {(r.address || website) && (
        <section className="section-tight" aria-labelledby="visit">
          <h2 id="visit">Visit the Roastery</h2>
          <div className="card visit">
            {r.address && (
              <p className="visit-line">
                <span className="material-symbols-outlined" aria-hidden>
                  location_on
                </span>
                {r.address}
              </p>
            )}
            {website && (
              <a href={website.toString()} className="rule-link" rel="noopener" target="_blank">
                {website.hostname}
              </a>
            )}
          </div>
        </section>
      )}
    </article>
  );
}
