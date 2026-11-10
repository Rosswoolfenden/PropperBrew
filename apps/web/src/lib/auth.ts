/** Only same-site paths, so a crafted link can't send people elsewhere after signing in. */
export const safeNext = (next: string | undefined | null) => (next && /^\/(?!\/)[\w\-/]*$/.test(next) ? next : "/");

/** Where an email link should bring someone back to on this site. */
export const siteUrl = (path: string) => `${window.location.origin}${path}`;

/**
 * An email link that didn't work lands with the reason in the URL fragment
 * (`#error=access_denied&error_code=otp_expired&…`). Returns what to tell them, or null.
 */
export function linkErrorFromUrl(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("error_code");
  if (!params.get("error") && !code) return null;
  return code === "otp_expired" ? "That link has expired or has already been used." : "That link didn't work.";
}

export { authMessage, MIN_PASSWORD } from "@propperbrew/shared";
