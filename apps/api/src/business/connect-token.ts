/**
 * Carries a signed-in business account through Shopify's OAuth redirect, so the store they connect
 * is linked to them. Signed and short-lived; it only ever names the account that asked for it.
 */
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env";

const key = new Uint8Array(Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64"));
const AUDIENCE = "shopify-connect";

export const connectToken = (userId: string) =>
  new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setAudience(AUDIENCE).setExpirationTime("10m").sign(key);

/** The account id, or null if the token is missing, tampered with or expired. */
export async function readConnectToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
