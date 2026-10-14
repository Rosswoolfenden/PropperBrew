/**
 * The Expo app, rendered through react-native-web at phone size. Covers layout, styling and
 * data flow; native-only behaviour (camera capture, push) is out of reach here.
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { accessToken, apiUrl, rgb, seed } from "../fixtures";

const beanPath = `/bean/${seed.roaster.slug}/${seed.inStock.slug}`;
/** The in-screen headline; the native-stack header renders the same title as a level-1 heading. */
const screenHeading = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true }).and(page.locator(":not([aria-level])"));
const style = (locator: Locator, prop: string) => locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** Seeds supabase-js's persisted session (AsyncStorage is localStorage on web) so the app is signed in as Alice. */
async function signIn(page: Page) {
  const { token, exp } = accessToken(seed.alice);
  const session = {
    access_token: token,
    refresh_token: "e2e-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: { id: seed.alice.id, aud: "authenticated", role: "authenticated", email: seed.alice.email },
  };
  // Storage key is derived from the Supabase URL's first hostname label (127.0.0.1 → "127").
  await page.addInitScript((value) => window.localStorage.setItem("sb-127-auth-token", value), JSON.stringify(session));
}

async function shelfSize(request: APIRequestContext) {
  const res = await request.get(`${apiUrl}/trpc/shelf.list`, {
    headers: { authorization: `Bearer ${accessToken(seed.alice).token}` },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()).result.data.json as unknown[]).length;
}

test.describe("discover", () => {
  test("shows a row of coffees per roaster, newest roaster first", async ({ page }) => {
    await page.goto("/");
    const headline = screenHeading(page, "The Collection");
    await expect(headline).toBeVisible();

    const rows = page.getByRole("region", { name: /coffees$/ });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAccessibleName(`${seed.secondRoaster.name} coffees`);
    await expect(rows.nth(1)).toHaveAccessibleName(`${seed.roaster.name} coffees`);
    await expect(page.getByText(seed.goneQuiet.name)).toHaveCount(0);
    await expect(page.getByText(seed.soldOut.name)).toHaveCount(0);

    const hackney = rows.nth(0);
    await expect(hackney.getByText("2 coffees")).toBeVisible();
    await expect(hackney.getByRole("link")).toHaveCount(2);
    const kochere = hackney.getByRole("link").filter({ hasText: "Kochere Natural" });
    await expect(kochere).toContainText("£14.00");
    await expect(kochere).toContainText("Ethiopia • Natural");
    await expect(rows.nth(1).getByRole("link").filter({ hasText: seed.inStock.name })).toContainText("from £12.50");

    expect(await style(headline, "font-family")).toMatch(/Manrope_800ExtraBold/);
    expect(await style(headline, "color")).toBe(rgb.primary);
  });

  test("lists the collection and newest coffees, in the design's order", async ({ page }) => {
    await page.goto("/");
    const sections = page.getByRole("heading").and(page.locator(":not([aria-level])"));
    await expect(sections).toHaveText([
      "The Collection",
      "New arrivals",
      seed.secondRoaster.name,
      seed.roaster.name,
    ]);
    const arrivals = page.getByRole("region", { name: "New arrivals" }).getByRole("link");
    await expect(arrivals).toHaveCount(3);
    await expect(arrivals.nth(0)).toContainText("Kochere Natural");
    await expect(arrivals.nth(0)).toContainText(`${seed.secondRoaster.name} · Notes of blueberry & jasmine`);
    await expect(arrivals.nth(1)).toContainText(seed.inStock.name);
    await expect(arrivals.nth(2)).toContainText("Cerrado Pulped Natural");
  });

  test("puts scan and shelf in the top bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("PropperBrew", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "My shelf" }).click();
    await expect(page).toHaveURL("/shelf");
    await page.goBack();
    await page.getByRole("button", { name: "Scan a bag" }).click();
    await expect(page).toHaveURL("/scan");
  });

  test("coffee rows scroll sideways", async ({ page }) => {
    await page.goto("/");
    const row = page.getByRole("region", { name: `${seed.secondRoaster.name} coffees` });
    const kochere = row.getByText("Kochere Natural");
    const cerrado = row.getByText("Cerrado Pulped Natural");
    // Bring the row on screen first, so only horizontal position decides visibility.
    // The next card deliberately peeks in from the edge, so check for full visibility.
    await kochere.scrollIntoViewIfNeeded();
    await expect(kochere).toBeInViewport({ ratio: 1 });
    await expect(cerrado).not.toBeInViewport({ ratio: 1 });
    // The row's FlatList renders as a horizontally scrolling div; scroll it to the end.
    const scrolled = await cerrado.evaluate((el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (["auto", "scroll"].includes(getComputedStyle(node).overflowX)) {
          // Not scrollTo(): react-native-web swaps that for its own ({ x, y }) on scroll views.
          node.scrollLeft = node.scrollWidth;
          return true;
        }
      }
      return false;
    });
    expect(scrolled).toBe(true);
    await expect(cerrado).toBeInViewport({ ratio: 1 });
    await expect(kochere).not.toBeInViewport({ ratio: 1 });
  });

  test("spotlight counts through roasters and jumps to their coffees", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("01 / 02")).toBeVisible();
    // First match is the spotlight card; the collection grid has the same button further down.
    const northStar = page.getByRole("button", { name: `${seed.roaster.name}, see their coffees` }).first();
    await northStar.scrollIntoViewIfNeeded();
    await expect(page.getByText("02 / 02")).toBeVisible();
    await expect(page.getByText(/first specialty roastery/)).toBeVisible();

    await northStar.click();
    await expect(page.getByRole("region", { name: `${seed.roaster.name} coffees` }).getByText(seed.inStock.name)).toBeInViewport();
  });

  test("opens the bean screen from a coffee card", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("region", { name: `${seed.roaster.name} coffees` }).getByRole("link").filter({ hasText: seed.inStock.name }).click();
    await expect(page).toHaveURL(beanPath);
    await expect(screenHeading(page, seed.inStock.name)).toBeVisible();
  });

  test("uses the dark palette", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const headline = screenHeading(page, "The Collection");
    await expect(headline).toBeVisible();
    expect(await style(headline, "color")).toBe("rgb(235, 232, 227)");
    const screenBackground = await page.evaluate(() =>
      [...document.querySelectorAll("div")].some((el) => getComputedStyle(el).backgroundColor === "rgb(28, 28, 25)"),
    );
    expect(screenBackground).toBe(true);
  });
});

