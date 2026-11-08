/**
 * A stand-in for Stripe in the e2e tests: the API calls PropperBrew makes (Checkout Sessions,
 * PaymentIntents, Transfers, Connect accounts and onboarding links), a hosted payment page, a
 * Connect onboarding page, and signed webhooks back to the API. The API reaches it through
 * STRIPE_API_BASE.
 *
 * Card 4242 4242 4242 4242 pays; 4000 0000 0000 0002 is declined, as on real Stripe test mode.
 * GET /__state shows what was created, for tests to check.
 */
import { createHmac, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { apiEnv, apiUrl, ports } from "./fixtures";

type Session = {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid";
  amount_total: number;
  currency: string;
  customer_email: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string>;
  payment_intent: string | null;
  success_url: string;
  cancel_url: string;
  url: string;
  line_items: { name: string; description?: string; unit_amount: number; quantity: number }[];
  transfer_group: string | null;
};

const origin = `http://localhost:${ports.fakeStripe}`;
const sessions = new Map<string, Session>();
const paymentIntents = new Map<string, { id: string; object: "payment_intent"; latest_charge: string; amount: number }>();
const transfers: Record<string, unknown>[] = [];
const accounts = new Map<string, { id: string; object: "account"; email?: string; payouts_enabled: boolean; charges_enabled: boolean; capabilities: { transfers: string } }>();
const idempotent = new Map<string, { status: number; body: unknown }>();
/** Tests can hold webhooks back, to check the API copes when they're late. */
let webhooksOn = true;

const id = (prefix: string) => `${prefix}_${randomBytes(10).toString("hex")}`;
const gbp = (pence: number) => `£${(pence / 100).toFixed(2)}`;
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });

/** Stripe's form encoding (`line_items[0][price_data][currency]=gbp`) → nested objects and arrays. */
function parseForm(body: string) {
  const root: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const path = key.replace(/\]/g, "").split("[");
    let node: Record<string, unknown> = root;
    path.forEach((part, i) => {
      if (i === path.length - 1) node[part] = value;
      else node = (node[part] ??= /^\d+$/.test(path[i + 1]!) ? [] : {}) as Record<string, unknown>;
    });
  }
  return root as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function page(res: ServerResponse, title: string, body: string, status = 200) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f6f9fc;color:#1a1f36}
