/** The website's remaining pieces: community recipes, the dashboard's numbers, and what search engines see. */
import { expect, test, type Page } from "@playwright/test";
import { accounts, seed, sql, webUrl } from "../fixtures";

const main = (page: Page) => page.getByRole("main");
const ben = { id: "00000000-0000-4000-8000-00000000000b", email: "ben@example.com", password: "password123" };
const kochere = `/${seed.kochere.roasterSlug}/${seed.kochere.slug}`;

async function signIn(page: Page, account: { email: string; password: string }, from = "/sign-in") {
  await page.goto(from);
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(account.email);
  await form.getByLabel("Password", { exact: true }).fill(account.password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
}
const jsonLd = async (page: Page) => JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);

test.afterAll(() =>
  sql(`delete from brew_recipes where user_id = '${ben.id}' and coffee_bean_id = '${seed.kochere.id}'; delete from roaster_follows;`),
);

test("share your own recipe for a coffee on the website", async ({ page }) => {
  await page.goto(kochere);
  await expect(main(page).getByText(`to share your recipe for ${seed.kochere.name}.`, { exact: false })).toBeVisible();
  await signIn(page, ben);
  await expect(page).toHaveURL("/");
  await page.goto(kochere);
  await main(page).getByRole("button", { name: "Add your recipe" }).click();
  const form = main(page).getByRole("form", { name: "Your recipe" });
  await expect(form.getByLabel("Coffee", { exact: true })).toHaveCount(0);
  await form.getByRole("button", { name: "Share recipe" }).click();
  await expect(form.getByText("Enter the coffee dose")).toBeVisible();
  await form.getByLabel("Brew method").selectOption({ label: "AeroPress" });
  await form.getByLabel("Coffee dose (g)").fill("16");
  await form.getByLabel("Total water (g)").fill("240");
  await form.getByLabel("Brew time").fill("2:00");
  await form.getByLabel("Why it works").fill("Inverted, two minutes, gentle press.");
  await form.getByRole("button", { name: "Share recipe" }).click();
  await expect(form.getByRole("status")).toHaveText("Shared. It's in the community recipes below.");

  const community = main(page).getByRole("region", { name: "From the community" });
  const card = community.locator(".card").filter({ hasText: "AeroPress" });
  await expect(card).toContainText("By ben");
  await expect(card).toContainText("16g → 240g (1:15.0)");
});

test("the dashboard shows followers", async ({ page }) => {
  sql(`insert into roaster_follows (user_id, roaster_id) values ('${seed.alice.id}', (select id from roasters where slug = '${seed.roaster.slug}')),
                                                                ('${ben.id}', (select id from roasters where slug = '${seed.roaster.slug}'))`);
  await signIn(page, accounts.northStarOwner, "/business");
  await expect(page).toHaveURL("/business/dashboard");
  await expect(page.locator(".stat").filter({ hasText: "Followers" })).toContainText("2");
});

test("search engines get a sitemap, robots rules and structured data", async ({ page, request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/", `/${seed.roaster.slug}`, `/${seed.roaster.slug}/${seed.inStock.slug}`, kochere, `/${seed.roaster.slug}/${seed.soldOut.slug}`]) {
    expect(sitemap).toContain(`<loc>${webUrl}${path}</loc>`);
  }
  expect(sitemap).not.toContain("/account");

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /account");
  expect(robots).toContain("Disallow: /basket");
  expect(robots).toContain(`Sitemap: ${webUrl}/sitemap.xml`);

  await page.goto(`/${seed.roaster.slug}/${seed.inStock.slug}`);
  const product = await jsonLd(page);
  expect(product).toMatchObject({
    "@type": "Product",
    name: seed.inStock.name,
    url: `${webUrl}/${seed.roaster.slug}/${seed.inStock.slug}`,
    brand: { name: seed.roaster.name },
    aggregateRating: { ratingValue: 4.5, reviewCount: 2 },
  });
  expect(product.offers).toEqual([
    expect.objectContaining({ price: "12.50", priceCurrency: "GBP", availability: "https://schema.org/InStock" }),
    expect.objectContaining({ price: "42.00" }),
  ]);
  // Sold out: no offers rather than an empty list.
  await page.goto(`/${seed.roaster.slug}/${seed.soldOut.slug}`);
  expect((await jsonLd(page)).offers).toBeUndefined();

  await page.goto(`/${seed.roaster.slug}`);
  expect(await jsonLd(page)).toMatchObject({
    "@type": "Organization",
    name: seed.roaster.name,
    url: `${webUrl}/${seed.roaster.slug}`,
    foundingDate: "2016",
    address: { streetAddress: "12 Call Lane, Leeds LS1 6DT" },
  });
});
