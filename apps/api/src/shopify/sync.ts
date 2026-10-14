import { createHash } from "node:crypto";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { coffeeBeans, roasters, shopifyProducts, shopifyVariants } from "@propperbrew/db";
import { slugify, type ExtractedBeanSpecs } from "@propperbrew/shared";
import { env } from "../env";
import { db } from "../lib/db";
import { extractBeanSpecs } from "../enrichment/claude";
import { adminForRoaster } from "./admin";
import {
  fromGqlProduct,
  parseGrind,
  parseWeightG,
  PRODUCTS_QUERY,
  type GqlProductsPage,
  type NormalizedProduct,
} from "./normalize";

type Roaster = typeof roasters.$inferSelect;

const contentHash = (p: NormalizedProduct) =>
  createHash("sha256").update(`${p.title}\n${p.bodyHtml}`).digest("hex");

function specsToColumns(specs: ExtractedBeanSpecs) {
  return {
    originCountry: specs.originCountry,
    region: specs.region,
    producer: specs.producer,
    process: specs.process,
    roastLevel: specs.roastLevel,
    varietals: specs.varietals,
    altitudeMasl: specs.altitudeMasl,
    decaf: specs.decaf,
    isBlend: specs.isBlend,
    tastingNotes: specs.tastingNotes,
  };
}

/**
 * Resolve which canonical CoffeeBean a Shopify product currently represents.
 * Roasters often reuse one product for successive seasonal lots, so a name change
 * means a *new* bean (the old one is archived, keeping its reviews and recipes).
 * Returns `null` for non-coffee products (merch, equipment, gift cards).
 */
async function resolveBean(
  roaster: Roaster,
  product: NormalizedProduct,
  existing: typeof shopifyProducts.$inferSelect | undefined,
): Promise<string | null> {
  const hash = contentHash(product);
  if (existing && existing.contentHash === hash) return existing.coffeeBeanId;

  let specs: ExtractedBeanSpecs | null = null;
  if (env.ANTHROPIC_API_KEY) {
    specs = await extractBeanSpecs({
      roasterName: roaster.name,
      title: product.title,
      bodyHtml: product.bodyHtml,
      variantTitles: product.variants.map((v) => v.title),
    });
    if (!specs.isCoffeeBean) return null;
  }

  const name = specs?.beanName?.trim() || product.title;
  const slug = slugify(name);
  const columns = specs ? specsToColumns(specs) : {};

  const content = { description: product.bodyHtml, imageUrl: product.imageUrl };

  const match = await db.query.coffeeBeans.findFirst({
    where: and(eq(coffeeBeans.roasterId, roaster.id), eq(coffeeBeans.slug, slug)),
  });
  let beanId: string;
  if (match) {
    // Don't clobber specs a human has verified.
    await db
      .update(coffeeBeans)
      .set({ ...content, isArchived: false, ...(match.specsVerified ? {} : columns) })
      .where(eq(coffeeBeans.id, match.id));
    beanId = match.id;
  } else {
    const [created] = await db
      .insert(coffeeBeans)
      .values({ roasterId: roaster.id, slug, name, ...content, ...columns })
      .returning({ id: coffeeBeans.id });
    beanId = created!.id;
  }

  if (existing?.coffeeBeanId && existing.coffeeBeanId !== beanId) {
    await db.update(coffeeBeans).set({ isArchived: true }).where(eq(coffeeBeans.id, existing.coffeeBeanId));
  }
  return beanId;
}

