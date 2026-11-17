import Link from "next/link";
import { BREW_METHOD_LABELS } from "@propperbrew/shared";
import { Stars } from "@/components/rating";
import type { RouterOutputs } from "@/lib/trpc";

type Roaster = RouterOutputs["business"]["me"]["roasters"][number];

/** What people are saying: reviews of the roastery and of its coffees, and community recipes. */
export function Feedback({ roaster }: { roaster: Roaster }) {
  const { reviews, recipes, roasterReviews } = roaster.feedback;
  return (
    <section className="card business-form" aria-label="What people are saying">
      <div className="card-head">
        <h3>What people are saying</h3>
      </div>
      <h4 className="eyebrow">About {roaster.name}</h4>
      {roasterReviews.length === 0 ? (
        <p className="note">No reviews of your roastery yet.</p>
      ) : (
        <ul className="feedback-list" aria-label="Reviews of your roastery">
          {roasterReviews.map((r) => (
            <li key={r.id} className="feedback-item">
              <div className="feedback-head">
                <strong>{r.username}</strong>
                <Stars value={r.rating} />
              </div>
              {(r.traceability || r.shipping) && (
                <p className="muted">{[r.traceability && `Traceability ${r.traceability}/5`, r.shipping && `Shipping ${r.shipping}/5`].filter(Boolean).join(" · ")}</p>
              )}
              {r.body && <p className="muted">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
      <h4 className="eyebrow">Latest reviews of your coffees</h4>
      {reviews.length === 0 ? (
        <p className="note">No reviews of your coffees yet.</p>
      ) : (
        <ul className="feedback-list">
          {reviews.map((r) => (
            <li key={r.id} className="feedback-item">
              <div className="feedback-head">
                <span>
                  <strong>{r.username}</strong> on <Link href={`/${roaster.slug}/${r.bean.slug}`}>{r.bean.name}</Link>
                </span>
                <Stars value={r.rating} />
              </div>
              {r.body && <p className="muted">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
      <h4 className="eyebrow">Community recipes</h4>
      {recipes.length === 0 ? (
        <p className="note">No community recipes for your coffees yet.</p>
      ) : (
        <ul className="feedback-list">
          {recipes.map((r) => (
            <li key={r.id} className="feedback-item feedback-head">
              <span>
                <strong>{r.username}</strong>&apos;s {BREW_METHOD_LABELS[r.brewMethod]} for{" "}
                <Link href={`/${roaster.slug}/${r.bean.slug}`}>{r.bean.name}</Link>
              </span>
              <span className="muted">↑ {r.upvotesCount}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
