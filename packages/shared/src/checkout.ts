import { z } from "zod";
import { formatGbp } from "./format";
import { MAX_ORDER_QUANTITY } from "./shopify";
/** What a roaster charges for delivery until they set their own rate in the dashboard. */
export const DEFAULT_SHIPPING_PENCE = 395;
/** Working days from order to doorstep we promise, for the arrival estimate. */
export const DELIVERY_WORKING_DAYS = 5;

/** UK postcodes, e.g. "LS1 6DT" or "sw1a1aa". */
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;

export const ShippingAddress = z.object({
  name: z.string().trim().min(1).max(100),
  line1: z.string().trim().min(1).max(120),
  line2: z
    .string()
    .trim()
    .max(120)
    .transform((s) => s || undefined)
    .optional(),
  city: z.string().trim().min(1).max(80),
  postcode: z
    .string()
    .trim()
    .regex(POSTCODE)
    .transform((p) => {
      const compact = p.replace(/\s+/g, "").toUpperCase();
      return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
    }),
});
export type ShippingAddress = z.output<typeof ShippingAddress>;

export const BasketQuantityInput = z.object({
  /** shopify_variants.id */
  variantId: z.uuid(),
  quantity: z.number().int().min(0).max(MAX_ORDER_QUANTITY),
});

export const StartCheckoutInput = z.object({
  address: ShippingAddress,
  /** Where Stripe sends them back to: the website's order page, or the app's. */
  client: z.enum(["web", "app"]).default("web"),
});
export type StartCheckoutInput = z.input<typeof StartCheckoutInput>;

/** A roaster's delivery charge for an order of `subtotalPence`. */
export function shippingFor(subtotalPence: number, roaster: { shippingFlatPence: number | null; freeShippingThresholdPence: number | null }) {
  if (roaster.freeShippingThresholdPence !== null && subtotalPence >= roaster.freeShippingThresholdPence) return 0;
  return roaster.shippingFlatPence ?? DEFAULT_SHIPPING_PENCE;
}

/** PropperBrew's commission on the coffee (not delivery), in pence, rounded to the nearest penny. */
export const platformFee = (subtotalPence: number, commissionBps: number) => Math.round((subtotalPence * commissionBps) / 10_000);

/** The reference people quote: "PB-3F9A21C4". */
export const orderReference = (checkoutId: string) => `PB-${checkoutId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

/** `days` working days (Mon–Fri) after `from`. */
export function addWorkingDays(from: Date, days: number) {
  const date = new Date(from);
  for (let left = days; left > 0; ) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) left--;
  }
  return date;
}

/** A roaster's delivery charges, edited in the business dashboard. */
export const DeliveryInput = z.object({
  roasterId: z.uuid(),
  shippingFlatPence: z.number().int().min(0).max(5_000),
  /** Free delivery on orders of at least this much; null for never. */
  freeShippingThresholdPence: z.number().int().min(0).max(100_000).nullable(),
});
export type DeliveryInput = z.input<typeof DeliveryInput>;

/** "Delivery from Hackney Heights: £3.95, free on orders of £30.00 or more." */
export function deliveryNote(r: { name: string; shippingFlatPence: number | null; freeShippingThresholdPence: number | null }) {
  const flat = r.shippingFlatPence ?? DEFAULT_SHIPPING_PENCE;
  const free = r.freeShippingThresholdPence;
  if (flat === 0 || free === 0) return `Free delivery from ${r.name}.`;
  return `Delivery from ${r.name}: ${formatGbp(flat)}${free !== null ? `, free on orders of ${formatGbp(free)} or more` : ""}.`;
}
