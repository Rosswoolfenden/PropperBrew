import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TRPCClientError } from "@trpc/client";
import { BREW_METHOD_LABELS, brewRatio, sensoryLevel } from "@propperbrew/shared";
import { OwnerHeading, ProfileEditor } from "@/components/profile-editor";
import { ReportButton } from "@/components/report-button";
import { Stars } from "@/components/rating";
import { api } from "@/lib/trpc";

// Reviews and recipes are posted from the app too, so always show the latest.
export const dynamic = "force-dynamic";

type Params = Promise<{ username: string }>;

async function load(username: string) {
  try {
    return await api.users.profile.query({ username: decodeURIComponent(username) });
  } catch (err) {
    if (err instanceof TRPCClientError && err.data?.code === "NOT_FOUND") notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await load((await params).username);
  const name = p.displayName ?? p.username;
  return { title: name, description: p.bio ?? `${name}'s coffee reviews and brew recipes on PropperBrew.` };
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export default async function ProfilePage({ params }: { params: Params }) {
  const p = await load((await params).username);
  const name = p.displayName ?? p.username;
  const gear = [p.gear.brewMethod && BREW_METHOD_LABELS[p.gear.brewMethod], p.gear.grinder].filter(Boolean).join(" · ");
  const stats = [
    { label: p.stats.recipes === 1 ? "Recipe" : "Recipes", value: p.stats.recipes },
    { label: p.stats.roasters === 1 ? "Roaster" : "Roasters", value: p.stats.roasters },
    { label: p.stats.reviews === 1 ? "Review" : "Reviews", value: p.stats.reviews },
  ];

  return (
    <>
      <section className="profile-head">
        <div className="avatar" aria-hidden="true">
          {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : name.slice(0, 1).toUpperCase()}
        </div>
        <h1 className="display">{name}</h1>
        <p className="eyebrow">@{p.username}</p>
        {p.bio && <p className="profile-bio">{p.bio}</p>}
        <p className="muted">
          {gear && <>Brews with {gear} · </>}Member since {monthFormat.format(p.memberSince)}
        </p>
      </section>

      <dl className="profile-stats">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="eyebrow">{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>

      <ProfileEditor username={p.username} />
      <div className="profile-report">
        <ReportButton targetType="profile" targetId={p.username} what={`${p.username}'s profile`} ownerUsername={p.username} />
      </div>

      <section className="section" aria-labelledby="reviews-heading">
        <OwnerHeading id="reviews-heading" username={p.username}>
          Reviews
        </OwnerHeading>
        {p.reviews.length === 0 ? (
          <p className="note">No reviews yet.</p>
        ) : (
          <ul className="profile-reviews">
            {p.reviews.map((r) => {
              const acidity = r.flavourScores?.acidity;
              return (
                <li key={r.id} className="profile-review">
                  <div className="review-head">
                    <span className="review-author">{r.bean.roaster.name}</span>
                    <time className="muted" dateTime={r.createdAt.toISOString()}>
                      {dateFormat.format(r.createdAt)}
                    </time>
                  </div>
                  <h3>
                    <Link href={`/${r.bean.roaster.slug}/${r.bean.slug}`}>{r.bean.name}</Link>
                  </h3>
                  {(r.tastingNotes.length > 0 || acidity) && (
                    <div className="flavour-panel">
                      {r.tastingNotes.length > 0 && (
                        <div>
                          <span className="eyebrow">Flavour profile</span>
                          <ul className="chips" aria-label="Tasted">
                            {r.tastingNotes.map((n) => (
                              <li key={n} className="chip chip-sm">
                                {n}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {acidity && (
                        <div className="flavour-acidity" aria-label={`Acidity ${acidity} of 5, ${sensoryLevel("acidity", acidity)}`}>
                          <span className="eyebrow">Acidity</span>
                          <div className="bar">
                            <span style={{ width: `${(acidity / 5) * 100}%` }} />
                          </div>
                          <span>{sensoryLevel("acidity", acidity)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <Stars value={r.rating} />
                  {r.body && <blockquote className="review-body">“{r.body}”</blockquote>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="recipes-heading">
        <OwnerHeading id="recipes-heading" username={p.username}>
          Recipes
        </OwnerHeading>
        {p.recipes.length === 0 ? (
          <p className="note">No recipes yet.</p>
        ) : (
          <ul className="rec-list">
            {p.recipes.map((r) => (
              <li key={r.id} className="rec-line">
                <div>
                  <strong>{BREW_METHOD_LABELS[r.brewMethod]}</strong>
                  <span className="muted">
                    {" "}
                    for <Link href={`/${r.bean.roaster.slug}/${r.bean.slug}`}>{r.bean.name}</Link>
                  </span>
                  <div className="muted">
                    {r.coffeeDoseG}g → {r.waterWeightG}g ({brewRatio(r.coffeeDoseG, r.waterWeightG)})
                    {r.waterTempC ? ` · ${r.waterTempC}°C` : ""}
                  </div>
                </div>
                <span className="upvotes" aria-label={`${r.upvotesCount} upvotes`}>
                  ↑ {r.upvotesCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
