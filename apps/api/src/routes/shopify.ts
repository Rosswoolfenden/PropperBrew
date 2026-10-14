import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { html } from "hono/html";
import { and, count, eq } from "drizzle-orm";
import { coffeeBeans, roasters } from "@propperbrew/db";
import { slugify } from "@propperbrew/shared";
import { env } from "../env";
import { db } from "../lib/db";
import { encrypt } from "../lib/crypto";
import { adminGraphql } from "../shopify/admin";
import { isValidShopDomain, verifyQueryHmac, verifyWebhookHmac } from "../shopify/hmac";
import { backfillProducts } from "../shopify/sync";
import { enqueueWebhook } from "../shopify/webhooks";

export const shopifyRoutes = new Hono();

const STATE_COOKIE = "shopify_oauth_state";
const callbackUrl = () => new URL("/api/shopify/auth/callback", env.PUBLIC_API_URL).toString();

/**
 * application_url. Shopify sends roasters here when they open the app from their admin
 * (and right after the managed install). Not embedded: a plain status page is enough for MVP.
 */
shopifyRoutes.get("/shopify/app", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const shop = params.get("shop");
  if (!isValidShopDomain(shop) || !verifyQueryHmac(params)) return c.text("Invalid request", 400);

  const roaster = await db.query.roasters.findFirst({ where: eq(roasters.shopifyDomain, shop) });
  if (!roaster?.shopifyAccessTokenEnc) return c.redirect(`/api/shopify/auth?shop=${shop}`);

  const [beans] = await db
    .select({ n: count() })
    .from(coffeeBeans)
    .where(and(eq(coffeeBeans.roasterId, roaster.id), eq(coffeeBeans.isArchived, false)));

  return c.html(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>PropperBrew</title>
        <style>
          body { font: 16px/1.5 system-ui, sans-serif; max-width: 560px; margin: 48px auto; padding: 0 16px; color: #2b211b; }
          .ok { color: #2f7a3e; font-weight: 600; }
        </style>
      </head>
      <body>
        <h1>PropperBrew</h1>
        <p class="ok">✓ ${roaster.name} is connected.</p>
        <p>${beans?.n ?? 0} coffees are live on PropperBrew. New products and stock changes sync automatically.</p>
        <p>Orders from PropperBrew appear in your normal Shopify Orders list, tagged <code>PropperBrew</code>.</p>
      </body>
    </html>`);
});

/** Step 1 of the authorization code grant. */
shopifyRoutes.get("/api/shopify/auth", async (c) => {
  const shop = c.req.query("shop");
  if (!isValidShopDomain(shop)) return c.text("Invalid shop", 400);
  const state = randomBytes(16).toString("hex");
  await setSignedCookie(c, STATE_COOKIE, state, env.SHOPIFY_API_SECRET, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/api/shopify",
  });
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", env.SHOPIFY_API_KEY);
  url.searchParams.set("scope", env.SHOPIFY_SCOPES);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("state", state);
  // No grant_options[]=per-user: we want an offline token for webhooks & order creation.
  return c.redirect(url.toString());
});

/** Step 2: exchange the code for an offline access token, store it, start the product backfill. */
shopifyRoutes.get("/api/shopify/auth/callback", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const shop = params.get("shop");
  const code = params.get("code");
  const expectedState = await getSignedCookie(c, env.SHOPIFY_API_SECRET, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/api/shopify" });

  if (!isValidShopDomain(shop) || !code || !verifyQueryHmac(params)) return c.text("Invalid request", 400);
  if (!expectedState || expectedState !== params.get("state")) return c.text("Invalid OAuth state", 403);

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: env.SHOPIFY_API_KEY, client_secret: env.SHOPIFY_API_SECRET, code }),
  });
  if (!res.ok) return c.text("Token exchange failed", 502);
  const { access_token, scope } = (await res.json()) as { access_token: string; scope: string };

  const { shop: shopInfo } = await adminGraphql<{ shop: { name: string; url: string } }>(
    shop,
    access_token,
    `{ shop { name url } }`,
  );

  const tokenFields = {
    shopifyAccessTokenEnc: encrypt(access_token),
    shopifyScopes: scope,
    shopifyInstalledAt: new Date(),
    shopifyUninstalledAt: null,
    isActive: true,
  };
  const [roaster] = await db
    .insert(roasters)
    .values({
      slug: slugify(shopInfo.name) || slugify(shop.replace(".myshopify.com", "")),
      name: shopInfo.name,
      websiteUrl: shopInfo.url,
      shopifyDomain: shop,
      ...tokenFields,
    })
    .onConflictDoUpdate({ target: roasters.shopifyDomain, set: tokenFields })
    .returning();

  void backfillProducts(roaster!.id)
    .then((n) => console.info(`Backfilled ${n} products for ${shop}`))
    .catch((err) => console.error(`Backfill failed for ${shop}`, err));

  const back = new URL("/shopify/app", env.PUBLIC_API_URL);
  for (const [k, v] of params) if (k !== "code" && k !== "state") back.searchParams.set(k, v);
  return c.redirect(back.toString());
});

/**
 * Every webhook subscription in shopify.app.toml points at /webhooks/shopify/<something>.
 * We dispatch on the X-Shopify-Topic header, so the path suffix is just for readability in logs.
 */
shopifyRoutes.post("/webhooks/shopify/:route", async (c) => {
  const raw = await c.req.text();
  if (!verifyWebhookHmac(raw, c.req.header("x-shopify-hmac-sha256"))) return c.text("Unauthorized", 401);

  const topic = c.req.header("x-shopify-topic");
  const shopDomain = c.req.header("x-shopify-shop-domain");
  const eventId = c.req.header("x-shopify-event-id") ?? c.req.header("x-shopify-webhook-id");
  if (!topic || !shopDomain || !eventId) return c.text("Missing Shopify headers", 400);

  await enqueueWebhook({ eventId, shopDomain, topic, payload: JSON.parse(raw) });
  return c.body(null, 200);
});
