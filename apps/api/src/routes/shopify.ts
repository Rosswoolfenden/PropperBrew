import { randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { html } from "hono/html";
import { and, count, eq } from "drizzle-orm";
import { coffeeBeans, roasters } from "@propperbrew/db";
import { slugify } from "@propperbrew/shared";
import { env } from "../env";
import { db } from "../lib/db";
import { encrypt } from "../lib/crypto";
import { readConnectToken } from "../business/connect-token";
import { joinRoaster } from "../business/members";
import { ensureAccount, signInLink } from "../lib/auth-admin";
import { adminGraphql } from "../shopify/admin";
import { shopOrigin } from "../shopify/origin";
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

/**
 * What we remember across the OAuth redirect (in a signed, short-lived cookie):
 * - install: the app being installed or re-authorised. `link` (a connect token) ties the store
 *   to the signed-in business account that started it from the dashboard.
 * - login: "Continue with Shopify". Shopify vouches for the staff member; we sign them in.
 */
type OAuthState = { state: string; mode: "install" | "login"; link?: string };

const webUrl = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(path, env.PUBLIC_WEB_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
};

async function startOAuth(c: Context, shop: string, state: OAuthState) {
  await setSignedCookie(c, STATE_COOKIE, JSON.stringify(state), env.SHOPIFY_API_SECRET, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/api/shopify",
  });
  const url = new URL(`${shopOrigin(shop)}/admin/oauth/authorize`);
  url.searchParams.set("client_id", env.SHOPIFY_API_KEY);
  url.searchParams.set("scope", env.SHOPIFY_SCOPES);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("state", state.state);
  // Install: an offline token for webhooks & order creation. Login: an online token, which
  // comes with the staff member who approved it.
  if (state.mode === "login") url.searchParams.append("grant_options[]", "per-user");
  return c.redirect(url.toString());
}

/** Step 1 of the authorization code grant: install, or connect a store to a business account. */
shopifyRoutes.get("/api/shopify/auth", async (c) => {
  const shop = c.req.query("shop");
  if (!isValidShopDomain(shop)) return c.text("Invalid shop", 400);
  const link = c.req.query("link");
  return startOAuth(c, shop, { state: randomBytes(16).toString("hex"), mode: "install", ...(link ? { link } : {}) });
});

/** "Continue with Shopify": sign in as a member of a roaster that's already on PropperBrew. */
shopifyRoutes.get("/api/shopify/login", async (c) => {
  const shop = c.req.query("shop");
  if (!isValidShopDomain(shop)) return c.redirect(webUrl("/business", { error: "invalid-shop" }));
  return startOAuth(c, shop, { state: randomBytes(16).toString("hex"), mode: "login" });
});

/** Step 2: exchange the code for an access token, then finish the install or the sign-in. */
shopifyRoutes.get("/api/shopify/auth/callback", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const shop = params.get("shop");
  const code = params.get("code");
  const saved = await getSignedCookie(c, env.SHOPIFY_API_SECRET, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/api/shopify" });

  if (!isValidShopDomain(shop) || !code || !verifyQueryHmac(params)) return c.text("Invalid request", 400);
  const expected = parseState(saved);
  if (!expected || expected.state !== params.get("state")) return c.text("Invalid OAuth state", 403);

  const res = await fetch(`${shopOrigin(shop)}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: env.SHOPIFY_API_KEY, client_secret: env.SHOPIFY_API_SECRET, code }),
  });
  if (!res.ok) return c.text("Token exchange failed", 502);
  const grant = (await res.json()) as {
    access_token: string;
    scope: string;
    associated_user?: { email?: string; email_verified?: boolean };
  };

  return expected.mode === "login" ? finishLogin(c, shop, grant.associated_user) : finishInstall(c, shop, grant, expected, params);
});

function parseState(raw: string | false | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as OAuthState;
    return typeof value.state === "string" && (value.mode === "install" || value.mode === "login") ? value : null;
  } catch {
    return null;
  }
}

async function finishInstall(
  c: Context,
  shop: string,
  grant: { access_token: string; scope: string },
  state: OAuthState,
  params: URLSearchParams,
) {
  const { shop: shopInfo } = await adminGraphql<{ shop: { name: string; url: string } }>(
    shop,
    grant.access_token,
    `{ shop { name url } }`,
  );

  const tokenFields = {
    shopifyAccessTokenEnc: encrypt(grant.access_token),
    shopifyScopes: grant.scope,
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

  // Started from the business dashboard: link the store to that account and go back there.
  if (state.link) {
    const userId = await readConnectToken(state.link);
    if (!userId) return c.redirect(webUrl("/business/dashboard", { error: "link-expired" }));
    await joinRoaster(db, roaster!.id, userId);
    return c.redirect(webUrl("/business/dashboard", { connected: roaster!.slug }));
  }

  const back = new URL("/shopify/app", env.PUBLIC_API_URL);
  for (const [k, v] of params) if (k !== "code" && k !== "state") back.searchParams.set(k, v);
  return c.redirect(back.toString());
}

async function finishLogin(c: Context, shop: string, staff: { email?: string; email_verified?: boolean } | undefined) {
  const roaster = await db.query.roasters.findFirst({ where: eq(roasters.shopifyDomain, shop) });
  // Only roasters that have installed the app (and not removed it) can sign in this way.
  if (!roaster?.shopifyInstalledAt || roaster.shopifyUninstalledAt) {
    return c.redirect(webUrl("/business", { error: "not-connected", shop }));
  }
  if (!staff?.email || !staff.email_verified) return c.redirect(webUrl("/business", { error: "email-unverified" }));

  const userId = await ensureAccount(staff.email);
  await joinRoaster(db, roaster.id, userId);
  return c.redirect(await signInLink(staff.email, webUrl("/business/dashboard")));
}

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
