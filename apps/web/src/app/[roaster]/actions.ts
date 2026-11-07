"use server";

import { revalidatePath } from "next/cache";

const SLUG = /^[a-z0-9-]{1,80}$/;

/** After a roaster edits their profile or recommendations: rebuild their page, a coffee page, and discovery. */
export async function refreshRoasterPages(roasterSlug: string, beanSlug?: string) {
  if (!SLUG.test(roasterSlug) || (beanSlug !== undefined && !SLUG.test(beanSlug))) return;
  revalidatePath(`/${roasterSlug}`);
  if (beanSlug) revalidatePath(`/${roasterSlug}/${beanSlug}`);
  revalidatePath("/");
}
