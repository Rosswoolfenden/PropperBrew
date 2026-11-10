import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { env } from "./env";
import { startRestNotificationJob } from "./jobs/rest-notifications";
import { db } from "./lib/db";
import { shopifyRoutes } from "./routes/shopify";
import { stripeRoutes } from "./routes/stripe";
import { uploadRoutes } from "./routes/uploads";
import { startOrderSweeper } from "./payments/fulfil";
import { checkoutEnabled } from "./payments/stripe";
import { startWebhookSweeper } from "./shopify/webhooks";
import { createContext } from "./trpc/init";
import { appRouter } from "./trpc/router";

const app = new Hono();

app.use(logger());

app.get("/health", async (c) => {
  await db.execute(sql`select 1`);
  return c.json({ ok: true });
});

// Sample coffee photos used by the seed data (e2e/db/seed.sql), served from apps/api/public.
app.use(
  "/mock/*",
  serveStatic({ root: "./public", onFound: (_path, c) => c.header("Cache-Control", "public, max-age=86400") }),
);

app.route("/", shopifyRoutes);
app.route("/", stripeRoutes);
app.route("/", uploadRoutes);

app.use(
  "/trpc/*",
  cors({ origin: (origin) => origin, credentials: true }),
  bodyLimit({ maxSize: 15 * 1024 * 1024 }), // bag photos
  trpcServer({
    router: appRouter,
    createContext: (_opts, c) => createContext({ req: c.req.raw }),
  }),
);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`PropperBrew API listening on :${info.port}`);
});
const timers = [startWebhookSweeper(), startRestNotificationJob(), ...(checkoutEnabled ? [startOrderSweeper(db)] : [])];

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    timers.forEach(clearInterval);
    server.close(() => process.exit(0));
  });
}