test.describe("bean", () => {
  test("shows specs, prices and recipes", async ({ page }) => {
    await page.goto(beanPath);
    await expect(screenHeading(page, seed.inStock.name)).toBeVisible();
    await expect(page.getByText("Colombia • Light roast", { exact: true })).toBeVisible();
    await expect(page.getByText("from £12.50", { exact: true })).toBeVisible();
    for (const note of seed.inStock.tastingNotes) {
      const chip = page.getByText(note, { exact: true });
      await expect(chip).toBeVisible();
      expect(await style(chip.locator(".."), "background-color")).toBe(rgb.secondaryContainer);
    }
    for (const [label, value] of [
      ["Roaster", seed.roaster.name],
      ["Region", "Huila, Colombia"],
      ["Producer", "Néstor Lasso"],
      ["Altitude", "1,850 MASL"],
      ["Process", "Washed"],
      ["Varietals", "Pink Bourbon"],
    ] as const) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByText(value, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("radio")).toHaveText([/250g \/ Wholebean\s*£12\.50/, /1kg \/ Wholebean\s*£42\.00/]);
    await expect(page.getByText("15g → 250g (1:16.7)")).toBeVisible();
    await expect(page.getByText("Comandante C40 @ 24 clicks")).toBeVisible();
    await expect(page.getByText("18g → 40g (1:2.2)")).toBeVisible();
  });

  test("filters recipes by brew method", async ({ page }) => {
    await page.goto(beanPath);
    const v60 = page.getByText("15g → 250g (1:16.7)");
    const espresso = page.getByText("18g → 40g (1:2.2)");
    await expect(v60).toBeVisible();

    const filter = (name: string) => page.getByRole("button", { name, exact: true });
    await filter("Espresso").click();
    await expect(espresso).toBeVisible();
    await expect(v60).toHaveCount(0);
    await expect(filter("Espresso")).toHaveAttribute("aria-selected", "true");
    expect(await style(filter("Espresso"), "background-color")).toBe(rgb.surfaceTint);

    await filter("V60").click();
    await expect(v60).toBeVisible();
    await expect(espresso).toHaveCount(0);

    await filter("AeroPress").click();
    await expect(page.getByText("15g → 230g (1:15.3)")).toBeVisible();
    await expect(v60).toHaveCount(0);

    await filter("All").click();
    await expect(v60).toBeVisible();
    await expect(espresso).toBeVisible();
  });

  test("orders the chosen size and quantity on the roaster's Shopify checkout", async ({ page }) => {
    // expo-web-browser opens a popup on web; record the URL instead of leaving for Shopify.
    await page.addInitScript(() => {
      const opened: string[] = ((window as unknown as { opened: string[] }).opened = []);
      window.open = (url) => {
        opened.push(String(url));
        return { closed: false, focus() {}, close() {} } as unknown as Window;
      };
    });
    await page.goto(beanPath);
    const cart = (variant: string, qty: number) => `https://${seed.roaster.checkoutDomain}/cart/${variant}:${qty}`;
    const order = page.getByRole("button", { name: /^Order ·/ });

    await expect(page.getByRole("radio", { name: /250g/ })).toHaveAttribute("aria-checked", "true");
    await expect(order).toHaveText("Order · £12.50");
    await expect(page.getByText(`You'll check out on ${seed.roaster.name}' own shop.`)).toBeVisible();

    const large = page.getByRole("radio", { name: /1kg/ });
    await large.click();
    await expect(large).toHaveAttribute("aria-checked", "true");
    expect(await style(large, "background-color")).toBe(rgb.surfaceTint);

    await expect(page.getByRole("button", { name: "Fewer" })).toBeDisabled();
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByLabel("Quantity 3")).toBeVisible();
    await expect(order).toHaveText("Order · £126.00");

    await order.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([
      cart(seed.inStock.variants.large, 3),
    ]);
  });

  test("shows the sold-out note when nothing is in stock", async ({ page }) => {
    await page.goto(`/bean/${seed.roaster.slug}/${seed.soldOut.slug}`);
    await expect(screenHeading(page, seed.soldOut.name)).toBeVisible();
    await expect(page.getByText("Sold out — reviews and recipes stay here for reference.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Order ·/ })).toHaveCount(0);
  });

  test("adds the coffee to the signed-in user's shelf", async ({ page, request }) => {
    const before = await shelfSize(request);
    await signIn(page);
    await page.goto(beanPath);
    await page.getByRole("button", { name: "Add to my shelf" }).click();
    await expect.poll(() => shelfSize(request)).toBe(before + 1);
  });
});

test.describe("recipe", () => {
  const recipePath = `/recipe/${seed.inStock.v60RecipeId}`;

  test("opens from a coffee's brewing guide", async ({ page }) => {
    await page.goto(beanPath);
    await page.getByRole("link", { name: "V60 Pour-Over recipe by alice" }).click();
    await expect(page).toHaveURL(recipePath);
    await expect(screenHeading(page, "V60 Pour-Over")).toBeVisible();
  });

  test("shows the parameters, profile and steps", async ({ page }) => {
    await page.goto(recipePath);
    await expect(screenHeading(page, "V60 Pour-Over")).toBeVisible();
    await expect(page.getByText("Recipe by alice")).toBeVisible();
    await expect(page.getByText(/^A clean, bright cup/)).toBeVisible();

    for (const [label, value] of [
      ["Coffee dose", "15 g"],
      ["Total water", "250 g"],
      ["Temperature", "94 °C"],
      ["Grind", "24 clicks on Comandante C40"],
      ["Brew time", "2:45"],
    ] as const) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByText(value, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Anticipated profile")).toBeVisible();
    for (const note of seed.inStock.tastingNotes) await expect(page.getByText(note, { exact: true })).toBeVisible();

    await expect(screenHeading(page, "The Ritual")).toBeVisible();
    for (const [n, title, meta] of [
      ["01", "The bloom", "0:00 · to 45g"],
      ["02", "The main pour", "0:30 · to 150g"],
      ["03", "The finish", "1:15 · to 250g"],
    ] as const) {
      await expect(page.getByText(n, { exact: true })).toBeVisible();
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(page.getByText(meta, { exact: true })).toBeVisible();
    }

    // Back to the coffee from the byline.
    await page.getByText(seed.inStock.name).click();
    await expect(page).toHaveURL(beanPath);
  });

  test("brew timer follows the steps, pauses and resets", async ({ page }) => {
    await page.clock.install();
    await page.goto(recipePath);
    const clock = page.getByLabel(/^Brew time /);
    await expect(page.getByText("Timer ready")).toBeVisible();
    await expect(clock).toHaveText("00:00");
    await expect(page.getByText("Target 2:45")).toBeVisible();

    await page.getByRole("button", { name: "Start brewing" }).click();
    await page.clock.runFor(5_000);
    await expect(clock).toHaveText("00:05");
    await expect(page.getByText("The bloom", { exact: true }).last()).toBeVisible();

    await page.clock.runFor(30_000);
    await expect(clock).toHaveText("00:35");
    // Status shows the step under way, and its number is highlighted in the list.
    await expect(page.locator('[aria-current="step"]')).toContainText("The main pour");

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Paused")).toBeVisible();
    await page.clock.runFor(10_000);
    await expect(clock).toHaveText("00:35");

    await page.getByRole("button", { name: "Resume" }).click();
    await page.clock.runFor(130_000);
    await expect(page.getByText("Brew complete")).toBeVisible();

    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(clock).toHaveText("00:00");
    await expect(page.getByText("Timer ready")).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveCount(0);
  });

  test("says when a recipe doesn't exist", async ({ page }) => {
    await page.goto("/recipe/00000000-0000-4000-8000-000000000999");
    await expect(page.getByText("Recipe not found.")).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("brewing guide", () => {
  test("puts the roaster's recommendation first, then the community by upvotes", async ({ page }) => {
    await page.goto(beanPath);
    const roaster = page.getByRole("region", { name: "From the roaster" });
    await expect(roaster.getByRole("link")).toHaveCount(1);
    const pick = roaster.getByRole("link", { name: `V60 Pour-Over recipe by ${seed.roaster.name}` });
    await expect(pick).toContainText("Roaster's pick");
    await expect(pick.getByRole("button", { name: /^Upvote, 12 upvotes$/ })).toBeVisible();

    const community = page.getByRole("region", { name: "From the community" }).getByRole("link");
    await expect(community).toHaveCount(3);
    await expect(community.nth(0)).toHaveAccessibleName("V60 Pour-Over recipe by alice");
    await expect(community.nth(1)).toHaveAccessibleName("AeroPress recipe by alice");
    await expect(community.nth(2)).toHaveAccessibleName("Espresso recipe by ben");
    await expect(community.nth(0)).not.toContainText("Roaster's pick");
  });

  test("the recipe screen credits the roaster", async ({ page }) => {
    await page.goto(`/recipe/${seed.inStock.roasterRecipeId}`);
    await expect(page.getByText("Roaster's pick")).toBeVisible();
    await expect(page.getByText(`Recommended by ${seed.roaster.name}. Tried it? Upvote it.`)).toBeVisible();
  });
});

test.describe("upvotes", () => {
  const espresso = `/recipe/${seed.inStock.espressoRecipeId}`;

  test("signed-out people are asked to sign in", async ({ page }) => {
    await page.goto(espresso);
    await page.getByRole("button", { name: /^Upvote, \d+ upvotes?$/ }).click();
    await expect(page).toHaveURL("/sign-in");
  });

  test("toggle on and off, and persist", async ({ page }) => {
    await signIn(page);
    await page.goto(espresso);
    const before = page.getByRole("button", { name: "Upvote, 2 upvotes" });
    await expect(before).toHaveAttribute("aria-pressed", "false");

    // Wait for the server to record it: reloading straight away would abort the request.
    const saved = page.waitForResponse((r) => r.url().includes("recipes.toggleUpvote") && r.ok());
    await before.click();
    await saved;
    const after = page.getByRole("button", { name: "Remove upvote, 3 upvotes" });
    await expect(after).toHaveAttribute("aria-pressed", "true");
    expect(await style(after, "background-color")).toBe(rgb.surfaceTint);

    // Comes back from the server after a reload.
    await page.reload();
    await expect(page.getByRole("button", { name: "Remove upvote, 3 upvotes" })).toBeVisible();

    await page.getByRole("button", { name: "Remove upvote, 3 upvotes" }).click();
    await expect(page.getByRole("button", { name: "Upvote, 2 upvotes" })).toHaveAttribute("aria-pressed", "false");
  });

  test("the API refuses votes on recipes that don't exist", async ({ request }) => {
    const res = await request.post(`${apiUrl}/trpc/recipes.toggleUpvote`, {
      headers: { authorization: `Bearer ${accessToken(seed.alice).token}` },
      data: { json: { recipeId: "00000000-0000-4000-8000-000000000999" } },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("add your recipe", () => {
  const newPath = `/recipe/new?beanId=${seed.inStock.id}&beanName=${encodeURIComponent(seed.inStock.name)}`;

  test("asks signed-out people to sign in", async ({ page }) => {
    await page.goto(newPath);
    await expect(page.getByRole("button", { name: "Sign in to add a recipe" })).toBeVisible();
  });

  test("validates, then shares a recipe that shows up on the coffee", async ({ page }) => {
    await signIn(page);
    await page.goto(beanPath);
    await page.getByRole("button", { name: "Add your recipe" }).click();
    await expect(screenHeading(page, "Add your recipe")).toBeVisible();
    // The coffee page stays mounted under the modal, so take the last match (the form's byline).
    await expect(page.getByText(seed.inStock.name).last()).toBeVisible();

    // Nothing filled in.
    await page.getByRole("button", { name: "Share recipe" }).click();
    await expect(page.getByText("Enter the coffee dose")).toBeVisible();
    await expect(page.getByText("Enter the total water")).toBeVisible();

    await page.getByRole("button", { name: "Chemex", exact: true }).click();
    await page.getByLabel("Coffee dose (g)").fill("16");
    await page.getByLabel("Total water (g)").fill("260");
    await expect(page.getByText("Ratio 1:16.3")).toBeVisible();
    await page.getByLabel("Temperature (°C)").fill("150");
    await page.getByLabel("Brew time").fill("4:00");
    await page.getByLabel("Grinder").fill("Baratza Encore");
    await page.getByLabel("Grind setting").fill("18");
    await page.getByLabel("Notes").fill("Bright and tea-like.");

    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Step 1 title").fill("Bloom");
    await page.getByLabel("Step 1 starts at").fill("0:30");
    await page.getByLabel("Step 1 water to (g)").fill("60");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Step 2 title").fill("Fill");
    await page.getByLabel("Step 2 starts at").fill("0:00");
    await page.getByLabel("Step 2 water to (g)").fill("260");
    await page.getByLabel("Step 2 instructions").fill("Slow spirals to the top.");

    await page.getByRole("button", { name: "Share recipe" }).click();
    await expect(page.getByText("Enter a temperature between 0 and 100°C")).toBeVisible();
    await expect(page.getByText("Steps need to be in time order")).toBeVisible();

    await page.getByLabel("Temperature (°C)").fill("94");
    await page.getByLabel("Step 1 starts at").fill("0:00");
    await page.getByLabel("Step 2 starts at").fill("0:45");
    await page.getByRole("button", { name: "Share recipe" }).click();

    await expect(page).toHaveURL(/\/recipe\/[0-9a-f-]{36}$/);
    await expect(screenHeading(page, "Chemex")).toBeVisible();
    await expect(page.getByText("Recipe by alice")).toBeVisible();
    await expect(page.getByText("16 g", { exact: true })).toBeVisible();
    await expect(page.getByText("18 on Baratza Encore", { exact: true })).toBeVisible();
    await expect(page.getByText("Fill", { exact: true })).toBeVisible();
    await expect(page.getByText("0:45 · to 260g")).toBeVisible();

    await page.goto(beanPath);
    await expect(
      page.getByRole("region", { name: "From the community" }).getByRole("link", { name: "Chemex recipe by alice" }),
    ).toBeVisible();
  });
});

test.describe("shelf", () => {
  test("asks signed-out users to sign in, then shows the sign-in form", async ({ page }) => {
    await page.goto("/shelf");
    const cta = page.getByRole("button", { name: "Sign in to see your shelf" });
    await expect(cta).toBeVisible({ timeout: 30_000 }); // react-query retries the 401 before erroring
    await cta.click();

    await expect(page).toHaveURL("/sign-in");
    await expect(page.getByRole("heading", { name: "The Ritual Awaits" })).toBeVisible();
    const email = page.getByLabel("Email address");
    await expect(email).toHaveAttribute("placeholder", "your@email.com");
    expect(await style(email, "background-color")).toBe("rgb(229, 226, 221)");
    expect(await style(email, "border-top-width")).toBe("0px");
    await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await expect(page.getByText("PROPPERBREW", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL("/shelf");
  });

  test("lists the signed-in user's bags with their rest state", async ({ page }) => {
    await signIn(page);
    await page.goto("/shelf");
    await expect(page.getByText(seed.inStock.name).first()).toBeVisible();
    await expect(page.getByText(/^Day 10 post-roast$/).first()).toBeVisible();
    await expect(page.getByText(seed.soldOut.name)).toBeVisible();
    // The add-to-shelf test may have added another undated bag.
    await expect(page.getByText("Add a roast date to track resting").first()).toBeVisible();
  });
});
