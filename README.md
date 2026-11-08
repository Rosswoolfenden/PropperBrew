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

**Discovery and ordering.** `roasters.discover` returns roasters with something in stock, newest first, each with up to 8 of their coffees and a "from" price. Both apps lay these out like the Stitch Roaster Discovery screen: a roaster spotlight, "The Collection" grid of roasters, the newest arrivals, then a horizontally scrolling row per roaster (styled after Curated Collections). On a coffee's page you pick a size and quantity, then check out on the roaster's Shopify store (in an in-app browser sheet on mobile).

**Search.** `beans.search` matches words against the coffee's full-text index, its name, its roaster's name and its tasting notes (symbols such as `%` are matched literally). Results can be filtered by origin, process, roast level, decaf and a maximum price, and sorted by newest, top rated or lowest price. By default only coffees you can buy right now are shown; "Include sold out" adds the rest. `beans.searchOptions` lists only the origins, processes and roasts of in-stock coffees, so no filter leads to an empty page. On the website, `/search` keeps everything in the URL (`?q=jasmine&origin=Ethiopia&sort=price_low`), with parameters in a fixed order, so a search can be shared or bookmarked. It's linked from the banner and from a search box on Discover. In the app, the search field at the top of Discover opens a search screen that updates as you type.

**Recipes.** A recipe is written either by a community member (`user_id`) or by the roaster as their own recommendation (`roaster_id`); a check constraint keeps exactly one set. A coffee's brewing guide lists the roaster's recommendations first, then community recipes by upvotes. Anyone signed in can upvote (`recipes.toggleUpvote`) and add their own recipe from the app. Each step in `brew_recipes.steps` has a time, an optional cumulative water weight, title and note. Tapping a recipe opens a screen styled after the Stitch Recipe Details design: parameters, the coffee's flavour profile, numbered steps and a brew timer that follows them. The sample data includes three roaster recommendations and seven community recipes. Roasters can't add recommendations themselves yet; that belongs on the roaster profile page below.

**Reviews.** One review per person per coffee (posting again edits it): a 1–5 star rating, an optional sensory profile (acidity, sweetness, body, aftertaste and balance, each 1–5, from the Stitch Review Coffee design), tasting notes and written notes. Posting recomputes the coffee's average rating and per-dimension sensory averages (`reviews.upsert`), which the coffee page shows as bars. In the app, the shelf asks "How was it?" once a bag reaches its peak rest window and you haven't reviewed it. On the website, the coffee page has the same review form and is rebuilt as soon as a review is posted.

**Profiles.** Everyone has a public profile (`users.profile`), following the Stitch User Profile & Reviews design: their name, a line about them, their usual brew method and grinder, counts of recipes, reviews and roasters they've tried, then their reviews (tasting notes, acidity, stars and notes) and recipes. Nothing from their shelf is shown. On the website it's `/u/<username>`, linked from your name in the banner and from review and recipe authors. In the app, the profile icon on Discover opens yours, and authors' names open theirs. You can edit your name, bio, brew method and grinder from your own profile (`me.update`).

**Rest window.** Shelf entries with a roast date get a push notification when the coffee enters its peak window (`packages/shared/src/resting.ts`).

**Accounts.** Coffee drinkers and roasters sign in with Supabase Auth. Each auth user gets a `profiles` row (from the `handle_new_user` trigger) with an `account_type` of `consumer` or `business`, set from sign-up metadata. A business account can't touch a roaster until it's in `roaster_members`, which only happens through Shopify:

- *Connect your store* (website dashboard): `business.connectShopifyUrl` returns the install URL carrying a signed, 10-minute connect token (`apps/api/src/business/connect-token.ts`). After Shopify's approval, the OAuth callback links the store to that account, as owner if the roaster has none yet, otherwise as staff.
- *Continue with Shopify* (website `/business`): an OAuth round trip with an online (per-user) token, so Shopify tells us which staff member approved it. If the store has the app installed and Shopify has verified their email, the API finds or creates their account through the auth admin API, adds them to the roaster, and sends them on with a one-time sign-in link.

