import { serve } from "@hono/node-server";
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
import { startWebhookSweeper } from "./shopify/webhooks";
import { createContext } from "./trpc/init";
import { appRouter } from "./trpc/router";

const app = new Hono();

app.use(logger());

app.get("/health", async (c) => {
  await db.execute(sql`select 1`);
  return c.json({ ok: true });
});

app.route("/", shopifyRoutes);

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
const timers = [startWebhookSweeper(), startRestNotificationJob()];

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    timers.forEach(clearInterval);
    server.close(() => process.exit(0));
  });
}