main{max-width:440px;margin:0 auto;padding:32px 20px}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;background:#ffde92;color:#5c3c00;font:700 12px system-ui;letter-spacing:.04em}
.box{background:#fff;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.08);padding:20px;margin:16px 0}
.line{display:flex;justify-content:space-between;gap:12px;padding:6px 0}
.total{font-weight:700;border-top:1px solid #e3e8ee;margin-top:8px;padding-top:12px}
label{display:block;font-weight:600;margin:12px 0 4px} input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cfd7df;border-radius:6px;font:inherit}
button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:6px;background:#635bff;color:#fff;font:600 16px system-ui;cursor:pointer}
.error{color:#df1b41;font-weight:600} a{color:#635bff}
</style></head><body><main><span class="badge">TEST MODE</span>${body}</main></body></html>`);
}

/** POST a webhook to the API, signed the way Stripe signs them. */
async function sendWebhook(type: string, object: unknown) {
  if (!webhooksOn) return;
  const payload = JSON.stringify({ id: id("evt"), object: "event", type, api_version: "2026-09-30.endive", created: Math.floor(Date.now() / 1000), data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", apiEnv.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  const res = await fetch(`${apiUrl}/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${signature}` }, body: payload });
  if (!res.ok) console.error(`Webhook ${type} got ${res.status}: ${await res.text()}`);
}

function payPage(res: ServerResponse, s: Session, error?: string) {
  const lines = s.line_items
    .map((l) => `<div class="line"><span>${escape(l.name)}${l.quantity > 1 ? ` × ${l.quantity}` : ""}${l.description ? `<br><small>${escape(l.description)}</small>` : ""}</span><span>${gbp(l.unit_amount * l.quantity)}</span></div>`)
    .join("");
  page(
    res,
    "Pay PropperBrew",
    `<h1>Pay PropperBrew</h1>
<div class="box" aria-label="Order summary">${lines}<div class="line total"><span>Total due</span><span>${gbp(s.amount_total)}</span></div></div>
<form method="post" class="box" aria-label="Payment">
  <label for="email">Email</label><input id="email" value="${escape(s.customer_email ?? "")}" readonly>
  <label for="card">Card number</label><input id="card" name="card" inputmode="numeric" autocomplete="cc-number" value="4242 4242 4242 4242">
  ${error ? `<p class="error" role="alert">${escape(error)}</p>` : ""}
  <button type="submit">Pay ${gbp(s.amount_total)}</button>
</form>
<p><a href="/pay/${s.id}/cancel">← Back to PropperBrew</a></p>`,
    error ? 402 : 200,
  );
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", origin);
  const path = url.pathname;
  if (path === "/health") return json(res, 200, { ok: true });

  if (path === "/__state") {
    return json(res, 200, { sessions: [...sessions.values()], transfers, accounts: [...accounts.values()] });
  }
  if (req.method === "POST" && path === "/__webhooks") {
    webhooksOn = (await readBody(req)) !== "off";
    return json(res, 200, { webhooksOn });
  }
  const expire = path.match(/^\/__expire\/(cs_\w+)$/);
  if (req.method === "POST" && expire) {
    const s = sessions.get(expire[1]!);
    if (!s) return json(res, 404, {});
    s.status = "expired";
    await sendWebhook("checkout.session.expired", s);
    return json(res, 200, s);
  }

  // The hosted payment page.
  const pay = path.match(/^\/pay\/(cs_\w+)(\/cancel)?$/);
  if (pay) {
    const s = sessions.get(pay[1]!);
    if (!s) return page(res, "Not found", "<h1>This checkout doesn't exist</h1>", 404);
    if (pay[2]) {
      res.writeHead(303, { location: s.cancel_url });
      return res.end();
    }
    if (s.status !== "open") return page(res, "Done", `<h1>This checkout is ${s.status}</h1>`, 410);
    if (req.method === "GET") return payPage(res, s);
    const card = (new URLSearchParams(await readBody(req)).get("card") ?? "").replace(/\s+/g, "");
    if (card === "4000000000000002") return payPage(res, s, "Your card was declined. Try a different card.");
    if (!/^\d{16}$/.test(card)) return payPage(res, s, "Your card number is incomplete.");
    const pi = { id: id("pi"), object: "payment_intent" as const, latest_charge: id("ch"), amount: s.amount_total };
    paymentIntents.set(pi.id, pi);
    Object.assign(s, { status: "complete", payment_status: "paid", payment_intent: pi.id });
    await sendWebhook("checkout.session.completed", s);
    res.writeHead(303, { location: s.success_url });
    return res.end();
  }

  // Connect onboarding.
  const connect = path.match(/^\/connect\/(acct_\w+)$/);
  if (connect) {
    const account = accounts.get(connect[1]!);
    if (!account) return page(res, "Not found", "<h1>Unknown account</h1>", 404);
    if (req.method === "GET") {
      return page(
        res,
        "Set up payouts",
        `<h1>Get paid with PropperBrew</h1><form method="post" class="box" aria-label="Onboarding">
<label for="sort">Sort code</label><input id="sort" value="10-88-00"><label for="acct">Account number</label><input id="acct" value="00012345">
<button type="submit">Finish setting up payouts</button></form><p><a href="${escape(url.searchParams.get("refresh") ?? "")}">Not now</a></p>`,
      );
    }
    Object.assign(account, { payouts_enabled: true, charges_enabled: true, capabilities: { transfers: "active" } });
    await sendWebhook("account.updated", account);
    res.writeHead(303, { location: url.searchParams.get("return") ?? "/" });
    return res.end();
  }

  // The API, as the stripe library calls it.
  if (req.headers.authorization !== `Bearer ${apiEnv.STRIPE_SECRET_KEY}`) {
    return json(res, 401, { error: { type: "invalid_request_error", message: "Invalid API Key provided" } });
  }
  const key = req.headers["idempotency-key"];
  if (req.method === "POST" && typeof key === "string" && idempotent.has(key)) {
    const cached = idempotent.get(key)!;
    return json(res, cached.status, cached.body);
  }
  const reply = (status: number, body: unknown) => {
    if (req.method === "POST" && typeof key === "string") idempotent.set(key, { status, body });
    json(res, status, body);
  };
  const body = req.method === "POST" ? parseForm(await readBody(req)) : {};

  if (req.method === "POST" && path === "/v1/checkout/sessions") {
    const lineItems = (body.line_items as Record<string, any>[]).map((l) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      name: l.price_data.product_data.name as string,
      description: l.price_data.product_data.description as string | undefined,
      unit_amount: Number(l.price_data.unit_amount),
      quantity: Number(l.quantity),
    }));
    const sessionId = id("cs_test");
    const session: Session = {
      id: sessionId,
      object: "checkout.session",
      status: "open",
      payment_status: "unpaid",
      amount_total: lineItems.reduce((sum, l) => sum + l.unit_amount * l.quantity, 0),
      currency: body.currency,
      customer_email: body.customer_email ?? null,
      client_reference_id: body.client_reference_id ?? null,
      metadata: body.metadata ?? {},
      payment_intent: null,
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      url: `${origin}/pay/${sessionId}`,
      line_items: lineItems,
      transfer_group: body.payment_intent_data?.transfer_group ?? null,
    };
    sessions.set(sessionId, session);
    return reply(200, session);
  }
  const session = path.match(/^\/v1\/checkout\/sessions\/(cs_\w+)$/);
  if (req.method === "GET" && session) {
    const s = sessions.get(session[1]!);
    return s ? reply(200, s) : reply(404, { error: { type: "invalid_request_error", message: "No such checkout.session" } });
  }
  const intent = path.match(/^\/v1\/payment_intents\/(pi_\w+)$/);
  if (req.method === "GET" && intent) {
    const pi = paymentIntents.get(intent[1]!);
    return pi ? reply(200, pi) : reply(404, { error: { type: "invalid_request_error", message: "No such payment_intent" } });
  }
  if (req.method === "POST" && path === "/v1/transfers") {
    const transfer = { id: id("tr"), object: "transfer", amount: Number(body.amount), currency: body.currency, destination: body.destination, transfer_group: body.transfer_group, source_transaction: body.source_transaction ?? null, metadata: body.metadata ?? {} };
    transfers.push(transfer);
    return reply(200, transfer);
  }
  if (req.method === "POST" && path === "/v1/accounts") {
    const account = { id: id("acct"), object: "account" as const, email: body.email, payouts_enabled: false, charges_enabled: false, capabilities: { transfers: "inactive" } };
    accounts.set(account.id, account);
    return reply(200, account);
  }
  const account = path.match(/^\/v1\/accounts\/(acct_\w+)$/);
  if (req.method === "GET" && account) {
    // Seeded accounts (db/seed.sql) are already onboarded.
    const found = accounts.get(account[1]!) ?? { id: account[1]!, object: "account", payouts_enabled: true, charges_enabled: true, capabilities: { transfers: "active" } };
    return reply(200, found);
  }
  if (req.method === "POST" && path === "/v1/account_links") {
    const link = new URL(`${origin}/connect/${body.account}`);
    link.searchParams.set("return", body.return_url);
    link.searchParams.set("refresh", body.refresh_url);
    return reply(200, { object: "account_link", url: link.toString(), expires_at: Math.floor(Date.now() / 1000) + 300 });
  }

  json(res, 404, { error: { type: "invalid_request_error", message: `fake Stripe has no ${req.method} ${path}` } });
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    json(res, 500, { error: { type: "api_error", message: String(err) } });
  });
}).listen(ports.fakeStripe, () => console.info(`Fake Stripe on :${ports.fakeStripe}`));
