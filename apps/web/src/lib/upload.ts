import type { UploadKind } from "@propperbrew/shared";
import { supabase } from "./supabase";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Upload a photo to the API; returns its URL, ready to attach. Throws with a message to show. */
export async function uploadPhoto(file: File, kind: UploadKind): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const form = new FormData();
  form.set("file", file);
  const res = await fetch(`${apiUrl}/uploads?kind=${kind}`, {
    method: "POST",
    body: form,
    headers: data.session ? { authorization: `Bearer ${data.session.access_token}` } : {},
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? "That photo didn't upload. Try again.");
  return body.url;
}
