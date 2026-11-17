/** Reviewing a roaster (Stitch "Rate Roaster") on the website. */
import { expect, test, type Page } from "@playwright/test";
import { accessToken, accounts, apiUrl, seed, sql } from "../fixtures";

const main = (page: Page) => page.getByRole("main");
const hackney = `/${seed.secondRoaster.slug}`;
const ben = { id: "00000000-0000-4000-8000-00000000000b", email: "ben@example.com" };
const reviewsRegion = (page: Page) => main(page).locator("section").filter({ has: page.getByRole("heading", { name: "What People Say" }) });

async function signIn(page: Page, account: { email: string; password: string }, from = "/sign-in") {
  await page.goto(from);
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(account.email);
  await form.getByLabel("Password", { exact: true }).fill(account.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
}

const cleanUp = () =>
  sql(`delete from roaster_reviews; delete from reports where target_type = 'roaster_review';
       delete from checkouts where id = '00000000-0000-4000-8000-0000000009c1'`);
test.beforeEach(cleanUp);
test.afterAll(cleanUp);

test("signed out: no reviews yet, and an invitation to sign in", async ({ page }) => {
  await page.goto(hackney);
  await expect(reviewsRegion(page).getByText(`No reviews of ${seed.secondRoaster.name} yet.`)).toBeVisible();
  await expect(reviewsRegion(page).getByText(`to review ${seed.secondRoaster.name}.`, { exact: false })).toBeVisible();
});

test("review a roaster, then edit it; bought here shows as verified", async ({ page }) => {
  await signIn(page, accounts.alice);
  await expect(page).toHaveURL("/");
  await page.goto(hackney);
  await reviewsRegion(page).getByRole("button", { name: `Review ${seed.secondRoaster.name}` }).click();
  const form = main(page).getByRole("form", { name: `Review ${seed.secondRoaster.name}` });
  await expect(form.getByText("240 characters left")).toBeVisible();
  await form.getByRole("button", { name: "Submit feedback" }).click();
  await expect(form.getByRole("alert")).toHaveText("Choose an overall rating.");

  await form.locator("label").filter({ has: page.getByRole("radio", { name: "4 stars", exact: true }) }).click();
  await form.getByLabel("Traceability").fill("5");
  await expect(form.getByText("5.0 / 5.0")).toBeVisible();
  await form.getByLabel("The narrative").fill("Lovely packaging, fast to London.");
  await expect(form.getByText("207 characters left")).toBeVisible();
  await form.getByLabel("Add a note").fill("Dark chocolate");
  await form.getByRole("button", { name: "Add note" }).click();
  await form.getByLabel("Add a note").fill("Stone fruit");
  await form.getByLabel("Add a note").press("Enter");
  await form.getByRole("button", { name: "Remove Stone fruit" }).click();
  await form.getByRole("button", { name: "Submit feedback" }).click();

  const region = reviewsRegion(page);
  await expect(region.getByRole("status")).toHaveText(`Thanks. Your review of ${seed.secondRoaster.name} is up.`);
  const review = region.getByRole("listitem").filter({ hasText: "alice" }).first();
  await expect(review).toContainText("Traceability 5/5");
  await expect(review).toContainText("“Lovely packaging, fast to London.”");
  await expect(review.getByRole("list", { name: "Notes found" })).toHaveText("Dark chocolate");
  await expect(review.getByRole("img", { name: "4.0 out of 5" })).toBeVisible();
  await expect(review.getByText("Verified purchase")).toHaveCount(0);

  // Edit: starts from what they said; posting again changes the same review.
  await region.getByRole("button", { name: `Edit your review of ${seed.secondRoaster.name}` }).click();
  await expect(form.getByLabel("The narrative")).toHaveValue("Lovely packaging, fast to London.");
  await form.locator("label").filter({ has: page.getByRole("radio", { name: "5 stars", exact: true }) }).click();
  await form.getByRole("button", { name: "Clear traceability" }).click();
  await form.getByRole("button", { name: "Submit feedback" }).click();
  await expect(region.getByRole("status")).toBeVisible();
  expect(sql(`select count(*) || '|' || min(rating) || '|' || coalesce(min(traceability)::text, 'none') from roaster_reviews`)).toBe("1|5|none");

  // Once they've bought from the roaster here, the review says so.
  sql(`insert into checkouts (id, user_id, status, total_pence, email, shipping_address, paid_at)
         values ('00000000-0000-4000-8000-0000000009c1', '${seed.alice.id}', 'paid', 1400, 'alice@example.com', '{"name":"A","line1":"1","city":"L","postcode":"E8 1AA"}', now());
       insert into orders (checkout_id, user_id, roaster_id, status, subtotal_pence, shipping_pence, platform_fee_pence)
         values ('00000000-0000-4000-8000-0000000009c1', '${seed.alice.id}', '${seed.payingRoaster.id}', 'pushed_to_shopify', 1400, 0, 168);`);
  await page.reload();
  await expect(reviewsRegion(page).getByRole("listitem").filter({ hasText: "alice" }).first().getByText("Verified purchase")).toBeVisible();

  // On their profile too.
  await page.goto("/u/alice");
  const roasteries = main(page).locator("section").filter({ has: page.getByRole("heading", { name: "Roasteries" }) });
  await expect(roasteries.getByRole("heading", { name: seed.secondRoaster.name })).toBeVisible();
  await expect(roasteries.getByText("Verified purchase")).toBeVisible();
});

test("a roaster's team can't review it, but sees reviews in the dashboard", async ({ page, request }) => {
  const posted = await request.post(`${apiUrl}/trpc/roasterReviews.upsert`, {
    headers: { authorization: `Bearer ${accessToken(ben).token}` },
    data: { json: { roasterId: sql(`select id from roasters where slug = '${seed.roaster.slug}'`), rating: 3, shipping: 2, body: "Took a week to arrive." } },
  });
  expect(posted.status()).toBe(200);

  await signIn(page, accounts.northStarOwner, "/business");
  await expect(page).toHaveURL("/business/dashboard");
  const about = page.getByRole("list", { name: "Reviews of your roastery" });
  await expect(about).toContainText("ben");
  await expect(about).toContainText("Shipping 2/5");
  await expect(about).toContainText("Took a week to arrive.");

  await page.goto(`/${seed.roaster.slug}`);
  await reviewsRegion(page).getByRole("button", { name: `Review ${seed.roaster.name}` }).click();
  const form = main(page).getByRole("form", { name: `Review ${seed.roaster.name}` });
  await form.locator("label").filter({ has: page.getByRole("radio", { name: "5 stars", exact: true }) }).click();
  await form.getByRole("button", { name: "Submit feedback" }).click();
  await expect(form.getByRole("alert")).toHaveText("You can't review a roaster you're part of.");
});

test("someone else's roaster review can be reported", async ({ page, request }) => {
  await request.post(`${apiUrl}/trpc/roasterReviews.upsert`, {
    headers: { authorization: `Bearer ${accessToken(seed.alice).token}` },
    data: { json: { roasterId: seed.payingRoaster.id, rating: 1, body: "Buy elsewhere!!" } },
  });
  await signIn(page, accounts.ben);
  await expect(page).toHaveURL("/");
  await page.goto(hackney);
  await reviewsRegion(page).getByRole("button", { name: `Report alice's review of ${seed.secondRoaster.name}` }).click();
  const form = main(page).getByRole("form", { name: `Report alice's review of ${seed.secondRoaster.name}` });
  await form.getByLabel("Spam or advertising").check();
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(reviewsRegion(page).getByRole("status").filter({ hasText: "Thanks for telling us" })).toBeVisible();
  expect(sql("select target_type || '|' || reason from reports where target_type = 'roaster_review'")).toBe("roaster_review|spam");
});
