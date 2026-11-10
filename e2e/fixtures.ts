import { execFileSync } from "node:child_process";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { join } from "node:path";

export const ports = { db: 54329, supabase: 54339, api: 4100, web: 3100, mobile: 8181, fakeShopify: 4199, fakeStripe: 4198, mail: 54349 } as const;
export const apiUrl = `http://localhost:${ports.api}`;
export const webUrl = `http://localhost:${ports.web}`;
/** The auth service, behind the Supabase-style gateway (see compose.yaml). */
export const supabaseUrl = `http://127.0.0.1:${ports.supabase}`;
export const jwtSecret = "e2e-jwt-secret-with-at-least-32-characters";

/** Environment for the API under test (placeholder secrets; nothing external is called). */
export const apiEnv = {
  NODE_ENV: "test",
  PORT: String(ports.api),
  PUBLIC_API_URL: apiUrl,
  PUBLIC_WEB_URL: webUrl,
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${ports.db}/postgres`,
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SUPABASE_URL: supabaseUrl,
  SUPABASE_JWT_SECRET: jwtSecret,
  SHOPIFY_API_KEY: "e2e",
  SHOPIFY_API_SECRET: "e2e",
  SHOPIFY_SCOPES: "read_products",
  // OAuth and Admin API calls go to e2e/fake-shopify.ts.
  SHOPIFY_ORIGIN_OVERRIDE: `http://localhost:${ports.fakeShopify}`,
  // Payments go to e2e/fake-stripe.ts, which signs its webhooks with this secret.
  STRIPE_SECRET_KEY: "sk_test_e2e",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e",
  STRIPE_API_BASE: `http://localhost:${ports.fakeStripe}`,
};

/** NEXT_PUBLIC_* values for the website under test (baked in at build time). */
export const webEnv = {
  NEXT_PUBLIC_API_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
};

/** Seeded accounts that sign in with a password (db/seed.sql). */
export const accounts = {
  alice: { email: "alice@example.com", password: "password123", username: "alice" },
  ben: { email: "ben@example.com", password: "password123", username: "ben" },
  northStarOwner: { email: "roaster@north-star.test", password: "password123", username: "north_star" },
} as const;

/** EXPO_PUBLIC_* values for the app under test. */
export const appEnv = {
  EXPO_PUBLIC_API_URL: apiUrl,
  EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
  EXPO_PUBLIC_WEB_URL: webUrl,
  // Any value works locally; the auth service doesn't check it.
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
  EXPO_NO_TELEMETRY: "1",
};

/** Mirrors db/seed.sql. */
export const seed = {
  alice: { id: "00000000-0000-4000-8000-00000000000a", email: "alice@example.com" },
  roaster: {
    slug: "north-star",
    name: "North Star Coffee Roasters",
    city: "Leeds",
    checkoutDomain: "north-star-coffee.myshopify.com",
  },
  /** Newest coffee overall, so it leads discovery. */
  secondRoaster: { slug: "hackney-heights", name: "Hackney Heights", city: "London" },
  /** Uninstalled the app: nothing in stock, never shown in discovery. */
  goneQuiet: { name: "Gone Quiet Roasters" },
  inStock: {
    id: "00000000-0000-4000-8000-000000000201",
    slug: "el-diviso",
    name: "El Diviso Pink Bourbon",
    tastingNotes: ["Rhubarb", "Hibiscus", "Pink grapefruit"],
    /** Alice's V60 recipe: three titled steps, 2:45 total. */
    v60RecipeId: "00000000-0000-4000-8000-000000000501",
    /** Ben's espresso (2 upvotes), used for voting so other tests' counts stay put. */
    espressoRecipeId: "00000000-0000-4000-8000-000000000502",
    /** North Star's own V60 recommendation (12 upvotes). */
    roasterRecipeId: "00000000-0000-4000-8000-000000000601",
    /** Shopify variant ids, cheapest first: 250g £12.50, 1kg £42.00. */
    variants: { small: "2001", large: "2002" },
  },
  soldOut: { slug: "kiambu-ab", name: "Kiambu AB" },
  /** Takes payment through PropperBrew (Stripe payouts on), so its coffees go in the basket. */
  payingRoaster: { id: "00000000-0000-4000-8000-000000000110", stripeAccountId: "acct_hackney_e2e" },
  /** Hackney Heights' coffees: no reviews yet. Alice has Cerrado on her shelf, at its peak. */
  kochere: { id: "00000000-0000-4000-8000-000000000211", slug: "kochere", name: "Kochere Natural", roasterSlug: "hackney-heights" },
  cerrado: { id: "00000000-0000-4000-8000-000000000212", slug: "cerrado", name: "Cerrado Pulped Natural", roasterSlug: "hackney-heights" },
} as const;

