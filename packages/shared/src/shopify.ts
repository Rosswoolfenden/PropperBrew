export const MAX_ORDER_QUANTITY = 10;

/**
 * A Shopify cart permalink: opens the roaster's own checkout with this variant already in the cart.
 * `variantId` is the numeric (legacy) Shopify id we store on shopify_variants.
 * https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks
 */
export function shopifyCartUrl(shopDomain: string, variantId: string, quantity: number): string {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY) {
    throw new RangeError(`quantity must be 1–${MAX_ORDER_QUANTITY}, got ${quantity}`);
  }
  return `https://${shopDomain}/cart/${encodeURIComponent(variantId)}:${quantity}`;
}

/**
 * What a roaster types for their store ("north-star", "north-star.myshopify.com",
 * "https://north-star.myshopify.com/admin") → "north-star.myshopify.com", or null if it can't be one.
 */
export function normalizeShopDomain(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0]!;
  const domain = host.includes(".") ? host : `${host}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : null;
}
