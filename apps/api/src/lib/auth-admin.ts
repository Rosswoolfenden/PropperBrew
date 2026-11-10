/**
 * The auth service's admin API: for "Continue with Shopify" (Shopify vouches for the person, so we
 * find or create their account and hand them a one-time sign-in link), and for deleting accounts.
 */
import { sql } from "drizzle-orm";
import { SignJWT } from "jose";
import { env } from "../env";
import { db } from "./db";

export async function serviceRoleToken(): Promise<string> {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_JWT_SECRET) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY to use the auth admin API");
  // Short-lived and only ever sent to our own auth service.
  return new SignJWT({ role: "service_role" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("propperbrew-api")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));
}

async function admin<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(new URL(`/auth/v1/admin/${path}`, env.SUPABASE_URL), {
    method,
    headers: { authorization: `Bearer ${await serviceRoleToken()}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Auth admin ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Delete an account from the auth service. Their profile and everything that cascades from it goes too. */
export async function deleteAuthUser(userId: string) {
  await admin(`users/${userId}`, undefined, "DELETE");
}

/** The account for `email`, creating a confirmed business account if there isn't one. */
export async function ensureAccount(email: string): Promise<string> {
  const [existing] = await db.execute<{ id: string }>(sql`select id from auth.users where lower(email) = lower(${email}) limit 1`);
  if (existing) return existing.id;
  const user = await admin<{ id: string }>("users", {
    email,
    email_confirm: true,
    user_metadata: { account_type: "business" },
  });
  return user.id;
}

/** A one-time link that signs `email` in and lands on `redirectTo`. */
export async function signInLink(email: string, redirectTo: string): Promise<string> {
  const { action_link } = await admin<{ action_link: string }>("generate_link", {
    type: "magiclink",
    email,
    redirect_to: redirectTo,
  });
  return action_link;
}
