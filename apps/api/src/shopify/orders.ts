import type { ShippingAddress } from "@propperbrew/shared";
import { adminForRoaster, ShopifyAdminError } from "./admin";

const ORDER_CREATE = /* GraphQL */ `
  mutation PropperBrewOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order { id name }
      userErrors { field message }
    }
  }
`;

const money = (pence: number) => ({ shopMoney: { amount: (pence / 100).toFixed(2), currencyCode: "GBP" } });

/** "Jo Bloggs Smith" → first "Jo Bloggs", last "Smith". Shopify wants a last name. */
function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! } : { firstName: "", lastName: parts[0]! };
}

/**
 * Creates the paid order in the roaster's Shopify store, so they pick, pack and ship it like any
 * other order. Shopify sends the customer their shipping updates; we don't send a receipt (Stripe
 * and our confirmation page already did).
 */
export async function createShopifyOrder(input: {
  roasterId: string;
  reference: string;
  email: string;
  address: ShippingAddress;
  lines: { shopifyVariantId: string; quantity: number; unitPricePence: number }[];
  shippingPence: number;
  totalPence: number;
}) {
  const admin = await adminForRoaster(input.roasterId);
  const address = { ...splitName(input.address.name), address1: input.address.line1, address2: input.address.line2, city: input.address.city, zip: input.address.postcode, countryCode: "GB" };
  const data = await admin<{ orderCreate: { order: { id: string; name: string } | null; userErrors: { field: string[] | null; message: string }[] } }>(ORDER_CREATE, {
    order: {
      email: input.email,
      currency: "GBP",
      lineItems: input.lines.map((l) => ({ variantId: `gid://shopify/ProductVariant/${l.shopifyVariantId}`, quantity: l.quantity, priceSet: money(l.unitPricePence) })),
      shippingAddress: address,
      billingAddress: address,
      shippingLines: [{ title: "Delivery", code: "PROPPERBREW", priceSet: money(input.shippingPence) }],
      financialStatus: "PAID",
      transactions: [{ kind: "SALE", status: "SUCCESS", gateway: "PropperBrew", amountSet: money(input.totalPence) }],
      sourceIdentifier: input.reference,
      note: `Paid through PropperBrew (${input.reference}).`,
      tags: ["PropperBrew"],
    },
    options: { inventoryBehaviour: "DECREMENT_OBEYING_POLICY", sendReceipt: false, sendFulfillmentReceipt: true },
  });
  const { order, userErrors } = data.orderCreate;
  if (!order || userErrors.length > 0) throw new ShopifyAdminError(`orderCreate: ${userErrors.map((e) => e.message).join("; ") || "no order returned"}`);
  return order;
}
