import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { orders, profiles, roasters, shopifyProducts, shopifyVariants, webhookEvents } from "@propperbrew/db";
import { db } from "../lib/db";
import { sendExpoPush } from "../lib/push";
import { fromRestProduct, type RestProduct } from "./normalize";
import { archiveProduct, syncInventoryLevel, syncProduct } from "./sync";

const MAX_ATTEMPTS = 5;

/**
 * Persist the webhook, then process it after the HTTP response has gone out.
 * Shopify gives us 5 seconds; LLM enrichment alone can take longer.
 * Returns false if this event id was already seen (Shopify retries/duplicates).
 */
export async function enqueueWebhook(event: {
  eventId: string;
  shopDomain: string;
  topic: string;
  payload: unknown;
}): Promise<boolean> {
  const inserted = await db
    .insert(webhookEvents)
    .values(event)
    .onConflictDoNothing()
    .returning({ eventId: webhookEvents.eventId });
  if (inserted.length === 0) return false;
  setImmediate(() => void processWebhook(event.eventId));
  return true;
}

async function processWebhook(eventId: string): Promise<void> {
  // Claim the event so the sweeper and the immediate path don't both run it.
  const [event] = await db
    .update(webhookEvents)
    .set({ attempts: sql`${webhookEvents.attempts} + 1` })
    .where(and(eq(webhookEvents.eventId, eventId), isNull(webhookEvents.processedAt)))
    .returning();
  if (!event) return;
  try {
    await handleTopic(event.topic, event.shopDomain, event.payload);
    await db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.eventId, eventId));
  } catch (err) {
    console.error(`Webhook ${event.topic} (${eventId}) from ${event.shopDomain} failed`, err);
    await db
      .update(webhookEvents)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.eventId, eventId));
  }
}

/** Retries failed / interrupted events (e.g. the machine restarted mid-enrichment). */
export function startWebhookSweeper(intervalMs = 60_000): NodeJS.Timeout {
  return setInterval(async () => {
    const stale = await db
      .select({ eventId: webhookEvents.eventId })
      .from(webhookEvents)
      .where(
        and(
          isNull(webhookEvents.processedAt),
          lt(webhookEvents.attempts, MAX_ATTEMPTS),
          lt(webhookEvents.receivedAt, sql`now() - interval '1 minute'`),
        ),
      )
      .limit(20);
    for (const { eventId } of stale) await processWebhook(eventId);
  }, intervalMs);
}

async function roasterForShop(shopDomain: string) {
  const roaster = await db.query.roasters.findFirst({ where: eq(roasters.shopifyDomain, shopDomain) });
  if (!roaster) throw new Error(`No roaster for shop ${shopDomain}`);
  return roaster;
}

async function handleTopic(topic: string, shopDomain: string, payload: any): Promise<void> {
  switch (topic) {
    case "products/create":
    case "products/update": {
      const roaster = await roasterForShop(shopDomain);
      await syncProduct(roaster, fromRestProduct(payload as RestProduct));
      return;
    }
    case "products/delete": {
      const roaster = await roasterForShop(shopDomain);
      await archiveProduct(roaster.id, String(payload.id));
      return;
    }
    case "inventory_levels/update":
      await syncInventoryLevel(String(payload.inventory_item_id), payload.available);
      return;
    case "orders/fulfilled":
    case "orders/partially_fulfilled":
      await markOrderFulfilled(shopDomain, String(payload.id), topic === "orders/fulfilled" ? "fulfilled" : "partially_fulfilled");
      return;
    case "fulfillments/create":
      await notifyShipped(shopDomain, String(payload.order_id), payload.tracking_url ?? null);
      return;
    case "app/uninstalled":
      await handleUninstall(shopDomain);
      return;
    case "customers/data_request":
    case "customers/redact":
      // We never read Shopify customer records; orders we push are our own users' data,
      // handled through PropperBrew's own account deletion/export flows.
      console.info(`GDPR ${topic} for ${shopDomain}: no Shopify customer data held`);
      return;
    case "shop/redact":
      await db
        .update(roasters)
        .set({ shopifyAccessTokenEnc: null, shopifyScopes: null, isActive: false })
        .where(eq(roasters.shopifyDomain, shopDomain));
      return;
    default:
      console.warn(`Unhandled Shopify webhook topic ${topic}`);
  }
}

async function findOrder(shopDomain: string, shopifyOrderId: string) {
  const roaster = await roasterForShop(shopDomain);
  return db.query.orders.findFirst({
    where: and(eq(orders.roasterId, roaster.id), eq(orders.shopifyOrderId, shopifyOrderId)),
  });
}

async function markOrderFulfilled(shopDomain: string, shopifyOrderId: string, status: "fulfilled" | "partially_fulfilled") {
  // Orders placed directly on the roaster's own store aren't ours — ignore them.
  const order = await findOrder(shopDomain, shopifyOrderId);
  if (!order) return;
  await db.update(orders).set({ status }).where(eq(orders.id, order.id));
}

async function notifyShipped(shopDomain: string, shopifyOrderId: string, trackingUrl: string | null) {
  const order = await findOrder(shopDomain, shopifyOrderId);
  if (!order) return;
  const [user, roaster] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(profiles.id, order.userId) }),
    db.query.roasters.findFirst({ where: eq(roasters.id, order.roasterId) }),
  ]);
  if (!user?.expoPushToken) return;
  await sendExpoPush(user.expoPushToken, {
    title: "Your beans are on the way ☕",
    body: `${roaster?.name ?? "Your roaster"} has roasted & shipped your order.`,
    data: { orderId: order.id, trackingUrl },
  });
}

async function handleUninstall(shopDomain: string) {
  const [roaster] = await db
    .update(roasters)
    .set({ shopifyAccessTokenEnc: null, shopifyScopes: null, shopifyUninstalledAt: new Date() })
    .where(eq(roasters.shopifyDomain, shopDomain))
    .returning();
  if (!roaster) return;
  // Beans, reviews and recipes stay; nothing is buyable until they reinstall.
  const productIds = db
    .select({ id: shopifyProducts.id })
    .from(shopifyProducts)
    .where(eq(shopifyProducts.roasterId, roaster.id));
  await db.update(shopifyVariants).set({ inStock: false }).where(inArray(shopifyVariants.shopifyProductRowId, productIds));
}
