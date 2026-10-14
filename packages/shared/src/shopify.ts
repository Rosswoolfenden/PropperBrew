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
