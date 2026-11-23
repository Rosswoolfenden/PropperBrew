# Things to set up

Accounts, keys and decisions only you can provide. Everything else runs locally without them (see
README, "Local preview"). Tick items off as they're done; when one is, send over what it says under
**Send**. Secrets go in your own `.env` or `fly secrets set`, never in chat or the repo.

## Now: blocks real testing

- [ ] **Shopify Partner account and a development store**
  - Create a Partner account at partners.shopify.com, then a development store with a few test coffee products.
  - In `apps/shopify-connector`, run `corepack pnpm exec shopify app config link --config dev`. It fills in the dev `client_id`.
  - The app's scopes are already set in `shopify.app.dev.toml` (`write_orders` is the one in-app checkout needs).
  - **Send:** the store domain (`your-store.myshopify.com`). Put `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` in `.env`.

- [ ] **Stripe account (test mode first)**
  - Sign up at stripe.com, then turn on **Connect** (Express accounts, UK).
  - Install the Stripe CLI, then run `stripe listen --forward-to localhost:4000/stripe/webhook`. It prints the webhook secret to use locally.
  - Put the test keys in `.env`: `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`.
  - **Send:** a message once that's done, and I'll run the whole checkout against real Stripe test mode.
  - For subscriptions, the webhook (and `stripe listen`) also needs `invoice.paid`, `customer.subscription.updated` and `customer.subscription.deleted`.

- [ ] **Anthropic API key** for product enrichment and the bag scanner. Put `ANTHROPIC_API_KEY` in `.env`.

## Staging

Everything is ready in the repo: `apps/api/fly.staging.toml`, `apps/web/fly.staging.toml`, `apps/shopify-connector/shopify.app.staging.toml`, and a manual GitHub Action (README, "CI and staging"). It uses Fly's own addresses, so it needs **no domain**. Steps, in order:

- [ ] **Fly.io account.** Install `flyctl` and run `fly auth login`. Then create both apps (no deploy yet):
  - `fly apps create propperbrew-api-staging`
  - `fly apps create propperbrew-web-staging`
  - If either name is taken, pick another and tell me; the name appears in the configs and the workflow.

- [ ] **A separate Supabase project for staging** (London region).
  - Authentication settings:
    - Site URL `https://propperbrew-web-staging.fly.dev`
    - add `/welcome`, `/reset-password` and `/account` on that address to the redirect URLs
    - minimum password length 8
    - email confirmation on
  - Storage: create a **public** bucket called `uploads`.
  - Supabase's built-in email sender is fine for staging (a few emails an hour).
  - Put the project URL and anon key (Project settings → API) into `apps/web/fly.staging.toml` under `[build.args]`. Both are public values, so committing them is fine. Or **send** them and I'll do it.

- [ ] **Shopify staging app.** In the Partner dashboard, create an app "PropperBrew (Staging)".
  - In `apps/shopify-connector`, run `corepack pnpm exec shopify app config link --config staging`, then `shopify app deploy --config staging`.
  - Install it on your development store from the website's business sign-in once staging is up.

