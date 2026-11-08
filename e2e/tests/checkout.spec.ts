/**
 * Buying through PropperBrew (Stitch Cart, Checkout and Order Confirmation): the basket, paying on
 * Stripe's page (e2e/fake-stripe.ts), the roaster's payout and their Shopify order
 * (e2e/fake-shopify.ts), and roasters setting up payouts.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { accessToken, accounts, apiUrl, clearOrders, encryptToken, ports, seed, sql } from "../fixtures";

const fakeStripe = `http://localhost:${ports.fakeStripe}`;
const fakeShopify = `http://localhost:${ports.fakeShopify}`;
const main = (page: Page) => page.getByRole("main");
const banner = (page: Page) => page.getByRole("banner");
/** "Added … to your basket" (the quantity stepper is a status too). */
const added = (page: Page) => main(page).getByRole("status").filter({ hasText: /to your basket/ });
const kocherePath = `/${seed.kochere.roasterSlug}/${seed.kochere.slug}`;
const cerradoPath = `/${seed.cerrado.roasterSlug}/${seed.cerrado.slug}`;
const variantRow = (shopifyVariantId: string) => sql(`select id from shopify_variants where shopify_variant_id = '${shopifyVariantId}'`);
const ben = { id: "00000000-0000-4000-8000-00000000000b", email: "ben@example.com" };

async function signIn(page: Page, account: { email: string; password: string }, next = "/") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(account.email);
  await form.getByLabel("Password", { exact: true }).fill(account.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(next);
}

async function trpc(request: APIRequestContext, user: { id: string; email: string }, path: string, input?: unknown) {
  const res = await request.post(`${apiUrl}/trpc/${path}`, {
    headers: { authorization: `Bearer ${accessToken(user).token}` },
    data: { json: input },
  });
  return { status: res.status(), body: await res.json() };
}

async function addToBasket(page: Page, path: string, quantity: number) {
  await page.goto(path);
  for (let i = 1; i < quantity; i++) await main(page).getByRole("button", { name: "More" }).click();
  await main(page).getByRole("button", { name: /^Add to basket · / }).click();
  await expect(added(page)).toBeVisible();
}

async function fillAddress(page: Page, postcode = "e8 1aa") {
  const form = main(page).getByRole("form", { name: "Checkout" });
  await form.getByLabel("Full name").fill("Alice Smith");
  await form.getByLabel("Street address").fill("1 Mare Street");
  await form.getByLabel("Town or city").fill("London");
  await form.getByLabel("Postcode").fill(postcode);
  return form;
}

const stripeState = async (request: APIRequestContext) => (await request.get(`${fakeStripe}/__state`)).json();
const shopifyOrders = async (request: APIRequestContext) => (await request.get(`${fakeShopify}/__orders`)).json();

test.beforeEach(() => {
  clearOrders(seed.alice.id);
  clearOrders(ben.id);
});
test.afterAll(() => {
  clearOrders(seed.alice.id);
  clearOrders(ben.id);
});

