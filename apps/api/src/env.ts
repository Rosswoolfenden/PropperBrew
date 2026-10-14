import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  PUBLIC_API_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((k) => Buffer.from(k, "base64").length === 32, "Must be 32 bytes, base64-encoded"),
  SUPABASE_URL: z.url(),
  /** Legacy HS256 secret. If unset, tokens are verified against the project's JWKS. */
  SUPABASE_JWT_SECRET: z.string().optional(),
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_API_VERSION: z.string().default("2026-04"),
  SHOPIFY_SCOPES: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
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
