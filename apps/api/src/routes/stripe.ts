import { Hono } from "hono";
import { html } from "hono/html";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { roasters } from "@propperbrew/db";
import { env } from "../env";
import { db } from "../lib/db";
import { markCheckoutExpired, markCheckoutPaid } from "../payments/fulfil";
import { payoutsReady, stripe } from "../payments/stripe";

export const stripeRoutes = new Hono();

const checkoutIdOf = (session: Stripe.Checkout.Session) => session.client_reference_id ?? session.metadata?.checkoutId ?? null;
const paymentIntentOf = (session: Stripe.Checkout.Session) =>
  typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

/** Stripe events for checkouts (paid or abandoned) and roasters' Connect accounts (onboarding finished). */
stripeRoutes.post("/stripe/webhook", async (c) => {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return c.text("Checkout isn't configured", 404);
  const payload = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, c.req.header("stripe-signature") ?? "", env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return c.text("Invalid signature", 400);
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const checkoutId = checkoutIdOf(session);
      // Bank debits complete later (async_payment_succeeded); cards are paid already.
      if (checkoutId && session.payment_status !== "unpaid") await markCheckoutPaid(db, checkoutId, { paymentIntentId: paymentIntentOf(session) });
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const checkoutId = checkoutIdOf(event.data.object);
      if (checkoutId) await markCheckoutExpired(db, checkoutId);
      break;
    }
    case "account.updated": {
      const account = event.data.object;
      await db.update(roasters).set({ stripePayoutsEnabled: payoutsReady(account) }).where(eq(roasters.stripeAccountId, account.id));
      break;
    }
  }
  return c.json({ received: true });
});

/**
 * Where Stripe sends people paying from the app (in its in-app browser). The app checks the order
 * itself when the browser closes, so this only has to say what happened.
 */
stripeRoutes.get("/checkout/return", (c) => {
  const paid = c.req.query("status") === "paid";
  return c.html(html`<!doctype html>
    <html lang="en-GB">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${paid ? "Payment received" : "Payment cancelled"} · PropperBrew</title>
        <style>
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fcf9f4; color: #1c1c19; font: 18px/1.5 Georgia, serif; text-align: center; padding: 24px; box-sizing: border-box; }
          h1 { font: 800 28px system-ui, sans-serif; color: #334537; margin: 0 0 12px; }
        </style>
      </head>
      <body>
        <main>
          <h1>${paid ? "Payment received" : "Payment cancelled"}</h1>
          <p>${paid ? "Close this page to see your order in PropperBrew." : "Nothing was charged. Close this page to return to your basket."}</p>
        </main>
      </body>
    </html>`);
});
