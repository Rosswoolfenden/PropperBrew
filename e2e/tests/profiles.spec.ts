/** People's profiles on the website (Stitch "User Profile & Reviews"), and editing your own. */
import { expect, test, type Page } from "@playwright/test";
import { accounts, seed, sql } from "../fixtures";

const main = (page: Page) => page.getByRole("main");
const restoreAlice = () =>
  sql(`update profiles set display_name = 'Alice', bio = 'Chasing bright, floral coffees.',
         default_grinder = 'Comandante C40', default_brew_method = 'v60' where username = 'alice'`);

test.afterAll(restoreAlice);

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/sign-in");
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(account.email);
  await form.getByLabel("Password", { exact: true }).fill(account.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
}

test.describe("profiles", () => {
  test("show who someone is, their stats, reviews and recipes", async ({ page }) => {
    await page.goto("/u/alice");
    await expect(page).toHaveTitle(/Alice/);
    await expect(main(page).getByRole("heading", { level: 1, name: "Alice" })).toBeVisible();
    await expect(main(page).getByText("@alice")).toBeVisible();
    await expect(main(page).getByText("Chasing bright, floral coffees.")).toBeVisible();
    await expect(main(page).getByText(/^Brews with V60 Pour-Over · Comandante C40 · Member since \w+ \d{4}$/)).toBeVisible();

    const stats = main(page).locator(".profile-stats > div");
    await expect(stats).toHaveText(["Recipes4", "Roasters2", "Review1"]);

    const reviews = main(page).getByRole("region", { name: "Reviews" });
    const review = reviews.getByRole("listitem").filter({ has: page.getByRole("heading", { name: seed.inStock.name }) });
    await expect(review).toContainText(seed.roaster.name);
    await expect(review.getByRole("list", { name: "Tasted" })).toHaveText(/Rhubarb\s*Cherry/);
    await expect(review.getByLabel("Acidity 5 of 5, Bright & citric")).toBeVisible();
    await expect(review.getByRole("img", { name: "5.0 out of 5" })).toBeVisible();
    await expect(review.locator("blockquote")).toHaveText("“Bright and juicy, with a long floral finish.”");

    const recipes = main(page).getByRole("region", { name: "Recipes" });
    await expect(recipes.locator(".rec-line")).toHaveCount(4);
    await expect(recipes.locator(".rec-line").filter({ hasText: "French Press" })).toContainText("for Cerrado Pulped Natural");

    // Signed out: nothing to edit.
    await expect(main(page).getByRole("button", { name: "Edit profile" })).toHaveCount(0);

    await review.getByRole("link", { name: seed.inStock.name }).click();
    await expect(page).toHaveURL(`/${seed.roaster.slug}/${seed.inStock.slug}`);
  });

  test("leave out what someone hasn't filled in", async ({ page }) => {
    await page.goto("/u/ben");
    await expect(main(page).getByRole("heading", { level: 1, name: "ben" })).toBeVisible();
    await expect(main(page).locator(".profile-bio")).toHaveCount(0);
    await expect(main(page).getByText(/^Member since \w+ \d{4}$/)).toBeVisible();
    // Ben scored acidity but noted no flavours: just the acidity bar.
    const review = main(page).getByRole("region", { name: "Reviews" }).getByRole("listitem");
    await expect(review.getByRole("list", { name: "Tasted" })).toHaveCount(0);
    await expect(review.getByLabel("Acidity 4 of 5, Bright")).toBeVisible();
    await expect(review.locator("blockquote")).toHaveCount(0);
  });

  test("are 404 for someone who doesn't exist", async ({ page }) => {
    expect((await page.goto("/u/nobody-here"))?.status()).toBe(404);
  });

  test("open from reviews and recipes on a coffee's page", async ({ page }) => {
    await page.goto(`/${seed.roaster.slug}/${seed.inStock.slug}`);
    await page.getByRole("link", { name: "ben", exact: true }).first().click();
    await expect(page).toHaveURL("/u/ben");
    await page.goBack();
    const community = page.getByRole("region", { name: "From the community" });
    await community.getByRole("link", { name: "alice", exact: true }).first().click();
    await expect(page).toHaveURL("/u/alice");
    await page.goBack();
    await page.getByRole("region", { name: "From the roaster" }).getByRole("link", { name: seed.roaster.name }).first().click();
    await expect(page).toHaveURL(`/${seed.roaster.slug}`);
  });

  test("edit your own profile from the banner", async ({ page }) => {
    await signIn(page, accounts.alice);
    await page.getByRole("banner").getByRole("link", { name: "Alice", exact: true }).click();
    await expect(page).toHaveURL("/u/alice");
    await expect(main(page).getByRole("heading", { name: "Your Reviews" })).toBeVisible();
    await expect(main(page).getByRole("heading", { name: "Your Recipes" })).toBeVisible();

    await main(page).getByRole("button", { name: "Edit profile" }).click();
    const form = main(page).getByRole("form", { name: "Edit profile" });
    await expect(form.getByLabel("Name")).toHaveValue("Alice");
    await expect(form.getByLabel("Usual brew method")).toHaveValue("v60");
    await form.getByLabel("About you").fill("x".repeat(161));
    await form.getByRole("button", { name: "Save profile" }).click();
    await expect(form.getByText("Keep your line under 160 characters.")).toBeVisible();

    await form.getByLabel("Name").fill("Alice Brewer");
    await form.getByLabel("About you").fill("Washed Kenyans, mostly.");
    await form.getByLabel("Usual brew method").selectOption({ label: "AeroPress" });
    await form.getByLabel("Grinder").fill("");
    await form.getByRole("button", { name: "Save profile" }).click();

    await expect(form).toHaveCount(0);
    await expect(main(page).getByRole("heading", { level: 1, name: "Alice Brewer" })).toBeVisible();
    await expect(main(page).getByText("Washed Kenyans, mostly.")).toBeVisible();
    await expect(main(page).getByText(/^Brews with AeroPress · Member since/)).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Alice Brewer" })).toBeVisible();

    // Still there after a reload, and to everyone else.
    await page.reload();
    await expect(main(page).getByRole("heading", { level: 1, name: "Alice Brewer" })).toBeVisible();
    restoreAlice();
  });

  test("someone else's profile has nothing to edit", async ({ page }) => {
    await signIn(page, accounts.ben);
    await page.goto("/u/alice");
    await expect(main(page).getByRole("heading", { level: 1, name: "Alice" })).toBeVisible();
    await expect(main(page).getByRole("heading", { name: "Reviews", exact: true })).toBeVisible();
    // The banner has loaded who's signed in, so the editor has had its chance to appear.
    await expect(page.getByRole("banner").getByRole("link", { name: "ben", exact: true })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Edit profile" })).toHaveCount(0);
  });

  test("fit a phone screen, signed in", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await signIn(page, accounts.alice);
    await page.goto("/u/alice");
    await expect(main(page).getByRole("heading", { level: 1, name: "Alice" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Alice", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
