import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
export const isValidShopDomain = (shop: string | null | undefined): shop is string =>
  !!shop && SHOP_DOMAIN_RE.test(shop);

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Webhooks: base64 HMAC-SHA256 of the raw body in X-Shopify-Hmac-Sha256. */
export function verifyWebhookHmac(rawBody: string, header: string | undefined): boolean {
  if (!header) return false;
  const digest = createHmac("sha256", env.SHOPIFY_API_SECRET).update(rawBody, "utf8").digest("base64");
  return safeEqual(digest, header);
}

/** OAuth / app-load query strings: hex HMAC of the sorted query minus `hmac`. */
export function verifyQueryHmac(params: URLSearchParams): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", env.SHOPIFY_API_SECRET).update(message).digest("hex");
  return safeEqual(digest, hmac);
}