/** Upsert a product + its variants. Called from webhooks and the install backfill. */
export async function syncProduct(roaster: Roaster, product: NormalizedProduct): Promise<void> {
  const existing = await db.query.shopifyProducts.findFirst({
    where: and(
      eq(shopifyProducts.roasterId, roaster.id),
      eq(shopifyProducts.shopifyProductId, product.shopifyProductId),
    ),
  });

  const beanId = await resolveBean(roaster, product, existing);
  const active = product.status === null || product.status === "active";

  const [row] = await db
    .insert(shopifyProducts)
    .values({
      roasterId: roaster.id,
      shopifyProductId: product.shopifyProductId,
      coffeeBeanId: beanId,
      handle: product.handle,
      title: product.title,
      status: product.status,
      contentHash: contentHash(product),
    })
    .onConflictDoUpdate({
      target: [shopifyProducts.roasterId, shopifyProducts.shopifyProductId],
      set: {
        coffeeBeanId: beanId,
        handle: product.handle,
        title: product.title,
        status: product.status,
        contentHash: contentHash(product),
        deletedAt: null,
      },
    })
    .returning({ id: shopifyProducts.id });

  if (beanId) {
    await db.update(coffeeBeans).set({ isArchived: !active }).where(eq(coffeeBeans.id, beanId));
  }

  for (const v of product.variants) {
    const texts = [...v.options, v.title];
    const values = {
      shopifyProductRowId: row!.id,
      coffeeBeanId: beanId,
      shopifyVariantId: v.shopifyVariantId,
      shopifyInventoryItemId: v.inventoryItemId,
      title: v.title,
      weightG: parseWeightG(texts),
      grindOption: parseGrind(texts),
      pricePence: v.pricePence,
      inStock: active && v.inStock,
      alwaysAvailable: v.alwaysAvailable,
    };
    const { shopifyVariantId: _, ...update } = values;
    await db.insert(shopifyVariants).values(values).onConflictDoUpdate({ target: shopifyVariants.shopifyVariantId, set: update });
  }

  // Variants removed on Shopify: keep the row (order history references it) but make it unbuyable.
  const liveIds = product.variants.map((v) => v.shopifyVariantId);
  await db
    .update(shopifyVariants)
    .set({ inStock: false })
    .where(
      and(
        eq(shopifyVariants.shopifyProductRowId, row!.id),
        liveIds.length ? notInArray(shopifyVariants.shopifyVariantId, liveIds) : undefined,
      ),
    );
}

/** products/delete: archive the bean (reviews & recipes stay live) and disable buying. */
export async function archiveProduct(roasterId: string, shopifyProductId: string): Promise<void> {
  const [product] = await db
    .update(shopifyProducts)
    .set({ deletedAt: new Date() })
    .where(and(eq(shopifyProducts.roasterId, roasterId), eq(shopifyProducts.shopifyProductId, shopifyProductId)))
    .returning();
  if (!product) return;
  await db.update(shopifyVariants).set({ inStock: false }).where(eq(shopifyVariants.shopifyProductRowId, product.id));
  if (product.coffeeBeanId) {
    await db.update(coffeeBeans).set({ isArchived: true }).where(eq(coffeeBeans.id, product.coffeeBeanId));
  }
}

/** inventory_levels/update only identifies the inventory item, not the variant. */
export async function syncInventoryLevel(inventoryItemId: string, available: number | null): Promise<void> {
  await db
    .update(shopifyVariants)
    .set({ inStock: sql`${shopifyVariants.alwaysAvailable} or ${(available ?? 0) > 0}` })
    .where(eq(shopifyVariants.shopifyInventoryItemId, inventoryItemId));
}

/** Initial import after install. */
export async function backfillProducts(roasterId: string): Promise<number> {
  const roaster = await db.query.roasters.findFirst({ where: eq(roasters.id, roasterId) });
  if (!roaster) throw new Error(`Unknown roaster ${roasterId}`);
  const gql = await adminForRoaster(roasterId);
  let cursor: string | null = null;
  let count = 0;
  do {
    const page: GqlProductsPage = await gql<GqlProductsPage>(PRODUCTS_QUERY, { cursor });
    for (const node of page.products.nodes) {
      try {
        await syncProduct(roaster, fromGqlProduct(node));
        count++;
      } catch (err) {
        console.error(`Backfill: failed to sync product ${node.legacyResourceId} for ${roaster.slug}`, err);
      }
    }
    cursor = page.products.pageInfo.hasNextPage ? page.products.pageInfo.endCursor : null;
  } while (cursor);
  return count;
}
