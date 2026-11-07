import { env } from "../env";

/** Where a shop's OAuth and Admin API live: https://<shop>, or the fake Shopify in tests. */
export const shopOrigin = (shop: string) =>
  env.SHOPIFY_ORIGIN_OVERRIDE ? `${env.SHOPIFY_ORIGIN_OVERRIDE.replace(/\/$/, "")}/${shop}` : `https://${shop}`;
