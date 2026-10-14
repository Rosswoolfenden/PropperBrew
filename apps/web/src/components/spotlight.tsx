"use client";

import { useState } from "react";
import type { RouterOutputs } from "@/lib/trpc";

type Roaster = RouterOutputs["roasters"]["discover"][number];

const pad = (n: number) => String(n).padStart(2, "0");

/** Swipe through roasters; the one on screen gets its bio and a link to its coffees underneath. */
export function RoasterSpotlight({ roasters }: { roasters: Roaster[] }) {
  const [index, setIndex] = useState(0);
  const current = roasters[index];

  return (
    <section className="spotlight" aria-label="Roaster spotlight">
      <div className="spotlight-head">
        <span className="eyebrow">Roaster spotlight</span>
        <span className="eyebrow spotlight-counter">
          {pad(index + 1)} / {pad(roasters.length)}
        </span>
      </div>
      <div
        className="spotlight-track"
        onScroll={(e) => {
          const el = e.currentTarget;
          const card = el.firstElementChild as HTMLElement | null;
          if (!card) return;
          setIndex(Math.min(roasters.length - 1, Math.round(el.scrollLeft / (card.offsetWidth + 12))));
        }}
      >
        {roasters.map((r) => {
          const image = r.coffees.find((c) => c.imageUrl)?.imageUrl;
          return (
            <a key={r.id} href={`#roaster-${r.slug}`} className="spotlight-card frame" aria-label={`${r.name}, see their coffees`}>
              {image && <img src={image} alt="" />}
              <span className="spotlight-text">
                <strong>{r.name}</strong>
                {r.city && <span>{r.city}</span>}
              </span>
            </a>
          );
        })}
      </div>
      {current && (
        <div className="spotlight-about">
          {current.bio && <p className="lead">{current.bio}</p>}
          <a href={`#roaster-${current.slug}`} className="rule-link">
            See their coffees
          </a>
        </div>
      )}
    </section>
  );
}