**Roaster tools.** In the business dashboard, a roaster's team can edit the roaster's public page: philosophy, story, city, year established, address, website, and a hero photo picked from their own coffee photos (the API refuses any other image). They can post recipes as their own recommendations ("Roaster's pick", shown first on that coffee's brewing guide) and remove them, and see recent reviews and community recipes on their coffees. Only members of a roaster can change it. The public page is `/<roaster>` on the website and the roaster screen in the app, following the Stitch Roaster Profile design. Discover links to it, and pages are rebuilt as soon as anything changes.

**In-app checkout (Option 2).** Roasters that have set up Stripe payouts sell through a PropperBrew basket, following the Stitch Cart, Checkout and Order Confirmation designs. Everyone else still gets "Order", which opens their own Shopify checkout.

- *Basket.* `basket_items` is kept on the server, so it's the same in the app and on the website, and it can hold coffees from several roasters. `basket.get` reprices it every time. It groups coffees by roaster, because each roaster posts its own parcel and charges its own delivery: `roasters.shipping_flat_pence` (default £3.95), free from `free_shipping_threshold_pence`. Roasters set both in the dashboard. A coffee that sells out while it's in a basket is flagged, and checkout waits until it's removed.
- *Paying.* `orders.start` writes a `checkouts` row, plus an `orders` row per roaster with its lines (prices read again on the server), and opens a Stripe Checkout Session. The shopper pays on Stripe's page by card, Apple Pay or Google Pay. On the website they come back to `/orders/<id>`. In the app, the page opens in the in-app browser, and the app's order screen checks for the payment until it's confirmed.
- *After payment.* The `checkout.session.completed` webhook (signature-checked) marks the checkout paid and takes the coffees out of the basket. Each roaster is then paid through a Stripe transfer (separate charges and transfers): coffee plus delivery, less `commission_bps` of the coffee (12% by default). Next, the order is created in the roaster's Shopify store with `orderCreate`, already paid, so they post it like any other order. A late webhook doesn't matter, because the order page asks Stripe directly. If Stripe or Shopify fails, the order stays `paid` with `last_error`, and a sweeper retries every minute, up to 5 times. Transfers use idempotency keys, so a retry never pays twice. Unpaid sessions are marked expired.
- *Roasters.* The dashboard's "Selling on PropperBrew" card starts Stripe Connect Express onboarding (owners only), sets delivery charges, and lists orders placed here with what the roaster receives.
- *Configuration.* Without `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, checkout is off everywhere. With Stripe test keys it runs in test mode (card 4242 4242 4242 4242). Shopify needs the `write_orders` scope for `orderCreate`.

**Security.** Shopify tokens are encrypted with AES-256-GCM. All data access goes through the API, which connects as `postgres`. RLS is enabled with no policies, so Supabase's auto-generated REST API exposes nothing. Clients authenticate with Supabase JWTs, which the API verifies via JWKS, or with the HS256 secret if one is set.

## Design

The UI follows the Stitch project "Elevated Brew" (Manrope headlines and labels, Newsreader body copy, sage primary, warm paper surfaces, no divider lines). Colour tokens live in `packages/shared/src/theme.ts`. The web app turns them into CSS custom properties (`apps/web/src/lib/theme-css.ts`), and the mobile app reads them through `apps/mobile/src/theme.ts` and the primitives in `apps/mobile/src/ui.tsx`.

## Local preview (Docker)

To look around without any keys or local tooling beyond Docker:

```sh
pnpm demo        # or: docker compose up --build
```

The sample coffees have photos (from the Stitch designs) in `apps/api/public/mock`, served by the API at `/mock/*`. This starts the website on http://localhost:3000, the app's web build on http://localhost:8081 and the API on http://localhost:4000, with sample coffees from `e2e/db/seed.sql`. If those ports are in use, set `WEB_PORT`, `MOBILE_PORT` or `API_PORT`.

Signing in works for real: compose runs Supabase's auth service (`auth`, GoTrue) behind a small gateway (`gateway`, `supabase/local/gateway.conf`) at http://127.0.0.1:54321, the address the apps use by default. New accounts are confirmed straight away (there's no mail server). Sample accounts, all with the password `password123`:

| Email | Account |
|---|---|
| `alice@example.com` | Coffee drinker with a shelf, reviews and recipes |
| `ben@example.com` | Coffee drinker |
| `roaster@north-star.test` | Business account, owner of North Star Coffee Roasters |

Shopify sync and the bag scanner need real credentials, so they won't work here. In-app checkout is off too, so every "Order" button goes to the roaster's Shopify store. To try it, start the preview with Stripe test keys, `STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… pnpm demo`. Hackney Heights' sample Stripe account isn't real, so set up payouts for North Star from its dashboard instead. Paying works without forwarding webhooks, but creating orders in Shopify needs a real store. `docker compose down -v` discards the data, and the next start reseeds it. The `migrate` service applies `supabase/migrations` and the seed after the auth service has created its tables, and records what it applied.

## End-to-end tests

```sh
corepack pnpm exec playwright install chromium   # once, from e2e/
pnpm test:e2e
```

`e2e/setup-db.ts` starts the database, auth service and gateway from `compose.yaml` as a separate compose project (`propperbrew-e2e`, database on :54329, auth on :54339) and loads the migrations and seed. Playwright then boots a fake Shopify (`e2e/fake-shopify.ts`, :4199), a fake Stripe (`e2e/fake-stripe.ts`, :4198), the API (:4100), a production build of the Next site (:3100) and the Expo app on react-native-web (:8181).

The tests check content, data flow and the applied design tokens in light and dark mode. They also sign in for real: coffee drinkers and roasters on the website, and the app's sign-in form. The Shopify connect and "Continue with Shopify" flows run end to end against the fake Shopify, which signs its redirects like Shopify does. `SHOPIFY_ORIGIN_OVERRIDE` points the API at it, and the API refuses that setting in production. Checkout runs end to end against the fake Stripe the same way (`STRIPE_API_BASE`, also refused in production). Its payment page takes card 4242… and declines 4000 0000 0000 0002, it signs its webhooks as Stripe does, and the fake Shopify records the orders created in it. Native-only features (camera capture, push) aren't covered.

### On Android (native)

The browser suite renders the app through react-native-web. To check the real native app as well:

```sh
# Once: start an Android emulator (Android Studio → Device Manager) and run `expo start --android`
# in apps/mobile so Expo Go gets installed on it.
ANDROID_HOME=~/Library/Android/sdk pnpm test:android
```

`e2e/native/android.ts` seeds the same database, starts the API and a fresh Metro (`--clear`, so the device never runs a stale bundle), then cold-starts the app in Expo Go for each case through deep links. Through adb and uiautomator it reads the screen, scrolls, types and taps through discovery, search, ordering, the brewing guide, the recipe timer, the signed-out prompts and error states. A case fails if React Native shows its red error screen or logs a JavaScript error. Don't touch the emulator while it runs. `ONLY=search pnpm test:android` runs just the cases whose name contains "search", and a failing case saves a screenshot to `e2e/test-results/android-<n>.png`.

## Changes from the original configs

- `shopify.app.toml`: `embedded = false` and `application_url` set to `/shopify/app` on the API. For the MVP, roasters only see a "connected" status page, so App Bridge and session tokens aren't needed and the plain OAuth code grant is enough. Removed the duplicate redirect URL.
- `shopify.app.dev.toml`: relative webhook URIs plus a `shopify.web.toml`, so `shopify app dev` runs the API behind its tunnel. Added the GDPR topics, which Shopify requires.
- `supabase/config.toml`: Postgres 17, a `review-photos` bucket, and Apple/Google sign-in turned off locally until credentials exist.
- `fly.toml`: `kill_timeout` raised to 30s, and the build runs from the repo root because it's a monorepo.

## Not built yet

- **Checkout against real Stripe.** Every test runs against `e2e/fake-stripe.ts`. Before taking real money, run the flow once with Stripe test keys and the Stripe CLI (`stripe listen --forward-to localhost:4000/stripe/webhook`), and check the Connect settings (Express accounts, GB) in the Stripe dashboard.
- Refunds and order updates. Refunds are done in Stripe and Shopify by hand. Shopify's fulfilment webhooks aren't used to update order status yet ("Posted").
- A community recipe form on the website (the app has one).
- Photo uploads (review photos, roaster logos). Hero photos come from the roaster's synced coffee photos for now.
- Recommendations: `pgvector` is enabled, but nothing uses embeddings yet.
