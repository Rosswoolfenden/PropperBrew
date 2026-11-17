/** Following roasters: the button, "From roasters you follow", and hearing about their new coffees. */
import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { accessToken, accounts, apiEnv, apiUrl, ports, seed, sql } from "../fixtures";

const main = (page: Page) => page.getByRole("main");
const hackney = `/${seed.secondRoaster.slug}`;
const ben = { id: "00000000-0000-4000-8000-00000000000b", email: "ben@example.com" };
const PUSH_TOKEN = "ExponentPushToken[alice-e2e]";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(accounts.alice.email);
  await form.getByLabel("Password", { exact: true }).fill(accounts.alice.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
}

/** A product webhook from (fake) Shopify, signed with the app's secret like the real thing. */
async function productWebhook(request: APIRequestContext, topic: string, shop: string, product: object) {
  const body = JSON.stringify(product);
  const hmac = createHmac("sha256", apiEnv.SHOPIFY_API_SECRET).update(body, "utf8").digest("base64");
  const res = await request.post(`${apiUrl}/webhooks/shopify/products`, {
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-event-id": `evt-${Date.now()}-${Math.random()}`,
    },
    data: body,
  });
  expect(res.status()).toBe(200);
}

const cleanUp = () =>
  sql(`delete from roaster_follows; delete from notifications;
       delete from coffee_beans where slug = 'guji-natural';
       delete from shopify_products where shopify_product_id = '7777';
       update profiles set expo_push_token = null where id = '${seed.alice.id}';`);
test.beforeEach(cleanUp);
test.afterAll(cleanUp);

test("signed out, following asks you to sign in", async ({ page }) => {
  await page.goto(hackney);
  await expect(main(page).getByRole("link", { name: `Follow ${seed.secondRoaster.name}` })).toHaveAttribute(
    "href",
    `/sign-in?next=${encodeURIComponent(hackney)}`,
  );
});

test("follow a roaster and see its coffees on the home page; unfollow and they go", async ({ page }) => {
  await signIn(page);
  await expect(main(page).getByRole("heading", { name: "From roasters you follow" })).toHaveCount(0);
  await page.goto(hackney);
  const follow = main(page).getByRole("button", { name: `Follow ${seed.secondRoaster.name}` });
  await follow.click();
  const following = main(page).getByRole("button", { name: "Following" });
  await expect(following).toHaveAttribute("aria-pressed", "true");

  await page.goto("/");
  const section = main(page).locator("section").filter({ has: page.getByRole("heading", { name: "From roasters you follow" }) });
  await expect(section.locator(".roast-card h3")).toHaveText([seed.kochere.name, seed.cerrado.name]);

  await page.goto(hackney);
  await main(page).getByRole("button", { name: "Following" }).click();
  await expect(main(page).getByRole("button", { name: `Follow ${seed.secondRoaster.name}` })).toBeVisible();
  await page.goto("/");
  await expect(main(page).getByRole("heading", { name: "From roasters you follow" })).toHaveCount(0);
});

test("a followed roaster's new coffee notifies followers, once, in the app and by push", async ({ request }) => {
  const follow = await request.post(`${apiUrl}/trpc/follows.toggle`, {
    headers: { authorization: `Bearer ${accessToken(seed.alice).token}` },
    data: { json: { roasterId: seed.payingRoaster.id } },
  });
  expect((await follow.json()).result.data.json).toEqual({ following: true });
  sql(`update profiles set expo_push_token = '${PUSH_TOKEN}' where id = '${seed.alice.id}'`);
  const pushesBefore = ((await (await request.get(`http://localhost:${ports.fakePush}/__pushes`)).json()) as unknown[]).length;

  const product = {
    id: 7777,
    title: "Guji Natural",
    handle: "guji-natural",
    status: "active",
    body_html: "<p>Strawberry and cacao.</p>",
    variants: [{ id: 77701, title: "250g", price: "15.00", option1: "250g", inventory_management: null }],
  };
  await productWebhook(request, "products/create", "hackney-heights.myshopify.com", product);

  await expect
    .poll(() => sql(`select title || '|' || body || '|' || path from notifications where user_id = '${seed.alice.id}'`), { timeout: 15_000 })
    .toBe(`New from ${seed.secondRoaster.name}|Guji Natural has just arrived.|/bean/${seed.secondRoaster.slug}/guji-natural`);
  expect(sql(`select count(*) from notifications where user_id = '${ben.id}'`)).toBe("0");

  const pushes = (await (await request.get(`http://localhost:${ports.fakePush}/__pushes`)).json()) as { to: string; title: string; data: { path: string } }[];
  expect(pushes.slice(pushesBefore)).toEqual([
    expect.objectContaining({ to: PUSH_TOKEN, title: `New from ${seed.secondRoaster.name}`, data: { path: `/bean/${seed.secondRoaster.slug}/guji-natural` } }),
  ]);

  // An update to the same product isn't news.
  await productWebhook(request, "products/update", "hackney-heights.myshopify.com", { ...product, body_html: "<p>Now with notes.</p>" });
  await expect.poll(() => sql(`select count(*) from shopify_products where shopify_product_id = '7777' and title = 'Guji Natural'`)).toBe("1");
  await new Promise((r) => setTimeout(r, 1000));
  expect(sql(`select count(*) from notifications where user_id = '${seed.alice.id}'`)).toBe("1");
});