- [ ] **API secrets.** Run from anywhere with `fly secrets set --app propperbrew-api-staging NAME=value …`:
  - `DATABASE_URL`: Supabase → Connect → **Session pooler** string (the direct one is IPv6-only)
  - `TOKEN_ENCRYPTION_KEY`: `openssl rand -base64 32`, a different one from production
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`: from the staging app
  - Optional: `ANTHROPIC_API_KEY`
  - Optional, for in-app checkout: `STRIPE_SECRET_KEY` (test, `sk_test_…`) and `STRIPE_WEBHOOK_SECRET`. The secret comes from a Stripe test-mode webhook endpoint at `https://propperbrew-api-staging.fly.dev/stripe/webhook` with:
    - `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
    - `account.updated` from connected accounts

- [ ] **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
  - `FLY_API_TOKEN`: from `fly tokens create deploy --org personal`
  - `STAGING_DATABASE_URL`: the same session pooler string

- [ ] **Deploy:** Actions → **Deploy staging** → Run workflow. **Send** a message once it's green, and I'll go through the site and app against it.

## Before launch

- [ ] **Domain name**
  - The configs still have placeholders: `api.yourcoffeeapp.co.uk` in `apps/api/fly.toml` and `apps/shopify-connector/shopify.app.toml`.
  - Needed: the website (e.g. `propperbrew.co.uk`), the API (e.g. `api.…`), and an address for sending email.
  - **Send:** the domain.

- [ ] **Supabase production project** (database and sign-in), at supabase.com, London region.
  - **Send:** the project URL and anon key.
  - Set as secrets: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the API uses it to delete accounts and for "Continue with Shopify").
  - In Authentication settings:
    - turn on email confirmation
    - set the minimum password length to 8
    - set the Site URL to the website
    - add the website's `/welcome`, `/reset-password` and `/account` to the redirect URLs
  - Paste the email templates from `supabase/templates` and the subjects from `compose.yaml` into the email template settings.
  - In Storage, create a **public** bucket called `uploads`, then set `UPLOADS_DRIVER=supabase` on the API. Profile photos, review photos and logos go there.

- [ ] **Email sending (SMTP)** for confirmation and reset emails, with a provider such as Postmark or Resend.
  - Add their DNS records (SPF, DKIM) to the domain.
  - Enter the SMTP details in Supabase, with the sender `hello@<your domain>`.

- [ ] **Hosting**
  - A Fly.io account for the API (`apps/api/fly.toml` is ready).
  - Somewhere to host the website, e.g. Vercel, Fly or Render.
  - `TOKEN_ENCRYPTION_KEY`: generate with `openssl rand -base64 32` and keep it safe. Losing it means every roaster has to reconnect Shopify.
  - Production Stripe and Shopify webhook endpoints:
    - Stripe: `https://<api>/stripe/webhook`, with checkout events plus `account.updated` from connected accounts
    - Shopify: set in the app config

- [ ] **Stripe, live**
  - Finish Stripe's business verification.
  - Set the platform name and branding shown on the payment page.
  - Confirm the 12% commission (`roasters.commission_bps`).
  - Switch to the live keys.

- [ ] **Shopify app, production**
  - Create the production app in the Partner dashboard.
  - Link `shopify.app.toml` with the real domain.
  - Decide on public (App Store listing) or unlisted/custom distribution.

- [ ] **Legal pages and contact details**
  - Terms of service, privacy policy (UK GDPR) and a refunds policy. Stripe and both app stores ask for them.
  - A support email address. The delete-account message currently says "Contact PropperBrew" without one.

## App stores

- [ ] **Apple Developer account** (£79/year). Needed for TestFlight, the App Store, push notifications and Sign in with Apple. The bundle id is set as `uk.co.propperbrew.app`.
- [ ] **Google Play developer account** (one-off fee). The package is set as `uk.co.propperbrew.app`.
- [ ] **Expo (EAS) account** to build and submit the apps, and to hold the push notification keys.
  - Run `eas init` in `apps/mobile`. It adds the project id the app needs to register for push notifications.
  - Make a development build (`eas build --profile development`). Push doesn't work in Expo Go on Android, and iOS needs the Apple account for its push key.

## Sign in with Apple and Google

- [ ] **Google Cloud OAuth clients:** web, iOS and Android client IDs, entered in Supabase's Google provider.
- [ ] **Sign in with Apple:** a Services ID and key from the Apple Developer account, entered in Supabase's Apple provider.

## Decisions

- [ ] **Who reads reports, and how often.** Reported reviews, recipes and profiles are saved but nobody is told yet (README, "Reports"). The app stores expect reports to be acted on. Options are a daily email digest to the support address, or a small admin page later.
  - **Send:** who should get them.

- [ ] **Merge `feature/roaster-platform` into `main`?** It has seven features on it. I can open a pull request.
