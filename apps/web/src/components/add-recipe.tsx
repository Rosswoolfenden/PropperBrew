"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { refreshCoffeePage } from "@/app/[roaster]/[bean]/actions";
import { useSession, useTRPC } from "@/app/providers";
import { RecipeForm } from "./recipe-form";

/** Share how you brew this coffee: it joins the community recipes on its brewing guide. */
export function AddRecipe({ coffeeBeanId, name, roasterSlug, beanSlug }: { coffeeBeanId: string; name: string; roasterSlug: string; beanSlug: string }) {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const create = useMutation(trpc.recipes.create.mutationOptions());

  if (!ready) return null;
  if (!session) {
    return (
      <p className="muted">
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in</Link> to share your recipe for {name}.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="button button-secondary add-recipe" onClick={() => setOpen(true)}>
        Add your recipe
      </button>
    );
  }
  return (
    <div className="card business-form">
      <RecipeForm
        label="Your recipe"
        heading={`Your recipe for ${name}`}
        coffees={[{ id: coffeeBeanId, name }]}
        submitLabel="Share recipe"
        pendingLabel="Sharing…"
        successText="Shared. It's in the community recipes below."
        onSubmit={async (input) => {
          await create.mutateAsync(input);
          await refreshCoffeePage(roasterSlug, beanSlug);
          router.refresh();
        }}
      />
    </div>
  );
}
