/** Reporting reviews, recipes and profiles on the website. */
import { expect, test, type Page } from "@playwright/test";
import { accessToken, accounts, apiUrl, seed, sql } from "../fixtures";

const main = (page: Page) => page.getByRole("main");
const beanPath = `/${seed.roaster.slug}/${seed.inStock.slug}`;
const ben = { id: "00000000-0000-4000-8000-00000000000b", email: "ben@example.com" };
const aliceReview = () => sql(`select id from reviews where user_id = '${seed.alice.id}' and coffee_bean_id = '${seed.inStock.id}'`);

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/sign-in");
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(account.email);
  await form.getByLabel("Password", { exact: true }).fill(account.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
}

test.beforeEach(() => sql("delete from reports"));
test.afterAll(() => sql("delete from reports"));

test("signed out, reporting asks you to sign in", async ({ page }) => {
  await page.goto(beanPath);
  await main(page).getByRole("button", { name: "Report alice's review" }).click();
  const prompt = main(page).locator(".report-done");
  await expect(prompt).toHaveText("Sign in to report alice's review.");
  await prompt.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(beanPath)}`);
});

test("report a review, with a reason and a note", async ({ page }) => {
  await signIn(page, accounts.ben);
  await page.goto(beanPath);
  // Not on your own review.
  await expect(main(page).getByRole("button", { name: "Report ben's review" })).toHaveCount(0);

  await main(page).getByRole("button", { name: "Report alice's review" }).click();
  const form = main(page).getByRole("form", { name: "Report alice's review" });
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByRole("alert")).toHaveText("Choose what's wrong.");
  await form.getByLabel("Spam or advertising").check();
  await form.getByLabel("Anything else? (optional)").fill("Links to a shop.");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "Thanks" })).toHaveText("Thanks for telling us. We'll take a look.");
  expect(sql(`select target_type || '|' || reason || '|' || note || '|' || status from reports where target_id = '${aliceReview()}'`)).toBe(
    "review|spam|Links to a shop.|open",
  );

  // Again: the same report, updated.
  await page.reload();
  await main(page).getByRole("button", { name: "Report alice's review" }).click();
  const again = main(page).getByRole("form", { name: "Report alice's review" });
  await again.getByLabel("Offensive or abusive").check();
  await again.getByRole("button", { name: "Send report" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "Thanks" })).toBeVisible();
  expect(sql(`select count(*) || '|' || min(reason) from reports where target_id = '${aliceReview()}'`)).toBe("1|offensive");
});

test("report a recipe and a profile; your own have no Report", async ({ page }) => {
  await signIn(page, accounts.ben);
  await page.goto(beanPath);
  const community = main(page).getByRole("region", { name: "From the community" });
  await expect(community.getByRole("button", { name: "Report ben's recipe" })).toHaveCount(0);
  await community.getByRole("button", { name: "Report alice's recipe" }).first().click();
  const form = community.getByRole("form", { name: "Report alice's recipe" });
  await form.getByLabel("False or misleading").check();
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(community.getByRole("status").filter({ hasText: "Thanks" })).toBeVisible();

  await page.goto("/u/alice");
  await main(page).getByRole("button", { name: "Report alice's profile" }).click();
  await main(page).getByRole("form", { name: "Report alice's profile" }).getByLabel("Something else").check();
  await main(page).getByRole("button", { name: "Send report" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "Thanks" })).toBeVisible();
  expect(sql("select string_agg(target_type || ':' || reason, ',' order by target_type) from reports")).toBe("profile:other,recipe:misleading");

  await page.goto("/u/ben");
  await expect(main(page).getByRole("heading", { level: 1, name: "ben" })).toBeVisible();
  await expect(main(page).getByRole("button", { name: /^Report/ })).toHaveCount(0);
});

test("the API refuses your own posts and things that don't exist", async ({ request }) => {
  const report = (user: { id: string; email: string }, targetType: string, targetId: string) =>
    request.post(`${apiUrl}/trpc/reports.create`, {
      headers: { authorization: `Bearer ${accessToken(user).token}` },
      data: { json: { targetType, targetId, reason: "spam" } },
    });
  const own = await report(seed.alice, "review", aliceReview());
  expect(own.status()).toBe(400);
  expect((await own.json()).error.json.message).toBe("You can't report your own posts.");
  expect((await report(ben, "review", "00000000-0000-4000-8000-000000000999")).status()).toBe(404);
  expect((await report(ben, "recipe", "not-an-id")).status()).toBe(404);
  expect((await report(ben, "profile", "nobody-here")).status()).toBe(404);
  expect((await request.post(`${apiUrl}/trpc/reports.create`, { data: { json: { targetType: "profile", targetId: "alice", reason: "spam" } } })).status()).toBe(401);
  expect(sql("select count(*) from reports")).toBe("0");
});
