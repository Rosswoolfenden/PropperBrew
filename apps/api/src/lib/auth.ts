import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../env";

const jwks = createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL));
const hsSecret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;

export type AuthUser = { id: string; email?: string };

/** Verifies a Supabase access token from `Authorization: Bearer <jwt>`. Returns null if absent/invalid. */
export async function userFromAuthHeader(header: string | undefined | null): Promise<AuthUser | null> {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const opts = { audience: "authenticated" };
    const { payload }: { payload: JWTPayload & { email?: string } } = hsSecret
      ? await jwtVerify(token, hsSecret, opts)
      : await jwtVerify(token, jwks, opts);
    return payload.sub ? { id: payload.sub, email: payload.email } : null;
  } catch {
    return null;
  }
}
