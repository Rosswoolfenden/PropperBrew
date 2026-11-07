"use server";

import { revalidatePath } from "next/cache";

const SLUG = /^[a-z0-9-]{1,80}$/;

/** After a review is posted: rebuild this coffee's page (rating, sensory profile, reviews) and discovery. */
export async function refreshCoffeePage(roasterSlug: string, beanSlug: string) {
  if (!SLUG.test(roasterSlug) || !SLUG.test(beanSlug)) return;
  revalidatePath(`/${roasterSlug}/${beanSlug}`);
  revalidatePath("/");
}
