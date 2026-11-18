"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BREW_METHOD_LABELS, brewRatio } from "@propperbrew/shared";
import { refreshRoasterPages } from "@/app/[roaster]/actions";
import { useTRPC } from "@/app/providers";
import type { RouterOutputs } from "@/lib/trpc";
import { RecipeForm } from "../recipe-form";

type Roaster = RouterOutputs["business"]["me"]["roasters"][number];
/** The roaster's own recommended recipes ("Roaster's pick"): list, remove, and add. */
export function Recommendations({ roaster }: { roaster: Roaster }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = async (beanSlug: string) => {
    await refreshRoasterPages(roaster.slug, beanSlug);
    await queryClient.invalidateQueries({ queryKey: trpc.business.pathKey() });
  };
  const remove = useMutation(trpc.business.deleteRecommendation.mutationOptions());
  const add = useMutation(trpc.business.addRecommendation.mutationOptions());

  return (
    <section className="card business-form" aria-label="Your recommendations">
      <div className="card-head">
        <h3>Your recommendations</h3>
      </div>
      <p className="muted">Recipes you recommend show first on your coffees as &ldquo;Roaster&apos;s pick&rdquo;.</p>
      {roaster.recommendations.length === 0 ? (
        <p className="note">No recommendations yet.</p>
      ) : (
        <ul className="rec-list">
          {roaster.recommendations.map((r) => (
            <li key={r.id} className="rec-line">
              <div>
                <strong>{BREW_METHOD_LABELS[r.brewMethod]}</strong>
                <span className="muted"> for {r.bean.name}</span>
                <div className="muted">
                  {r.coffeeDoseG}g → {r.waterWeightG}g ({brewRatio(r.coffeeDoseG, r.waterWeightG)})
                  {r.waterTempC ? ` · ${r.waterTempC}°C` : ""} · ↑ {r.upvotesCount}
                </div>
              </div>
              <button
                type="button"
                className="text-button"
                aria-label={`Remove ${BREW_METHOD_LABELS[r.brewMethod]} for ${r.bean.name}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ recipeId: r.id }, { onSuccess: () => refresh(r.bean.slug) })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {roaster.coffees.some((c) => c.status !== "archived") && (
        <RecipeForm
          label="New recommendation"
          heading="Recommend a recipe"
          coffees={roaster.coffees.filter((c) => c.status !== "archived")}
          submitLabel="Post recommendation"
          pendingLabel="Posting…"
          successText="Posted. It shows first on that coffee's brewing guide."
          onSubmit={async (input) => {
            await add.mutateAsync(input);
            await refresh(roaster.coffees.find((c) => c.id === input.coffeeBeanId)!.slug);
          }}
        />
      )}
    </section>
  );
}
