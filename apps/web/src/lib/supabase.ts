import { createClient } from "@supabase/supabase-js";
import { linkErrorFromUrl } from "./auth";

/**
 * Whether this browser had a stored session before the client started. If the client then finds
 * no usable session, it ran out (or was revoked) and we say so, rather than silently signing out.
 */
export const hadStoredSession =
  typeof window !== "undefined" && (() => {
    try {
      return Object.keys(window.localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    } catch {
      return false;
    }
  })();

/** Read before the client tidies the URL: an email link that failed, and why. */
export const initialLinkError = typeof window !== "undefined" ? linkErrorFromUrl(window.location.hash) : null;
/** Arrived from a password-reset link (which signs them in just to choose a new password). */
export const arrivedFromResetLink = typeof window !== "undefined" && new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";

/** Browser auth client. Sessions persist in localStorage; sign-in links land with the session in the URL. */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-anon-key",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } },
);

let signingOut = false;
/** Sign out because they asked to (rather than their session running out). */
export async function signOut() {
  signingOut = true;
  try {
    await supabase.auth.signOut();
  } finally {
    signingOut = false;
  }
}
export const isSigningOut = () => signingOut;
