import { and, asc, eq } from "drizzle-orm";
import { basketItems, coffeeBeans, roasters, shopifyVariants, type Db } from "@propperbrew/db";
import { shippingFor } from "@propperbrew/shared";
import { checkoutEnabled } from "./stripe";

/**
 * Whether a variant can be bought here right now: in stock (or roast-to-order), its coffee not
 * archived, and its roaster active and set up to be paid through Stripe.
 */
export function purchasable(row: {
  inStock: boolean;
  alwaysAvailable: boolean;
  isArchived: boolean;
  roasterActive: boolean;
  payoutsEnabled: boolean;
}) {
  return checkoutEnabled && (row.inStock || row.alwaysAvailable) && !row.isArchived && row.roasterActive && row.payoutsEnabled;
}

const columns = {
  variantId: shopifyVariants.id,
  shopifyVariantId: shopifyVariants.shopifyVariantId,
  variantTitle: shopifyVariants.title,
  unitPricePence: shopifyVariants.pricePence,
  inStock: shopifyVariants.inStock,
  alwaysAvailable: shopifyVariants.alwaysAvailable,
  bean: {
    id: coffeeBeans.id,
    slug: coffeeBeans.slug,
    name: coffeeBeans.name,
    imageUrl: coffeeBeans.imageUrl,
    originCountry: coffeeBeans.originCountry,
    roastLevel: coffeeBeans.roastLevel,
    tastingNotes: coffeeBeans.tastingNotes,
  },
  isArchived: coffeeBeans.isArchived,
  roaster: {
    id: roasters.id,
    slug: roasters.slug,
    name: roasters.name,
    shippingFlatPence: roasters.shippingFlatPence,
    freeShippingThresholdPence: roasters.freeShippingThresholdPence,
    commissionBps: roasters.commissionBps,
    stripeAccountId: roasters.stripeAccountId,
  },
  roasterActive: roasters.isActive,
  payoutsEnabled: roasters.stripePayoutsEnabled,
};

/** A variant with everything needed to price it and say whether it can be bought. */
export async function findVariant(db: Db, variantId: string) {
  const [row] = await db
    .select(columns)
    .from(shopifyVariants)
    .innerJoin(coffeeBeans, eq(coffeeBeans.id, shopifyVariants.coffeeBeanId))
    .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
    .where(eq(shopifyVariants.id, variantId));
  return row;
}

/**
 * Someone's basket, grouped by roaster (each roaster ships its own parcel and charges its own
 * delivery). Prices are always today's. Items that can no longer be bought are kept, marked
 * unavailable, and left out of the totals.
 */
export async function loadBasket(db: Db, userId: string) {
  const rows = await db
    .select({ ...columns, quantity: basketItems.quantity, addedAt: basketItems.createdAt })
    .from(basketItems)
    .innerJoin(shopifyVariants, eq(shopifyVariants.id, basketItems.shopifyVariantRowId))
    .innerJoin(coffeeBeans, eq(coffeeBeans.id, shopifyVariants.coffeeBeanId))
    .innerJoin(roasters, eq(roasters.id, coffeeBeans.roasterId))
    .where(eq(basketItems.userId, userId))
    .orderBy(asc(basketItems.createdAt), asc(shopifyVariants.id));

  const groups = new Map<string, { roaster: (typeof rows)[number]["roaster"]; items: ReturnType<typeof toItem>[] }>();
  for (const row of rows) {
    const group = groups.get(row.roaster.id) ?? { roaster: row.roaster, items: [] };
    group.items.push(toItem(row));
    groups.set(row.roaster.id, group);
  }

  const priced = [...groups.values()].map(({ roaster, items }) => {
    const subtotalPence = items.filter((i) => i.available).reduce((sum, i) => sum + i.unitPricePence * i.quantity, 0);
    const shippingPence = subtotalPence > 0 ? shippingFor(subtotalPence, roaster) : 0;
    return { roaster, items, subtotalPence, shippingPence };
  });
  const available = priced.flatMap((g) => g.items).filter((i) => i.available);
  return {
    groups: priced,
    count: available.reduce((n, i) => n + i.quantity, 0),
    hasUnavailable: available.length < rows.length,
    subtotalPence: priced.reduce((sum, g) => sum + g.subtotalPence, 0),
    shippingPence: priced.reduce((sum, g) => sum + g.shippingPence, 0),
    totalPence: priced.reduce((sum, g) => sum + g.subtotalPence + g.shippingPence, 0),
  };
}

function toItem(row: Awaited<ReturnType<typeof findVariant>> & { quantity: number }) {
  return {
    variantId: row.variantId,
    shopifyVariantId: row.shopifyVariantId,
    variantTitle: row.variantTitle,
    unitPricePence: row.unitPricePence,
    quantity: row.quantity,
    bean: row.bean,
    available: purchasable(row),
  };
}

export type Basket = Awaited<ReturnType<typeof loadBasket>>;

/** Basket rows for a user, for clearing what they've just paid for. */
export const basketRow = (userId: string, variantId: string) =>
  and(eq(basketItems.userId, userId), eq(basketItems.shopifyVariantRowId, variantId));
