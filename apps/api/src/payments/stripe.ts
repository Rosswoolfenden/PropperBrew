import Stripe from "stripe";
import { env } from "../env";

/** Stripe, or null when in-app checkout isn't configured (see env.ts). */
export const stripe: Stripe | null = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, {
      maxNetworkRetries: 2,
      ...(env.STRIPE_API_BASE && (() => {
        const base = new URL(env.STRIPE_API_BASE);
        return { host: base.hostname, port: base.port, protocol: base.protocol.replace(":", "") as "http" | "https" };
      })()),
    })
  : null;

export const checkoutEnabled = stripe !== null;

export function requireStripe(): Stripe {
  if (!stripe) throw new Error("In-app checkout isn't configured (STRIPE_SECRET_KEY)");
  return stripe;
}

/** Whether a connected account can be sent its share (transfers) and pay it out to the roaster's bank. */
export const payoutsReady = (account: Stripe.Account) => account.capabilities?.transfers === "active" && !!account.payouts_enabled;
