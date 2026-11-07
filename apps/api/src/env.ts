import { z } from "zod";

const Env = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(4000),
    PUBLIC_API_URL: z.url(),
    /** The website, where business sign-in and the Shopify connect flow send people back to. */
    PUBLIC_WEB_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .refine((k) => Buffer.from(k, "base64").length === 32, "Must be 32 bytes, base64-encoded"),
    SUPABASE_URL: z.url(),
    /** Legacy HS256 secret. If unset, tokens are verified against the project's JWKS. */
    SUPABASE_JWT_SECRET: z.string().optional(),
    /** For the auth admin API (creating accounts for "Continue with Shopify"). Derived from the JWT secret if unset. */
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SHOPIFY_API_KEY: z.string().min(1),
    SHOPIFY_API_SECRET: z.string().min(1),
    SHOPIFY_API_VERSION: z.string().default("2026-04"),
    SHOPIFY_SCOPES: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().optional(),
    /**
     * Tests only: send Shopify OAuth and Admin API calls to `${origin}/${shop}` (a fake Shopify)
     * instead of https://${shop}. Refused in production.
     */
    SHOPIFY_ORIGIN_OVERRIDE: z.url().optional(),
  })
  .refine((e) => !(e.NODE_ENV === "production" && e.SHOPIFY_ORIGIN_OVERRIDE), {
    message: "SHOPIFY_ORIGIN_OVERRIDE is for tests and can't be used in production",
    path: ["SHOPIFY_ORIGIN_OVERRIDE"],
  });

export type Env = z.infer<typeof Env>;

export const env: Env = (() => {
  const parsed = Env.safeParse({
    ...process.env,
    // `shopify app dev` injects these names; prefer explicit config when present.
    PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? process.env.HOST ?? process.env.APP_URL,
    SHOPIFY_SCOPES: process.env.SHOPIFY_SCOPES ?? process.env.SCOPES,
  });
  if (!parsed.success) {
    console.error("Invalid environment:", z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
})();
