/** Coffee subscriptions on the website: subscribing, each delivery becoming an order, and managing it. */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { accessToken, accounts, apiUrl, createUser, deleteTestUsers, ports, seed, sql } from "../fixtures";

const fakeStripe = `http://localhost:${ports.fakeStripe}`;
const main = (page: Page) => page.getByRole("main");
const kochereSubscribe = `/${seed.kochere.roasterSlug}/${seed.kochere.slug}/subscribe`;
const owner = "00000000-0000-4000-8000-00000000000c";

async function signIn(page: Page, account: { email: string; password: string }, from = "/sign-in") {
  await page.goto(from);
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(account.email);
  await form.getByLabel("Password", { exact: true }).fill(account.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
}

const renew = (request: APIRequestContext, subscriptionId: string) =>
  request.post(`${fakeStripe}/__subscriptions/${sql(`select stripe_subscription_id from subscriptions where id = '${subscriptionId}'`)}/renew`);
const deliveries = (subscriptionId: string) => Number(sql(`select count(*) from checkouts where subscription_id = '${subscriptionId}'`));

const cleanUp = () =>
  sql(`delete from checkouts where subscription_id is not null; delete from subscriptions;
       delete from roaster_members where roaster_id = '${seed.payingRoaster.id}' and user_id = '${owner}';`);
test.beforeEach(cleanUp);
test.afterAll(() => {
  cleanUp();
  deleteTestUsers();
});

test("subscribe to a coffee; each delivery is an order; pause, resume and cancel", async ({ page, request }) => {
  await signIn(page, accounts.alice);
  await expect(page).toHaveURL("/");
  await page.goto(`/${seed.kochere.roasterSlug}/${seed.kochere.slug}`);
  await main(page).getByRole("link", { name: "Or subscribe: a bag every 2 or 4 weeks" }).click();
  await expect(page).toHaveURL(kochereSubscribe);

  const form = main(page).getByRole("form", { name: "Subscribe" });
  await form.getByLabel("Bags each time").selectOption("2");
  await form.locator("label").filter({ hasText: "Every 4 weeks" }).click();
  const summary = form.getByRole("complementary", { name: "Your subscription" });
  await expect(summary.locator(".summary-lines")).toHaveText(/2 × 250g \/ Wholebean£28\.00Delivery£3\.95Every 4 weeks£31\.95/);
  await form.getByRole("button", { name: "Subscribe · £31.95" }).click();
  await expect(form.getByText("Enter a UK postcode, like LS1 6DT")).toBeVisible();
  await form.getByLabel("Full name").fill("Alice Smith");
  await form.getByLabel("Street address").fill("1 Mare Street");
  await form.getByLabel("Town or city").fill("London");
  await form.getByLabel("Postcode").fill("e8 1aa");
  await form.getByRole("button", { name: "Subscribe · £31.95" }).click();

  // Stripe's page for the first payment.
  await expect(page).toHaveURL(new RegExp(`^${fakeStripe}/pay/`));
  await expect(page.getByLabel("Order summary")).toContainText("Delivery from Hackney Heights");
  await page.getByRole("button", { name: "Pay £31.95" }).click();

  await expect(page).toHaveURL(/\/subscriptions\?started=[0-9a-f-]{36}$/);
  const subscriptionId = page.url().split("started=")[1]!;
  await expect(main(page).getByRole("status")).toHaveText("You're subscribed. Your first bag is on its way.");
  const card = main(page).getByRole("listitem", { name: "Kochere Natural · 250g / Wholebean" });
  await expect(card).toContainText("Active");
  await expect(card).toContainText("2 × 250g / Wholebean from Hackney Heights · every 4 weeks · £31.95 each time");
  await expect(card).toContainText(/Next one is paid for and sent on \w+day \d+ \w+\./);

  // The first payment is the first delivery: an order the roaster is paid for, in their Shopify.
  expect(sql(`select o.status || '|' || o.subtotal_pence || '|' || o.shipping_pence from orders o join checkouts c on c.id = o.checkout_id where c.subscription_id = '${subscriptionId}'`)).toBe(
    "pushed_to_shopify|2800|395",
  );

  // Every period after, another one.
  await renew(request, subscriptionId);
  await expect.poll(() => deliveries(subscriptionId)).toBe(2);

  // Paused: nothing is billed or sent.
  await card.getByRole("button", { name: "Pause" }).click();
  await expect(card).toContainText("Paused: nothing is sent or charged until you resume.");
  await renew(request, subscriptionId);
  await page.waitForTimeout(500);
  expect(deliveries(subscriptionId)).toBe(2);

  await card.getByRole("button", { name: "Resume" }).click();
  await expect(card).toContainText("Active");

  await card.getByRole("button", { name: "Cancel subscription" }).click();
  await card.getByRole("button", { name: "Keep it" }).click();
  await expect(card).toContainText("Active");
  await card.getByRole("button", { name: "Cancel subscription" }).click();
  await card.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(card).toContainText("Cancelled");
  await expect(card.getByRole("button")).toHaveCount(0);
  const stripeSub = ((await (await request.get(`${fakeStripe}/__state`)).json()).subscriptions as { metadata: { subscriptionId: string }; status: string }[]).find(
    (s) => s.metadata.subscriptionId === subscriptionId,
  );
  expect(stripeSub?.status).toBe("canceled");
});

test("the roaster sees subscribers in the dashboard", async ({ page, request }) => {
  sql(`insert into roaster_members (roaster_id, user_id, role) values ('${seed.payingRoaster.id}', '${owner}', 'staff')`);
  const start = await request.post(`${apiUrl}/trpc/subscriptions.start`, {
    headers: { authorization: `Bearer ${accessToken(seed.alice).token}` },
    data: {
      json: {
        variantId: sql("select id from shopify_variants where shopify_variant_id = '3002'"),
        quantity: 1,
        intervalWeeks: 2,
        address: { name: "Alice Smith", line1: "1 Mare St", city: "London", postcode: "E8 1AA" },
      },
    },
  });
  const { url } = (await start.json()).result.data.json;
  await request.post(url, { form: { card: "4242424242424242" }, maxRedirects: 0 });

  await signIn(page, accounts.northStarOwner, "/business");
  await expect(page).toHaveURL("/business/dashboard");
  const subscribers = page.getByRole("region", { name: `${seed.secondRoaster.name} dashboard` }).getByRole("region", { name: "Subscribers" });
  await expect(subscribers).toContainText("1 active");
  await expect(subscribers).toContainText("Alice Smith");
  await expect(subscribers).toContainText("1 × Cerrado Pulped Natural · 250g / Wholebean · every 2 weeks");
});

test("only coffees sold here can be subscribed to; signed out asks you to sign in", async ({ page }) => {
  await page.goto(kochereSubscribe);
  await expect(main(page).getByText("Sign in to subscribe.")).toBeVisible();
  await signIn(page, accounts.alice);
  await expect(page).toHaveURL("/");
  await page.goto(`/${seed.roaster.slug}/${seed.inStock.slug}/subscribe`);
  await expect(main(page).getByText(`${seed.inStock.name} can't be subscribed to here.`, { exact: false })).toBeVisible();
});

test("deleting an account cancels its subscriptions in Stripe", async ({ request }) => {
  const user = await createUser("subscriber");
  const token = accessToken({ id: user.id, email: user.email }).token;
  const start = await request.post(`${apiUrl}/trpc/subscriptions.start`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      json: {
        variantId: sql("select id from shopify_variants where shopify_variant_id = '3001'"),
        quantity: 1,
        intervalWeeks: 4,
        address: { name: "Sub Scriber", line1: "1 St", city: "Leeds", postcode: "LS1 6DT" },
      },
    },
  });
  const { url, subscriptionId } = (await start.json()).result.data.json;
  await request.post(url, { form: { card: "4242424242424242" }, maxRedirects: 0 });
  await expect.poll(() => sql(`select status from subscriptions where id = '${subscriptionId}'`)).toBe("active");

  const deleted = await request.post(`${apiUrl}/trpc/me.deleteAccount`, { headers: { authorization: `Bearer ${token}` }, data: { json: { confirm: "delete my account" } } });
  expect(deleted.status()).toBe(200);
  expect(sql(`select status || '|' || coalesce(user_id::text, 'none') from subscriptions where id = '${subscriptionId}'`)).toBe("cancelled|none");
  const stripeSub = ((await (await request.get(`${fakeStripe}/__state`)).json()).subscriptions as { metadata: { subscriptionId: string }; status: string }[]).find(
    (s) => s.metadata.subscriptionId === subscriptionId,
  );
  expect(stripeSub?.status).toBe("canceled");
});
