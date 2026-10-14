# PropperBrew

Vivino for UK specialty coffee: reviews, community brew recipes, a bag scanner, and a marketplace fed directly from roasters' Shopify stores.

```
apps/
  api/                Hono + tRPC on Node. Shopify OAuth & webhooks, Claude enrichment, jobs. Deploys to Fly (lhr).
  web/                Next.js 16 (App Router). SSR bean pages with Product JSON-LD for SEO.
  mobile/             Expo SDK 57 + Expo Router. Discover, bag scanner, bean page, shelf.
  shopify-connector/  Shopify CLI app config only (shopify.app.toml). The backend lives in apps/api.
packages/
  shared/             Zod schemas, enums, rest-window + formatting helpers (used everywhere).
  db/                 Drizzle schema + client. Migrations are generated into supabase/migrations.
supabase/             Local Postgres 17, auth, storage.
```

## Getting started

```sh
corepack enable                  # provides pnpm (version pinned in package.json)
pnpm install
cp .env.example .env             # fill in TOKEN_ENCRYPTION_KEY (openssl rand -base64 32), Shopify + Anthropic keys
supabase start                   # local Postgres/Auth/Storage (needs Docker + the Supabase CLI)
supabase db reset                # applies supabase/migrations
pnpm dev                         # api :4000, web :3000, expo
```

To work against a real Shopify dev store, run the connector instead of the plain API dev server. The Shopify CLI starts `apps/api` behind a tunnel and points the webhooks at it:

```sh
pnpm --filter @propperbrew/shopify-connector dev:shopify
```

Schema changes: edit `packages/db/src/schema.ts`, run `pnpm db:generate`, then `supabase db reset` locally or `supabase db push` for production.

## How it works

**Canonical bean vs. Shopify listing.** `coffee_beans` is what people review and write recipes for. `shopify_products` and `shopify_variants` are the buyable links. When a roaster deletes a product, the bean is archived and its page stays live without a buy button. When a roaster reuses a product for a new lot (the extracted bean name changes), a new bean is created and the old one is archived, so its reviews never end up attached to the wrong coffee.

**Webhooks.** Every topic is HMAC-verified, written to `webhook_events` (deduped by `X-Shopify-Event-Id`) and acknowledged straight away. Processing happens afterwards, because LLM enrichment can take longer than Shopify's 5-second limit. A sweeper retries anything that failed or was interrupted, up to 5 attempts.

**Stock.** Many indie roasters roast to order with inventory tracking off, or set to "continue selling". Those variants are marked `always_available`. `inventory_levels/update` only toggles stock on tracked variants.

**Enrichment.** `apps/api/src/enrichment/claude.ts` sends the product title, variants and description to Claude (`claude-opus-5-5`, low effort, structured output validated by the shared Zod schema). It gets back origin, process, varietals, altitude and tasting notes, and decides whether the product is coffee at all. It only re-runs when the title or description hash changes. Specs a human has verified (`specs_verified`) are never overwritten. Without `ANTHROPIC_API_KEY`, beans are created from the product title only.

**Bag scanner.** The phone takes a photo, Claude vision reads the roaster and bean name, and `pg_trgm` fuzzy-matches them to beans.

**Rest window.** Shelf entries with a roast date get a push notification when the coffee enters its peak window (`packages/shared/src/resting.ts`).

**Security.** Shopify tokens are encrypted with AES-256-GCM. All data access goes through the API, which connects as `postgres`. RLS is enabled with no policies, so Supabase's auto-generated REST API exposes nothing. Clients authenticate with Supabase JWTs, which the API verifies via JWKS, or with the HS256 secret if one is set.

## Changes from the original configs

- `shopify.app.toml`: `embedded = false` and `application_url` set to `/shopify/app` on the API. For the MVP, roasters only see a "connected" status page, so App Bridge and session tokens aren't needed and the plain OAuth code grant is enough. Removed the duplicate redirect URL.
- `shopify.app.dev.toml`: relative webhook URIs plus a `shopify.web.toml`, so `shopify app dev` runs the API behind its tunnel. Added the GDPR topics, which Shopify requires.
- `supabase/config.toml`: Postgres 17, a `review-photos` bucket, and Apple/Google sign-in turned off locally until credentials exist.
- `fly.toml`: `kill_timeout` raised to 30s, and the build runs from the repo root because it's a monorepo.

## Not built yet

- **Checkout.** The schema (`orders`, `order_lines`, `roasters.stripe_account_id`, `commission_bps`) is ready for Option 2: Stripe Connect plus Shopify `orderCreate`. The API routes, Stripe webhook and basket UI still need writing.
- Web auth and the review/recipe forms. The tRPC mutations exist; only the UI is missing.
- Recommendations: `pgvector` is enabled, but nothing uses embeddings yet.
- Roaster-editable profile (city, roast days, shipping) on the `/shopify/app` page.
