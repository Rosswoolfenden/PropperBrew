/**
 * A stand-in for Shopify in the e2e tests: OAuth (authorize → signed redirect back → token
 * exchange) and the two Admin GraphQL queries the API makes when a store connects. The API reaches
 * it through SHOPIFY_ORIGIN_OVERRIDE as http://localhost:<port>/<shop>/admin/...
 *
 * Every shop "exists" and its staff approve straight away. A shop whose name contains "unverified"
 * hands back a staff member whose email isn't verified.
 */
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { apiEnv, ports } from "./fixtures";

const grants = new Map<string, { shop: string; perUser: boolean }>();

const handleOf = (shop: string) => shop.replace(/\.myshopify\.com$/, "");
const titleCase = (handle: string) => handle.replace(/(^|-)(\w)/g, (_, dash, c: string) => `${dash ? " " : ""}${c.toUpperCase()}`);

/** Shopify signs the redirect's query string (sorted, without hmac) with the app's secret. */
function signedQuery(params: Record<string, string>) {
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const hmac = createHmac("sha256", apiEnv.SHOPIFY_API_SECRET).update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac }).toString();
}

const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req: import("node:http").IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${ports.fakeShopify}`);
  if (url.pathname === "/health") return json(res, 200, { ok: true });

  const [, shop, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  if (!shop?.endsWith(".myshopify.com")) return json(res, 404, { error: "unknown shop" });

  // The merchant (or staff member) approves the app, and Shopify redirects back with a code.
  if (req.method === "GET" && path === "/admin/oauth/authorize") {
    if (url.searchParams.get("client_id") !== apiEnv.SHOPIFY_API_KEY) return json(res, 400, { error: "bad client_id" });
    const code = randomBytes(8).toString("hex");
    grants.set(code, { shop, perUser: url.searchParams.getAll("grant_options[]").includes("per-user") });
    const back = new URL(url.searchParams.get("redirect_uri")!);
    back.search = signedQuery({
      code,
      shop,
      state: url.searchParams.get("state") ?? "",
      timestamp: String(Math.floor(Date.now() / 1000)),
      host: Buffer.from(`${shop}/admin`).toString("base64url"),
    });
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }

  if (req.method === "POST" && path === "/admin/oauth/access_token") {
    const body = JSON.parse(await readBody(req)) as { client_id: string; client_secret: string; code: string };
    const grant = grants.get(body.code);
    grants.delete(body.code);
    if (body.client_secret !== apiEnv.SHOPIFY_API_SECRET || !grant || grant.shop !== shop) return json(res, 400, { error: "invalid_request" });
    const token = { access_token: `shpat_${randomBytes(8).toString("hex")}`, scope: apiEnv.SHOPIFY_SCOPES };
    if (!grant.perUser) return json(res, 200, token);
    const handle = handleOf(shop);
    return json(res, 200, {
      ...token,
      expires_in: 86_400,
      associated_user_scope: apiEnv.SHOPIFY_SCOPES,
      associated_user: {
        id: 902541635,
        first_name: "Sam",
        last_name: "Staff",
        email: `owner@${handle}.test`,
        email_verified: !handle.includes("unverified"),
        account_owner: true,
      },
    });
  }

  if (req.method === "POST" && /^\/admin\/api\/[^/]+\/graphql\.json$/.test(path)) {
    const { query } = JSON.parse(await readBody(req)) as { query: string };
    if (query.includes("shop {")) {
      return json(res, 200, { data: { shop: { name: titleCase(handleOf(shop)), url: `https://${shop}` } } });
    }
    if (query.includes("products(")) {
      return json(res, 200, {
        data: {
          products: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                legacyResourceId: "9001",
                title: "House Espresso",
                handle: "house-espresso",
                status: "ACTIVE",
                descriptionHtml: "<p>Chocolate and cherry.</p>",
                featuredImage: null,
                variants: {
                  nodes: [
                    {
                      legacyResourceId: "9101",
                      title: "250g / Wholebean",
                      price: "10.50",
                      inventoryQuantity: null,
                      inventoryPolicy: "DENY",
                      selectedOptions: [{ value: "250g" }, { value: "Wholebean" }],
                      inventoryItem: { legacyResourceId: "9201", tracked: false },
                    },
                  ],
                },
              },
            ],
          },
        },
      });
    }
    return json(res, 400, { errors: [{ message: "fake Shopify doesn't know this query" }] });
  }

  json(res, 404, { error: `fake Shopify has no ${req.method} ${path}` });
}).listen(ports.fakeShopify, () => console.info(`Fake Shopify on :${ports.fakeShopify}`));
