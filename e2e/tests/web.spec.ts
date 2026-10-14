import { expect, test, type Page } from "@playwright/test";
import { rgb, seed } from "../fixtures";

const beanPath = (slug: string) => `/${seed.roaster.slug}/${slug}`;
const css = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("discover", () => {
  test("shows a row of coffees per roaster, newest roaster first", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Discover UK specialty coffee" })).toBeAttached();

    const rows = page.getByRole("region", { name: /coffees$/ });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAccessibleName(`${seed.secondRoaster.name} coffees`);
    await expect(rows.nth(1)).toHaveAccessibleName(`${seed.roaster.name} coffees`);
    await expect(page.getByText(seed.goneQuiet.name)).toHaveCount(0);
    await expect(page.getByText(seed.soldOut.name)).toHaveCount(0);

    const hackney = rows.nth(0);
    await expect(hackney.getByRole("heading", { level: 2 })).toHaveText(seed.secondRoaster.name);
    await expect(hackney).toContainText(seed.secondRoaster.city);
    await expect(hackney).toContainText("2 coffees");
    const kochere = hackney.getByRole("link", { name: /Kochere Natural/ });
    await expect(kochere).toContainText("£14.00");
    await expect(kochere).toContainText("Ethiopia • Natural");
    await expect(kochere.locator(".chip")).toHaveText(["Blueberry", "Jasmine"]);
    await expect(hackney.getByRole("link")).toHaveText([/Kochere Natural/, /Cerrado Pulped Natural/]);

    // Two sizes at different prices, so it's a "from" price; only the first two notes are shown.
    const diviso = rows.nth(1).getByRole("link", { name: new RegExp(seed.inStock.name) });
    await expect(diviso).toContainText("from £12.50");
    await expect(diviso.locator(".chip")).toHaveText(seed.inStock.tastingNotes.slice(0, 2));

    await diviso.click();
    await expect(page).toHaveURL(beanPath(seed.inStock.slug));
  });

  test("coffee rows scroll sideways without scrolling the page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const track = page.getByRole("region", { name: `${seed.secondRoaster.name} coffees` }).locator(".coffee-track");
    const { scrollWidth, clientWidth } = await track.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
    expect(await css(page, ".coffee-track", "scroll-snap-type")).toBe("x mandatory");
    await expectNoHorizontalScroll(page);
  });

  test("lists every roaster in the collection and the newest coffees", async ({ page }) => {
    await page.goto("/");
    const collection = page.getByRole("region", { name: "The Collection" });
    await expect(collection.getByRole("link")).toHaveText([
      new RegExp(`${seed.secondRoaster.name}\\s*${seed.secondRoaster.city}`),
      new RegExp(`${seed.roaster.name}\\s*${seed.roaster.city}`),
    ]);
    // The right-hand column sits lower (the design's asymmetry).
    expect(await css(page, ".collection > li:nth-child(2)", "margin-top")).toBe("32px");

    const arrivals = page.getByRole("region", { name: "New arrivals" }).getByRole("link");
    await expect(arrivals).toHaveCount(3);
    await expect(arrivals.nth(0)).toContainText("Kochere Natural");
    await expect(arrivals.nth(0)).toContainText("Light roast");
    await expect(arrivals.nth(0)).toContainText(`${seed.secondRoaster.name} · Notes of blueberry & jasmine`);
    await expect(arrivals.nth(0)).toContainText("£14.00");
    await expect(arrivals.nth(1)).toContainText(seed.inStock.name);
    await expect(arrivals.nth(2)).toContainText("Cerrado Pulped Natural");

    await collection.getByRole("link", { name: new RegExp(seed.roaster.name) }).click();
    await expect(page).toHaveURL(`/#roaster-${seed.roaster.slug}`);
  });

  test("spotlight counts through roasters and jumps to their coffees", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const spotlight = page.getByRole("region", { name: "Roaster spotlight" });
    const counter = spotlight.locator(".spotlight-counter");
    await expect(counter).toHaveText("01 / 02");

    // Hackney Heights has no bio; North Star's appears once it's the roaster on screen.
    const about = spotlight.locator(".spotlight-about");
    await expect(about.locator(".lead")).toHaveCount(0);
    await spotlight.locator(".spotlight-track").evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(counter).toHaveText("02 / 02");
    await expect(about).toContainText("first specialty roastery");
    await expect(about.getByRole("link", { name: "See their coffees" })).toHaveAttribute("href", `#roaster-${seed.roaster.slug}`);

    await spotlight.getByRole("link", { name: new RegExp(seed.roaster.name) }).click();
    await expect(page).toHaveURL(`/#roaster-${seed.roaster.slug}`);
    await expect(page.getByRole("heading", { level: 2, name: seed.roaster.name })).toBeInViewport();
  });

  test("applies the Stitch type and colour tokens", async ({ page }) => {
    await page.goto("/");
    expect(await css(page, "body", "background-color")).toBe(rgb.lightSurface);
    expect(await css(page, "body", "font-family")).toMatch(/Newsreader/);
    expect(await css(page, "h1", "font-family")).toMatch(/Manrope/);
    expect(await css(page, "h1", "color")).toBe(rgb.primary);
    expect(await css(page, ".chip", "background-color")).toBe(rgb.secondaryContainer);
    // No-line rule: the header is glass, not ruled off.
    expect(await css(page, ".site-header", "border-bottom-style")).toBe("none");
    expect(await css(page, ".site-header", "backdrop-filter")).toContain("blur");
  });

  test("switches to the dark palette", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await css(page, "body", "background-color")).toBe(rgb.darkSurface);
    expect(await css(page, "h1", "color")).toBe("rgb(235, 232, 227)");
  });

  test("fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Roaster spotlight" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("bean page", () => {
  test("shows specs, prices, recipes and reviews", async ({ page }) => {
    await page.goto(beanPath(seed.inStock.slug));

    await expect(page.getByRole("heading", { level: 1, name: seed.inStock.name })).toBeVisible();
    await expect(page.getByText("from £12.50")).toBeVisible();
    await expect(page.getByText("Colombia • Light roast")).toBeVisible();
    await expect(page.getByRole("list", { name: "Tasting notes" }).getByRole("listitem")).toHaveText([...seed.inStock.tastingNotes]);

    const spec = (term: string) => page.locator(".spec", { has: page.locator("dt", { hasText: term }) }).locator("dd");
    await expect(page.locator(".spec dt")).toHaveText(["Roaster", "Region", "Producer", "Altitude", "Process", "Varietals"]);
    await expect(spec("Roaster")).toHaveText(`${seed.roaster.name}, ${seed.roaster.city}`);
    await expect(spec("Region")).toHaveText("Huila, Colombia");
    await expect(spec("Producer")).toHaveText("Néstor Lasso");
    await expect(spec("Altitude")).toHaveText("1,850 MASL");
    await expect(spec("Process")).toHaveText("Washed");
    await expect(spec("Varietals")).toHaveText("Pink Bourbon");
    await expect(page.getByRole("heading", { level: 2, name: "Brewing guide" })).toBeVisible();

    await expect(page.getByRole("radio")).toHaveCount(2);
    await expect(page.locator(".variant")).toHaveText([/250g \/ Wholebean\s*£12\.50/, /1kg \/ Wholebean\s*£42\.00/]);

    const roasterPicks = page.getByRole("region", { name: "From the roaster" }).locator(".card");
    await expect(roasterPicks).toHaveCount(1);
    await expect(roasterPicks).toContainText("Roaster's pick");
    await expect(roasterPicks).toContainText(`By ${seed.roaster.name}`);
    await expect(roasterPicks.getByLabel("12 upvotes")).toBeVisible();

    const community = page.getByRole("region", { name: "From the community" }).locator(".card");
    await expect(community.locator("h3")).toHaveText(["V60 Pour-Over", "AeroPress", "Espresso"]);
    const v60 = community.nth(0);
    await expect(v60).toContainText("By alice");
    await expect(v60.getByLabel("7 upvotes")).toBeVisible();
    await expect(v60.locator(".step", { hasText: "Ratio" })).toContainText("15g → 250g (1:16.7)");
    await expect(v60.locator(".step", { hasText: "Temperature" })).toContainText("94°C");
    await expect(v60.locator(".step", { hasText: "Grind" })).toContainText("Comandante C40 @ 24 clicks");
    const espresso = community.nth(2);
    await expect(espresso.locator(".step")).toHaveCount(1);
    await expect(espresso).toContainText("18g → 40g (1:2.2)");

    const reviews = page.locator(".review");
    await expect(reviews).toHaveCount(2);
    await expect(reviews.first()).toContainText("alice");
    await expect(reviews.first().getByRole("img", { name: "5.0 out of 5" })).toBeVisible();
    await expect(reviews.first().getByRole("list", { name: "Tasted" })).toHaveText(/Rhubarb\s*Cherry/);
    await expect(reviews.first()).toContainText("Bright and juicy, with a long floral finish.");
    await expect(reviews.nth(1).getByRole("img", { name: "4.0 out of 5" })).toBeVisible();
  });

  test("orders the chosen size and quantity on the roaster's Shopify checkout", async ({ page }) => {
    await page.goto(beanPath(seed.inStock.slug));
    const order = page.getByRole("link", { name: /^Order ·/ });
    const cart = (variant: string, qty: number) => `https://${seed.roaster.checkoutDomain}/cart/${variant}:${qty}`;

    // Cheapest size is preselected.
    await expect(page.getByRole("radio", { name: /250g/ })).toBeChecked();
    await expect(order).toHaveText("Order · £12.50");
    await expect(order).toHaveAttribute("href", cart(seed.inStock.variants.small, 1));
    await expect(order).toHaveAttribute("target", "_blank");
    await expect(page.getByText(`You'll check out on ${seed.roaster.name}' own shop.`)).toBeVisible();

    await page.getByText("1kg / Wholebean").click();
    await expect(page.getByRole("radio", { name: /1kg/ })).toBeChecked();
    expect(await css(page, ".variant:has(input:checked)", "background-color")).toBe(rgb.surfaceTint);

    const fewer = page.getByRole("button", { name: "Fewer" });
    const more = page.getByRole("button", { name: "More" });
    await expect(fewer).toBeDisabled();
    await more.click();
    await more.click();
    await expect(page.getByRole("group", { name: "Quantity" })).toContainText("3");
    await expect(order).toHaveText("Order · £126.00");
    await expect(order).toHaveAttribute("href", cart(seed.inStock.variants.large, 3));

    await fewer.click();
    await expect(order).toHaveAttribute("href", cart(seed.inStock.variants.large, 2));
  });

  test("stops the quantity at the order limit", async ({ page }) => {
    await page.goto(beanPath(seed.inStock.slug));
    const more = page.getByRole("button", { name: "More" });
    for (let i = 1; i < 10; i++) await more.click();
    await expect(more).toBeDisabled();
    await expect(page.getByRole("link", { name: /^Order ·/ })).toHaveAttribute("href", /:10$/);
  });

  test("keeps the product JSON-LD for search engines", async ({ page }) => {
    await page.goto(beanPath(seed.inStock.slug));
    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(jsonLd).toMatchObject({
      "@type": "Product",
      name: seed.inStock.name,
      brand: { name: seed.roaster.name },
      aggregateRating: { ratingValue: 4.5, reviewCount: 2 },
    });
    expect(jsonLd.offers.map((o: { price: string }) => o.price)).toEqual(["12.50", "42.00"]);
  });

  test("uses tonal surfaces and ghost borders instead of rules", async ({ page }) => {
    await page.goto(beanPath(seed.inStock.slug));
    expect(await css(page, ".card", "border-style")).toBe("none");
    expect(await css(page, ".variant", "border-style")).toBe("none");
    expect(await css(page, ".step-icon", "font-family")).toMatch(/Material Symbols Outlined/);
    // outline-variant (#c3c8c1) at 20%.
    expect(await css(page, ".spec dd", "border-bottom-color")).toMatch(/^(rgba\(195, 200, 193, 0\.2\)|color\(srgb 0\.76\d* 0\.78\d* 0\.75\d* \/ 0\.2\))$/);
  });

  test("explains when a lot has sold out", async ({ page }) => {
    await page.goto(beanPath(seed.soldOut.slug));
    await expect(page.getByRole("heading", { level: 1, name: seed.soldOut.name })).toBeVisible();
    await expect(page.getByText("This lot has sold out. Reviews and recipes stay here for reference.")).toBeVisible();
    await expect(page.locator(".price")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Order ·/ })).toHaveCount(0);
    await expect(page.getByText("No recipes yet — be the first to share your dial-in.")).toBeVisible();
    await expect(page.getByText("No reviews yet.")).toBeVisible();
  });

  test("returns 404 for an unknown coffee", async ({ page }) => {
    const response = await page.goto(beanPath("does-not-exist"));
    expect(response?.status()).toBe(404);
  });

  test("fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(beanPath(seed.inStock.slug));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
