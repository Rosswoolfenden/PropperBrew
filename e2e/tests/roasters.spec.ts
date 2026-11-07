/** Roaster pages and the roaster tools in the business dashboard. */
import { expect, test, type Page } from "@playwright/test";
import { accounts, apiUrl, seed, sql } from "../fixtures";

const SEEDED_RECOMMENDATION = "00000000-0000-4000-8000-000000000601";
const main = (page: Page) => page.getByRole("main");

async function signInAsOwner(page: Page) {
  await page.goto("/business");
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(accounts.northStarOwner.email);
  await form.getByLabel("Password", { exact: true }).fill(accounts.northStarOwner.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/business/dashboard");
}

const tokenOf = (page: Page) =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"))!;
    return (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token;
  });

test.afterAll(() => {
  // Put North Star's profile back as seeded, and drop recommendations the tests posted.
  sql(`update roasters set
         tagline = 'Roasted light, so you taste the farm, not the furnace.', established_year = 2016,
         address = '12 Call Lane, Leeds LS1 6DT', website_url = 'https://north-star.coffee',
         bio = 'Leeds'' first specialty roastery, sourcing directly from producers they visit every harvest.',
         hero_image_url = (select image_url from coffee_beans where slug = 'el-diviso')
       where slug = '${seed.roaster.slug}';
       delete from brew_recipes where roaster_id is not null and id <> '${SEEDED_RECOMMENDATION}'`);
});

test.describe("roaster pages", () => {
  test("show the roaster's story and current roasts", async ({ page }) => {
    await page.goto(`/${seed.roaster.slug}`);
    await expect(main(page).getByRole("heading", { level: 1, name: seed.roaster.name })).toBeVisible();
    await expect(main(page).getByText("Established 2016")).toBeVisible();
    await expect(main(page).getByRole("list", { name: "About" })).toHaveText(seed.roaster.city);
    await expect(page.locator(".roaster-hero img")).toHaveJSProperty("complete", true);

    await expect(main(page).getByRole("heading", { name: "Our Philosophy" })).toBeVisible();
    await expect(main(page).locator("blockquote")).toHaveText("“Roasted light, so you taste the farm, not the furnace.”");
    await expect(main(page).getByText(/first specialty roastery/)).toBeVisible();

    // In stock first, then sold out.
    await expect(main(page).locator(".roast-card")).toHaveText([
      new RegExp(`${seed.inStock.name}.*Notes of rhubarb, hibiscus & pink grapefruit.*from £12\\.50`),
      new RegExp(`${seed.soldOut.name}.*Sold out`),
    ]);

    await expect(main(page).getByText("12 Call Lane, Leeds LS1 6DT")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "north-star.coffee" })).toHaveAttribute("href", "https://north-star.coffee/");

    await main(page).getByRole("link", { name: new RegExp(seed.inStock.name) }).click();
    await expect(page).toHaveURL(`/${seed.roaster.slug}/${seed.inStock.slug}`);
  });

  test("leave out what a roaster hasn't filled in", async ({ page }) => {
    await page.goto(`/${seed.secondRoaster.slug}`);
    await expect(main(page).getByRole("heading", { level: 1, name: seed.secondRoaster.name })).toBeVisible();
    await expect(main(page).getByRole("heading", { name: "Our Philosophy" })).toHaveCount(0);
    await expect(main(page).getByRole("heading", { name: "Visit the Roastery" })).toHaveCount(0);
    await expect(main(page).locator(".roast-card")).toHaveCount(2);
  });

  test("are 404 for an unknown roaster", async ({ page }) => {
    expect((await page.goto("/no-such-roaster"))?.status()).toBe(404);
  });
});