/** Design tokens from @propperbrew/shared, as the computed-style strings browsers report. */
export const rgb = {
  lightSurface: "rgb(252, 249, 244)",
  darkSurface: "rgb(28, 28, 25)",
  primary: "rgb(51, 69, 55)",
  secondaryContainer: "rgb(255, 212, 196)",
  surfaceTint: "rgb(80, 99, 84)",
} as const;

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/** An HS256 Supabase-style access token the API accepts (it's started with `jwtSecret`). */
export function accessToken(user: { id: string; email: string }, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: user.id, email: user.email, aud: "authenticated", role: "authenticated", exp }));
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return { token: `${header}.${payload}.${signature}`, exp };
}

/** Run SQL against the test database (the propperbrew-e2e compose project from setup-db.ts). */
export function sql(query: string): string {
  return execFileSync("docker", ["compose", "--project-name", "propperbrew-e2e", "exec", "-T", "db", "psql", "-U", "postgres", "-tAc", query], {
    cwd: join(import.meta.dirname, ".."),
    encoding: "utf8",
  }).trim();
}

/** Shopify stores in db/seed.sql. Anything else was connected by a test. */
export const seededShopDomains = ["north-star-coffee.myshopify.com", "hackney-heights.myshopify.com", "gone-quiet.myshopify.com"];

/** Remove a coffee's reviews (from tests) and reset its rating and sensory averages. */
export function clearReviews(coffeeBeanId: string) {
  sql(`delete from reviews where coffee_bean_id = '${coffeeBeanId}';
       update coffee_beans set avg_rating = null, review_count = 0, avg_flavour_scores = null where id = '${coffeeBeanId}'`);
}

/** A Shopify token encrypted as the API stores them (apps/api/src/lib/crypto.ts): base64(iv | tag | ciphertext). */
export function encryptToken(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(apiEnv.TOKEN_ENCRYPTION_KEY, "base64"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Empty someone's basket and remove their orders, so checkout tests start clean. */
export function clearOrders(userId: string) {
  sql(`delete from basket_items where user_id = '${userId}'; delete from checkouts where user_id = '${userId}'`);
}

/** Mailpit, which catches the auth service's email in the tests (see compose.yaml). */
export const mailUrl = `http://localhost:${ports.mail}`;

/**
 * The newest email to `to` with this subject, waiting for it to arrive. `link` is the first link
 * in it (confirm, reset, …), ready to open.
 */
export async function emailTo(to: string, subject: string, { after = 0, timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}" subject:"${subject}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string; Created: string }[] };
    const found = messages.find((m) => new Date(m.Created).getTime() >= after);
    if (found) {
      const message = (await (await fetch(`${mailUrl}/api/v1/message/${found.ID}`)).json()) as { Subject: string; HTML: string; Text: string };
      const href = message.HTML.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
      return { subject: message.Subject, html: message.HTML, text: message.Text, link: href ?? null };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No "${subject}" email to ${to}`);
}

/** How many emails `to` has had. */
export async function emailCount(to: string) {
  const res = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()) as { messages_count: number }).messages_count;
}

/** The auth service's admin API, as the service role (the tests share its JWT secret). */
async function authAdmin(path: string, init: { method: string; body?: unknown }) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 300 }));
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/${path}`, {
    method: init.method,
    headers: { authorization: `Bearer ${header}.${payload}.${signature}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`auth admin ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string }>;
}

/** A confirmed account that can sign in straight away, with a unique address. */
export async function createUser(prefix: string, password = "a-long-password") {
  const email = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@auth-test.example`;
  const { id } = await authAdmin("users", { method: "POST", body: { email, password, email_confirm: true } });
  return { id, email, password };
}

/** Remove the accounts the auth tests made. */
export function deleteTestUsers() {
  sql(`delete from auth.users where email like '%@auth-test.example'`);
}
