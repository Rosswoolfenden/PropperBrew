import { createHmac } from "node:crypto";

export const ports = { db: 54329, api: 4100, web: 3100, mobile: 8181 } as const;
export const apiUrl = `http://localhost:${ports.api}`;
export const jwtSecret = "e2e-jwt-secret-with-at-least-32-characters";

/** Environment for the API under test (placeholder secrets; nothing external is called). */
export const apiEnv = {
  NODE_ENV: "test",
  PORT: String(ports.api),
  PUBLIC_API_URL: apiUrl,
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${ports.db}/postgres`,
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_JWT_SECRET: jwtSecret,
  SHOPIFY_API_KEY: "e2e",
  SHOPIFY_API_SECRET: "e2e",
  SHOPIFY_SCOPES: "read_products",
};

/** EXPO_PUBLIC_* values for the app under test. */
export const appEnv = {
  EXPO_PUBLIC_API_URL: apiUrl,
  EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  // The app throws without one; the suite never talks to Supabase itself.
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