test.describe("roaster tools", () => {
  test("edit your page and see it live", async ({ page }) => {
    await signInAsOwner(page);
    const form = page.getByRole("form", { name: "Your page" });
    await expect(form.getByLabel("Philosophy")).toHaveValue("Roasted light, so you taste the farm, not the furnace.");
    await expect(form.getByRole("radio", { name: "Coffee photo 1" })).toBeChecked();

    await form.getByLabel("Established").fill("3000");
    await form.getByLabel("Website").fill("javascript:alert(1)");
    await form.getByRole("button", { name: "Save your page" }).click();
    await expect(form.getByText(/Enter a year between 1800 and/)).toBeVisible();
    await expect(form.getByText("Enter your full website address, starting https://")).toBeVisible();

    await form.getByLabel("Philosophy").fill("Small batches, roasted every Tuesday.");
    await form.getByLabel("Established").fill("2015");
    await form.getByLabel("Website").fill("https://northstar.example");
    await form.getByLabel("Roastery address").fill("");
    await form.getByText("None", { exact: true }).click();
    await form.getByRole("button", { name: "Save your page" }).click();
    await expect(form.getByRole("status")).toHaveText("Saved. Your page is up to date.");

    await page.goto(`/${seed.roaster.slug}`);
    await expect(main(page).locator("blockquote")).toHaveText("“Small batches, roasted every Tuesday.”");
    await expect(main(page).getByText("Established 2015")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "northstar.example" })).toBeVisible();
    // Cleared address: no address line, but the section stays for the website.
    await expect(main(page).locator(".visit-line")).toHaveCount(0);
    await expect(page.locator(".roaster-hero img")).toHaveCount(0);
  });

  test("the hero photo must be one of your own, and only your team can edit", async ({ page, request }) => {
    await signInAsOwner(page);
    const owner = await tokenOf(page);
    const roasterId = (await sql(`select id from roasters where slug = '${seed.roaster.slug}'`)).trim();
    const update = (token: string, heroImageUrl: string | null) =>
      request.post(`${apiUrl}/trpc/business.updateProfile`, {
        headers: { authorization: `Bearer ${token}` },
        data: { json: { roasterId, tagline: null, bio: null, city: "Leeds", establishedYear: null, address: null, websiteUrl: null, heroImageUrl } },
      });
    expect((await update(owner, "https://evil.example/photo.jpg")).status()).toBe(400);

    // Someone else's account can't touch North Star.
    await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
    await page.goto("/sign-in");
    const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
    await form.getByLabel("Email address", { exact: true }).fill(accounts.alice.email);
    await form.getByLabel("Password", { exact: true }).fill(accounts.alice.password);
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/");
    expect((await update(await tokenOf(page), null)).status()).toBe(403);
  });

  test("post a recommendation, see it as the roaster's pick, then remove it", async ({ page }) => {
    await signInAsOwner(page);
    const recs = page.getByRole("region", { name: "Your recommendations" });
    await expect(recs.locator(".rec-line")).toHaveText([/V60 Pour-Over for El Diviso Pink Bourbon/]);

    const form = recs.getByRole("form", { name: "New recommendation" });
    await form.getByLabel("Coffee", { exact: true }).selectOption({ label: seed.inStock.name });
    await form.getByLabel("Brew method").selectOption({ label: "Chemex" });
    await form.getByRole("button", { name: "Post recommendation" }).click();
    await expect(form.getByText("Enter the coffee dose")).toBeVisible();

    await form.getByLabel("Coffee dose (g)").fill("30");
    await form.getByLabel("Total water (g)").fill("500");
    await form.getByLabel("Temperature (°C)").fill("95");
    await form.getByLabel("Brew time").fill("4:00");
    await form.getByLabel("Why it works").fill("Our Saturday batch brew.");
    await form.getByRole("button", { name: "Add step" }).click();
    await form.getByLabel("Step 1 title").fill("Bloom");
    await form.getByLabel("Step 1 starts at").fill("0:00");
    await form.getByLabel("Step 1 water to (g)").fill("60");
    await form.getByRole("button", { name: "Post recommendation" }).click();
    await expect(form.getByRole("status")).toHaveText("Posted. It shows first on that coffee's brewing guide.");
    await expect(recs.locator(".rec-line")).toHaveCount(2);
    await expect(recs.locator(".rec-line").first()).toContainText("Chemex for El Diviso Pink Bourbon");
    await expect(recs.locator(".rec-line").first()).toContainText("30g → 500g (1:16.7) · 95°C");

    // On the coffee page, with the roaster's picks first.
    await page.goto(`/${seed.roaster.slug}/${seed.inStock.slug}`);
    const picks = page.getByRole("region", { name: "From the roaster" }).locator(".card");
    await expect(picks.locator("h3")).toHaveText(["V60 Pour-Over", "Chemex"]);

    await page.goto("/business/dashboard");
    await recs.getByRole("button", { name: "Remove Chemex for El Diviso Pink Bourbon" }).click();
    await expect(recs.locator(".rec-line")).toHaveCount(1);
    await page.goto(`/${seed.roaster.slug}/${seed.inStock.slug}`);
    await expect(page.getByRole("region", { name: "From the roaster" }).locator(".card h3")).toHaveText(["V60 Pour-Over"]);
  });

  test("see what people are saying about your coffees", async ({ page }) => {
    await signInAsOwner(page);
    const feedback = page.getByRole("region", { name: "What people are saying" });
    await expect(feedback.locator(".feedback-item").first()).toContainText("alice on El Diviso Pink Bourbon");
    await expect(feedback.getByText("Bright and juicy, with a long floral finish.")).toBeVisible();
    await expect(feedback.getByText("alice's V60 Pour-Over for El Diviso Pink Bourbon")).toBeVisible();
    await expect(feedback.getByText("ben's Espresso for El Diviso Pink Bourbon")).toBeVisible();
  });
});
