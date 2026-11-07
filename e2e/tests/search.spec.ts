/** Website search: words, filters, sort, and shareable URLs. */
import { expect, test, type Page } from "@playwright/test";
import { seed, sql } from "../fixtures";

const main = (page: Page) => page.getByRole("main");
const results = (page: Page) => main(page).getByRole("list", { name: "Results" }).locator(".roast-card h3");
const count = (page: Page) => main(page).getByRole("status");
const group = (page: Page, name: string) => main(page).getByRole("group", { name });

test.afterAll(() => {
  sql(`update coffee_beans set decaf = false where slug = '${seed.cerrado.slug}'`);
});

test.describe("search", () => {
  test("opens from the banner and from Discover", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("search").getByLabel("Search coffees").fill("jasmine");
    await page.getByRole("search").getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL("/search?q=jasmine");
    await expect(results(page)).toHaveText([seed.kochere.name]);
    await expect(count(page)).toHaveText("1 coffee for “jasmine”");

    await page.goto(`/${seed.roaster.slug}`);
    await page.getByRole("banner").getByRole("link", { name: "Search" }).click();
    await expect(page).toHaveURL("/search");
    await expect(main(page).getByRole("heading", { level: 1, name: "Find your next coffee" })).toBeVisible();
  });

  test("on a phone, the banner keeps every link on one line", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: "Search" })).toBeVisible();
    for (const name of ["Search", "For roasters", "Sign in"]) {
      const box = (await banner.getByRole("link", { name, exact: true }).boundingBox())!;
      expect(box.height, name).toBeLessThanOrEqual(40);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("lists in-stock coffees, newest first", async ({ page }) => {
    await page.goto("/search");
    await expect(count(page)).toHaveText("3 coffees");
    await expect(results(page)).toHaveText([seed.kochere.name, seed.inStock.name, seed.cerrado.name]);
    const kochere = main(page).getByRole("link", { name: new RegExp(seed.kochere.name) });
    await expect(kochere).toContainText("Hackney Heights · Ethiopia");
    await expect(kochere).toContainText("Notes of blueberry & jasmine");
    await expect(kochere).toContainText("£14.00");
    await expect(main(page).getByRole("link", { name: "Clear search" })).toHaveCount(0);
    await kochere.click();
    await expect(page).toHaveURL(`/${seed.kochere.roasterSlug}/${seed.kochere.slug}`);
  });

  test("matches roaster names and tasting notes, and treats symbols literally", async ({ page }) => {
    await page.goto("/search?q=Hackney");
    await expect(results(page)).toHaveText([seed.kochere.name, seed.cerrado.name]);
    await page.goto("/search?q=rhubarb");
    await expect(results(page)).toHaveText([seed.inStock.name]);
    await page.goto("/search?q=Hack%25");
    await expect(count(page)).toHaveText("0 coffees for “Hack%”");
    await expect(main(page).getByText("No coffees match. Try fewer filters or different words.")).toBeVisible();
    await main(page).getByRole("link", { name: "Clear search" }).click();
    await expect(page).toHaveURL("/search");
    await expect(count(page)).toHaveText("3 coffees");
  });

  test("filters by origin, process and roast, offering only what's in stock", async ({ page }) => {
    await page.goto("/search");
    await expect(group(page, "Origin").getByRole("link")).toHaveText(["Brazil", "Colombia", "Ethiopia"]);
    await expect(group(page, "Process").getByRole("link")).toHaveText(["Washed", "Natural", "Honey"]);
    // Kiambu (Kenya) is sold out, so Kenya isn't offered.
    await expect(group(page, "Origin").getByRole("link", { name: "Kenya" })).toHaveCount(0);

    await group(page, "Origin").getByRole("link", { name: "Ethiopia" }).click();
    await expect(page).toHaveURL("/search?origin=Ethiopia");
    await expect(results(page)).toHaveText([seed.kochere.name]);
    await expect(group(page, "Origin").getByRole("link", { name: "Ethiopia" })).toHaveAttribute("aria-current", "true");

    // Filters combine; picking the active chip again clears it.
    await group(page, "Roast").getByRole("link", { name: "Medium" }).click();
    await expect(count(page)).toHaveText("0 coffees");
    await group(page, "Origin").getByRole("link", { name: "Ethiopia" }).click();
    await expect(page).toHaveURL("/search?roast=medium");
    await expect(results(page)).toHaveText([seed.cerrado.name]);
    await group(page, "Process").getByRole("link", { name: "Honey" }).click();
    await expect(results(page)).toHaveText([seed.cerrado.name]);
    await expect(page).toHaveURL("/search?process=honey&roast=medium");
  });

  test("sorts by rating and price, and caps the price", async ({ page }) => {
    await page.goto("/search");
    await group(page, "Sort").getByRole("link", { name: "Lowest price" }).click();
    await expect(page).toHaveURL("/search?sort=price_low");
    await expect(results(page)).toHaveText([seed.cerrado.name, seed.inStock.name, seed.kochere.name]);
    await expect(main(page).locator(".roast-price")).toHaveText(["£9.50", "from £12.50", "£14.00"]);

    await group(page, "Sort").getByRole("link", { name: "Top rated" }).click();
    await expect(results(page).first()).toHaveText(seed.inStock.name);

    await group(page, "Price").getByRole("link", { name: "Under £10" }).click();
    await expect(results(page)).toHaveText([seed.cerrado.name]);
    await group(page, "Price").getByRole("link", { name: "Under £15" }).click();
    // Still top rated: the reviewed coffee, then the rest.
    await expect(results(page)).toHaveText([seed.inStock.name, seed.kochere.name, seed.cerrado.name]);
    await expect(page).toHaveURL("/search?max=15&sort=top_rated");
  });

  test("can include sold-out coffees", async ({ page }) => {
    await page.goto("/search?q=kiambu");
    await expect(count(page)).toHaveText("0 coffees for “kiambu”");
    await group(page, "Availability").getByRole("link", { name: "Include sold out" }).click();
    await expect(page).toHaveURL("/search?q=kiambu&all=1");
    await expect(results(page)).toHaveText([seed.soldOut.name]);
    await expect(main(page).locator(".roast-price")).toHaveText(["Sold out"]);
  });

  test("new words keep the filters you've picked", async ({ page }) => {
    await page.goto("/search?origin=Brazil");
    const box = main(page).getByRole("search").getByLabel("Search coffees");
    await box.fill("hazelnut");
    await box.press("Enter");
    await expect(page).toHaveURL("/search?q=hazelnut&origin=Brazil");
    await expect(results(page)).toHaveText([seed.cerrado.name]);
    await expect(box).toHaveValue("hazelnut");
  });

  test("offers decaf only when there's a decaf to find", async ({ page }) => {
    await page.goto("/search");
    await expect(main(page).getByRole("link", { name: "Decaf" })).toHaveCount(0);
    sql(`update coffee_beans set decaf = true where slug = '${seed.cerrado.slug}'`);
    await page.goto("/search");
    await group(page, "More").getByRole("link", { name: "Decaf" }).click();
    await expect(results(page)).toHaveText([seed.cerrado.name]);
    sql(`update coffee_beans set decaf = false where slug = '${seed.cerrado.slug}'`);
  });

  test("ignores parameters it doesn't understand", async ({ page }) => {
    const res = await page.goto("/search?sort=evil&process=<script>&max=abc&page=-4&q=a&q=b");
    expect(res?.status()).toBe(200);
    await expect(main(page).getByRole("search").getByLabel("Search coffees")).toHaveValue("a");
    await page.goto("/search?sort=evil&process=nope&max=abc");
    await expect(count(page)).toHaveText("3 coffees");
  });

  test("pages through results", async ({ page }) => {
    await page.goto("/search?page=2");
    await expect(main(page).getByRole("link", { name: "Next" })).toHaveCount(0);
    await main(page).getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Previous" }).click();
    await expect(page).toHaveURL("/search");
    await expect(count(page)).toHaveText("3 coffees");
  });
});