test.describe("buying", () => {
  test("roasters paid through PropperBrew sell from the basket; the rest still link to Shopify", async ({ page }) => {
    await page.goto(kocherePath);
    // Signed out: sign in first, then straight back here.
    await expect(main(page).getByRole("link", { name: "Sign in to buy" })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(kocherePath)}`);
    await expect(main(page).getByText("Delivery from Hackney Heights: £3.95, free on orders of £30.00 or more.")).toBeVisible();

    await signIn(page, accounts.alice, kocherePath);
    await expect(main(page).getByRole("button", { name: "Add to basket · £14.00" })).toBeVisible();

    await page.goto(`/${seed.roaster.slug}/${seed.inStock.slug}`);
    await expect(main(page).getByRole("link", { name: "Order · £12.50" })).toBeVisible();
    await expect(main(page).getByRole("button", { name: /Add to basket/ })).toHaveCount(0);
  });

  test("from basket to paid order: the roaster is paid and the order lands in their Shopify", async ({ page, request }) => {
    await signIn(page, accounts.alice);
    await addToBasket(page, kocherePath, 2);
    await expect(added(page)).toHaveText("Added 2 × 250g / Wholebean to your basket. View basket");
    await expect(banner(page).getByRole("link", { name: "Basket, 2 items" })).toBeVisible();
    await addToBasket(page, cerradoPath, 1);
    await expect(banner(page).getByRole("link", { name: "Basket, 3 items" })).toBeVisible();

    // The basket (Stitch Cart): £37.50 is over Hackney Heights' £30, so delivery is free.
    await banner(page).getByRole("link", { name: "Basket, 3 items" }).click();
    await expect(page).toHaveURL("/basket");
    await expect(main(page).getByRole("heading", { level: 1, name: "Your Selection" })).toBeVisible();
    const group = main(page).getByRole("region", { name: "From Hackney Heights" });
    await expect(group.locator(".basket-item h3")).toHaveText([seed.kochere.name, seed.cerrado.name]);
    const summary = main(page).getByRole("complementary", { name: "Order summary" });
    await expect(summary.locator(".summary-lines")).toHaveText(/Subtotal£37\.50Delivery from Hackney HeightsFreeTotal£37\.50/);

    // One fewer Kochere: under £30, so delivery is charged, and the basket says how close free delivery is.
    await group.getByRole("group", { name: `Quantity of ${seed.kochere.name}` }).getByRole("button", { name: "Fewer" }).click();
    await expect(summary.locator(".summary-lines")).toHaveText(/Subtotal£23\.50Delivery from Hackney Heights£3\.95Total£27\.45/);
    await expect(summary.getByText("Add £6.50 more from Hackney Heights for free delivery.")).toBeVisible();
    await expect(banner(page).getByRole("link", { name: "Basket, 2 items" })).toBeVisible();

    // Checkout (Stitch Checkout): the address is checked before anything is charged.
    await summary.getByRole("link", { name: "Proceed to checkout" }).click();
    await expect(page).toHaveURL("/checkout");
    const pay = main(page).getByRole("button", { name: "Pay £27.45" });
    await pay.click();
    await expect(main(page).getByText("Enter your name")).toBeVisible();
    await expect(main(page).getByText("Enter a UK postcode, like LS1 6DT")).toBeVisible();
    const form = await fillAddress(page, "not a postcode");
    await pay.click();
    await expect(form.getByText("Enter a UK postcode, like LS1 6DT")).toBeVisible();
    await expect(form.getByText("Enter your name")).toHaveCount(0);
    await form.getByLabel("Postcode").fill("e8 1aa");
    await pay.click();

    // Stripe's page: a declined card, then one that works.
    await expect(page).toHaveURL(new RegExp(`^${fakeStripe}/pay/cs_test_`));
    await expect(page.getByText("TEST MODE")).toBeVisible();
    await expect(page.getByLabel("Order summary")).toContainText("Kochere Natural");
    await expect(page.getByLabel("Order summary")).toContainText("Delivery from Hackney Heights");
    await page.getByLabel("Card number").fill("4000 0000 0000 0002");
    await page.getByRole("button", { name: "Pay £27.45" }).click();
    await expect(page.getByRole("alert")).toHaveText("Your card was declined. Try a different card.");
    await page.getByLabel("Card number").fill("4242 4242 4242 4242");
    await page.getByRole("button", { name: "Pay £27.45" }).click();

    // Order Confirmation.
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    const checkoutId = page.url().split("/").at(-1)!;
    const reference = `PB-${checkoutId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    await expect(main(page).getByRole("heading", { level: 1, name: "Your brew is on its way." })).toBeVisible();
    await expect(main(page).locator(".confirmation-card")).toContainText(`Order reference${reference}`);
    await expect(main(page).locator(".confirmation-card")).toContainText(/Arrives by\w+day \d+ \w+/);
    const manifest = main(page).getByRole("region", { name: "What you ordered" });
    await expect(manifest).toContainText("Kochere Natural · 250g / Wholebean");
    await expect(manifest).toContainText("Cerrado Pulped Natural · 250g / Wholebean");
    await expect(manifest).toContainText("With the roaster");
    await expect(manifest.locator(".manifest-total")).toHaveText("Total£27.45");
    await expect(manifest).toContainText("To Alice Smith, 1 Mare Street, London, E8 1AA. Receipt sent to alice@example.com.");
    // What was bought has left the basket.
    await expect(banner(page).getByRole("link", { name: "Basket, 0 items" })).toBeVisible();

    // The roaster gets the coffee and delivery, less 12% commission on the coffee: £27.45 − £2.82.
    const transfer = (await stripeState(request)).transfers.find((t: { transfer_group: string }) => t.transfer_group === checkoutId);
    expect(transfer).toMatchObject({ amount: 2463, currency: "gbp", destination: seed.payingRoaster.stripeAccountId });
    expect(transfer.source_transaction).toMatch(/^ch_/);

    // ...and the order is in their Shopify, already paid, to be posted like any other.
    const shopify = (await shopifyOrders(request)).find((o: { order: { sourceIdentifier: string } }) => o.order.sourceIdentifier === reference);
    expect(shopify.shop).toBe("hackney-heights.myshopify.com");
    expect(shopify.order).toMatchObject({
      email: "alice@example.com",
      financialStatus: "PAID",
      lineItems: [
        { variantId: "gid://shopify/ProductVariant/3001", quantity: 1, priceSet: { shopMoney: { amount: "14.00", currencyCode: "GBP" } } },
        { variantId: "gid://shopify/ProductVariant/3002", quantity: 1, priceSet: { shopMoney: { amount: "9.50", currencyCode: "GBP" } } },
      ],
      shippingLines: [{ priceSet: { shopMoney: { amount: "3.95" } } }],
      shippingAddress: { firstName: "Alice", lastName: "Smith", address1: "1 Mare Street", city: "London", zip: "E8 1AA", countryCode: "GB" },
    });
    expect(sql(`select status || ' ' || shopify_order_name from orders where checkout_id = '${checkoutId}'`)).toMatch(/^pushed_to_shopify #\d+$/);

    // Their orders, from the confirmation and from their profile.
    await main(page).getByRole("link", { name: "All your orders" }).click();
    await expect(main(page).getByRole("list", { name: "Orders" }).getByRole("listitem")).toHaveText([new RegExp(`${reference}.*2 bags from Hackney Heights.*£27\\.45`)]);
    await page.goto("/u/alice");
    await main(page).getByRole("link", { name: "Your orders" }).click();
    await expect(page).toHaveURL("/orders");
  });

  test("leaving Stripe's page keeps the basket; an abandoned payment isn't an order", async ({ page, request }) => {
    await signIn(page, accounts.alice);
    await addToBasket(page, cerradoPath, 1);
    await page.goto("/checkout");
    await fillAddress(page);
    await main(page).getByRole("button", { name: "Pay £13.45" }).click();
    await expect(page).toHaveURL(new RegExp(`^${fakeStripe}/pay/`));
    const sessionId = page.url().split("/").at(-1)!;
    await page.getByRole("link", { name: "← Back to PropperBrew" }).click();
    await expect(page).toHaveURL("/basket");
    await expect(main(page).locator(".basket-item h3")).toHaveText([seed.cerrado.name]);

    // Stripe gives up on the session a day later.
    await request.post(`${fakeStripe}/__expire/${sessionId}`);
    const checkoutId = sql(`select id from checkouts where stripe_session_id = '${sessionId}'`);
    expect(sql(`select status from checkouts where id = '${checkoutId}'`)).toBe("expired");
    await page.goto(`/orders/${checkoutId}`);
    await expect(main(page).getByRole("heading", { level: 1, name: "This order wasn't paid." })).toBeVisible();
    await expect(main(page).getByRole("status")).toHaveText("Nothing was charged. Your coffees are still in your basket.");
    await page.goto("/orders");
    await expect(main(page).getByText("No orders yet.")).toBeVisible();
  });

  test("a late webhook doesn't matter: the order page asks Stripe", async ({ page, request }) => {
    await request.post(`${fakeStripe}/__webhooks`, { data: "off" });
    try {
      await signIn(page, accounts.alice);
      await addToBasket(page, kocherePath, 1);
      await page.goto("/checkout");
      await fillAddress(page);
      await main(page).getByRole("button", { name: "Pay £17.95" }).click();
      await page.getByRole("button", { name: "Pay £17.95" }).click();
      await expect(main(page).getByRole("heading", { level: 1, name: "Your brew is on its way." })).toBeVisible();
      const checkoutId = page.url().split("/").at(-1)!;
      expect(sql(`select status from orders where checkout_id = '${checkoutId}'`)).toBe("pushed_to_shopify");
    } finally {
      await request.post(`${fakeStripe}/__webhooks`, { data: "on" });
    }
  });

  test("a coffee that sells out in the basket has to come out before checkout", async ({ page }) => {
    await signIn(page, accounts.alice);
    await addToBasket(page, cerradoPath, 1);
    await addToBasket(page, kocherePath, 1);
    sql(`update shopify_variants set in_stock = false where shopify_variant_id = '3002'`);
    try {
      await page.goto("/basket");
      const cerrado = main(page).getByRole("listitem").filter({ hasText: seed.cerrado.name });
      await expect(cerrado.getByRole("alert")).toHaveText("No longer available. Remove it to check out.");
      const summary = main(page).getByRole("complementary", { name: "Order summary" });
      await expect(summary.getByRole("button", { name: "Proceed to checkout" })).toBeDisabled();
      await expect(summary.locator(".summary-total")).toHaveText("Total£17.95");
      await page.goto("/checkout");
      await expect(main(page).getByText("Some coffees in your basket can't be bought right now.")).toBeVisible();

      await page.goto("/basket");
      await cerrado.getByRole("button", { name: `Remove ${seed.cerrado.name}` }).click();
      await expect(main(page).locator(".basket-item h3")).toHaveText([seed.kochere.name]);
      await expect(summary.getByRole("link", { name: "Proceed to checkout" })).toBeVisible();
    } finally {
      sql(`update shopify_variants set in_stock = true where shopify_variant_id = '3002'`);
    }
  });

  test("an empty basket, and signed-out visitors", async ({ page }) => {
    await page.goto("/basket");
    await expect(main(page).getByText("Sign in to see your basket.")).toBeVisible();
    await main(page).getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent("/basket")}`);

    await signIn(page, accounts.alice, "/basket");
    await expect(main(page).getByText("Your basket is empty.")).toBeVisible();
    await page.goto("/checkout");
    await expect(main(page).getByText("Your basket is empty.")).toBeVisible();
  });

  test("the API checks everything itself", async ({ request }) => {
    // Coffee from a roaster without payouts can't go in a basket.
    const northStar = await trpc(request, seed.alice, "basket.add", { variantId: variantRow(seed.inStock.variants.small), quantity: 1 });
    expect(northStar.status).toBe(400);
    // Nor more than 10 of anything.
    expect((await trpc(request, seed.alice, "basket.add", { variantId: variantRow("3001"), quantity: 11 })).status).toBe(400);
    const capped = await trpc(request, seed.alice, "basket.add", { variantId: variantRow("3001"), quantity: 10 });
    expect((await trpc(request, seed.alice, "basket.add", { variantId: variantRow("3001"), quantity: 5 })).body.result.data.json.count).toBe(10);
    expect(capped.status).toBe(200);
    clearOrders(seed.alice.id);

    // Nothing to pay for.
    const empty = await trpc(request, seed.alice, "orders.start", { address: { name: "A", line1: "1 St", city: "Leeds", postcode: "LS1 6DT" } });
    expect(empty.status).toBe(400);
    expect(empty.body.error.json.message).toBe("Your basket is empty.");

    // Someone else's order is nobody else's business.
    await trpc(request, seed.alice, "basket.add", { variantId: variantRow("3002"), quantity: 1 });
    const started = await trpc(request, seed.alice, "orders.start", { address: { name: "A B", line1: "1 St", city: "Leeds", postcode: "LS1 6DT" } });
    const { checkoutId } = started.body.result.data.json;
    const peek = await request.get(`${apiUrl}/trpc/orders.get?input=${encodeURIComponent(JSON.stringify({ json: { checkoutId } }))}`, {
      headers: { authorization: `Bearer ${accessToken(ben).token}` },
    });
    expect(peek.status()).toBe(404);

    // Webhooks have to be signed by Stripe.
    const forged = await request.post(`${apiUrl}/stripe/webhook`, {
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
      data: { type: "checkout.session.completed", data: { object: { client_reference_id: checkoutId, payment_status: "paid" } } },
    });
    expect(forged.status()).toBe(400);
    expect(sql(`select status from checkouts where id = '${checkoutId}'`)).toBe("open");
  });

  test("if Shopify is down, the order is kept and marked to retry", async ({ page, request }) => {
    await request.post(`${fakeShopify}/__orders/fail`, { data: "on" });
    try {
      await signIn(page, accounts.alice);
      await addToBasket(page, cerradoPath, 1);
      await page.goto("/checkout");
      await fillAddress(page);
      await main(page).getByRole("button", { name: "Pay £13.45" }).click();
      await page.getByRole("button", { name: "Pay £13.45" }).click();
      await expect(main(page).getByRole("heading", { level: 1, name: "Your brew is on its way." })).toBeVisible();
      await expect(main(page).getByRole("region", { name: "What you ordered" })).toContainText("Paid, on its way to the roaster");
      const checkoutId = page.url().split("/").at(-1)!;
      // Paid, and the roaster already paid out, but not yet in Shopify: the sweeper tries again.
      expect(sql(`select status || '|' || attempts || '|' || (stripe_transfer_id is not null) || '|' || last_error from orders where checkout_id = '${checkoutId}'`)).toBe(
        "paid|1|true|orderCreate: Shopify is having a moment",
      );
    } finally {
      await request.post(`${fakeShopify}/__orders/fail`, { data: "off" });
    }
  });
});

test.describe("roasters", () => {
  // A roastery of their own for these tests, so turning payouts on doesn't change pages other tests use.
  const roastery = { id: "00000000-0000-4000-8000-000000000130", slug: "payout-test-roastery", name: "Payout Test Roastery" };
  const owner = "00000000-0000-4000-8000-00000000000c";
  test.beforeAll(() => {
    sql(`insert into roasters (id, slug, name, city, shopify_domain, shopify_installed_at, shopify_access_token_enc)
           values ('${roastery.id}', '${roastery.slug}', '${roastery.name}', 'York', 'payout-test.myshopify.com', now(), '${encryptToken("shpat_payout_test")}');
         insert into roaster_members (roaster_id, user_id, role) values ('${roastery.id}', '${owner}', 'owner');
         insert into coffee_beans (id, roaster_id, slug, name, origin_country, process, roast_level, tasting_notes)
           values ('00000000-0000-4000-8000-000000000231', '${roastery.id}', 'test-blend', 'Test Blend', 'Peru', 'washed', 'medium', '{Cocoa}');
         insert into shopify_products (id, roaster_id, shopify_product_id, coffee_bean_id, title)
           values ('00000000-0000-4000-8000-000000000331', '${roastery.id}', '1301', '00000000-0000-4000-8000-000000000231', 'Test Blend');
         insert into shopify_variants (shopify_product_row_id, coffee_bean_id, shopify_variant_id, title, weight_g, price_pence, in_stock)
           values ('00000000-0000-4000-8000-000000000331', '00000000-0000-4000-8000-000000000231', '5001', '250g / Wholebean', 250, 1000, true);`);
  });
  test.afterAll(() => {
    clearOrders(seed.alice.id);
    sql(`delete from roasters where id = '${roastery.id}'`);
  });

  test("set up payouts with Stripe, set delivery, and see orders arrive", async ({ page, request }) => {
    await page.goto("/business");
    const signInForm = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
    await signInForm.getByLabel("Email address", { exact: true }).fill(accounts.northStarOwner.email);
    await signInForm.getByLabel("Password", { exact: true }).fill(accounts.northStarOwner.password);
    await signInForm.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/business/dashboard");

    const panel = page.getByRole("region", { name: `${roastery.name} dashboard` });
    const selling = panel.getByRole("region", { name: "Selling on PropperBrew" });
    await expect(selling.getByText("Payouts off")).toBeVisible();
    // Not set up yet: buyers are sent to the roaster's Shopify store.
    await page.goto(`/${roastery.slug}/test-blend`);
    await expect(main(page).getByRole("link", { name: "Order · £10.00" })).toBeVisible();

    await page.goto("/business/dashboard");
    await selling.getByRole("button", { name: "Set up payouts with Stripe" }).click();
    await expect(page).toHaveURL(new RegExp(`^${fakeStripe}/connect/acct_`));
    await page.getByRole("button", { name: "Finish setting up payouts" }).click();
    await expect(page).toHaveURL(new RegExp(`/business/dashboard\\?payouts=done&roaster=${roastery.id}$`));
    await expect(selling.getByText("Payouts on")).toBeVisible();
    expect(sql(`select stripe_payouts_enabled from roasters where id = '${roastery.id}'`)).toBe("t");

    // Delivery: £4.50, free from £25.
    const delivery = selling.getByRole("form", { name: "Delivery" });
    await expect(delivery.getByLabel("Delivery charge (£)")).toHaveValue("3.95");
    await delivery.getByLabel("Delivery charge (£)").fill("four pounds");
    await delivery.getByRole("button", { name: "Save delivery" }).click();
    await expect(delivery.getByText("Enter a delivery charge up to £50, like 3.95")).toBeVisible();
    await delivery.getByLabel("Delivery charge (£)").fill("4.50");
    await delivery.getByLabel("Free delivery from (£)").fill("25");
    await delivery.getByRole("button", { name: "Save delivery" }).click();
    await expect(delivery.getByRole("status")).toHaveText("Saved. Delivery is £4.50, free from £25.00.");

    // Their coffee page now sells from the basket, with their delivery charge.
    await page.goto(`/${roastery.slug}/test-blend`);
    await expect(main(page).getByText(`Delivery from ${roastery.name}: £4.50, free on orders of £25.00 or more.`)).toBeVisible();

    // Someone buys it.
    const alice = seed.alice;
    await trpc(request, alice, "basket.add", { variantId: variantRow("5001"), quantity: 1 });
    const started = await trpc(request, alice, "orders.start", { address: { name: "Alice Smith", line1: "1 Mare Street", city: "London", postcode: "E8 1AA" } });
    const { url, checkoutId } = started.body.result.data.json;
    await request.post(url, { form: { card: "4242424242424242" }, maxRedirects: 0 });
    const reference = `PB-${checkoutId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

    await page.goto("/business/dashboard");
    const orders = panel.getByRole("region", { name: "Orders from PropperBrew" });
    const order = orders.getByRole("listitem").filter({ hasText: reference });
    await expect(order).toContainText(/Shopify #\d+/);
    await expect(order).toContainText("Alice Smith, London");
    await expect(order).toContainText("1 × Test Blend · 250g / Wholebean");
    await expect(order).toContainText("In Shopify");
    // £10 coffee + £4.50 delivery, less 12% of £10.
    await expect(order).toContainText("£14.50");
    await expect(order).toContainText("You receive £13.30");
  });

  test("only the owner can set up payouts", async ({ request }) => {
    const staff = { id: seed.alice.id, email: seed.alice.email };
    sql(`insert into roaster_members (roaster_id, user_id, role) values ('${roastery.id}', '${staff.id}', 'staff') on conflict do nothing`);
    try {
      expect((await trpc(request, staff, "business.setupPayouts", { roasterId: roastery.id })).status).toBe(403);
      expect((await trpc(request, ben, "business.updateDelivery", { roasterId: roastery.id, shippingFlatPence: 0, freeShippingThresholdPence: null })).status).toBe(403);
    } finally {
      sql(`delete from roaster_members where roaster_id = '${roastery.id}' and user_id = '${staff.id}'`);
    }
  });
});
