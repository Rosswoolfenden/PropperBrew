/**
 * Signing in on the website, for coffee drinkers and roasters: real accounts on the local auth
 * service, and Shopify (e2e/fake-shopify.ts) for connecting a store and "Continue with Shopify".
 */
import { expect, test, type Page } from "@playwright/test";
import { accounts, apiUrl, emailTo, seed, seededShopDomains, sql } from "../fixtures";

const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** The name the fake Shopify gives a shop: "corner-ab12" → "Corner Ab12". */
const shopName = (handle: string) => handle.replace(/(^|-)(\w)/g, (_, dash, c: string) => `${dash ? " " : ""}${c.toUpperCase()}`);

const banner = (page: Page) => page.getByRole("banner");
/** The page's own alerts (Next.js adds a hidden route announcer with role="alert" too). */
const alert = (page: Page) => page.getByRole("main").getByRole("alert");

async function signIn(page: Page, email: string, password: string, from = "/sign-in") {
  await page.goto(from);
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function createAccount(page: Page, from: "/sign-in" | "/business", email = `${unique("brewer")}@example.com`) {
  await page.goto(from);
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByRole("button", { name: "Create account" }).click();
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill("a-long-password");
  await form.getByRole("button", { name: from === "/business" ? "Create business account" : "Create account", exact: true }).click();
  // New accounts confirm their email first; the link signs them in where they were heading.
  await expect(form.getByRole("status")).toHaveText(`Check your email. We've sent a link to ${email} to confirm your account. Resend the email`);
  const { link } = await emailTo(email, "Confirm your PropperBrew account");
  await page.goto(link!);
  return email;
}

test.describe("banner", () => {
  test("offers sign-in for coffee drinkers and roasters", async ({ page }) => {
    await page.goto("/");
    await expect(banner(page).getByRole("link", { name: "PropperBrew" })).toHaveAttribute("href", "/");
    await expect(banner(page).getByRole("link", { name: "For roasters" })).toHaveAttribute("href", "/business");
    await expect(banner(page).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    await expect(banner(page).getByRole("button", { name: "Sign out" })).toHaveCount(0);

    await banner(page).getByRole("link", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The Ritual Awaits" })).toBeVisible();
    await page.goto("/");
    await banner(page).getByRole("link", { name: "For roasters" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your coffee, in front of the people who brew it" })).toBeVisible();
  });
});

test.describe("coffee drinkers", () => {
  test("sign in, stay signed in, and sign out", async ({ page }) => {
    await signIn(page, accounts.alice.email, accounts.alice.password);
    await expect(page).toHaveURL("/");
    // Their name, linking to their profile.
    await expect(banner(page).getByRole("link", { name: "Alice", exact: true })).toHaveAttribute("href", `/u/${accounts.alice.username}`);
    await expect(banner(page).getByRole("link", { name: "Dashboard" })).toHaveCount(0);

    await page.reload();
    await expect(banner(page).getByRole("link", { name: "Alice", exact: true })).toBeVisible();

    await banner(page).getByRole("button", { name: "Sign out" }).click();
    await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.reload();
    await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("a wrong password is explained", async ({ page }) => {
    await signIn(page, accounts.alice.email, "not-the-password");
    await expect(alert(page)).toHaveText("That email and password don't match an account.");
    await expect(page).toHaveURL("/sign-in");
  });

  test("create an account", async ({ page }) => {
    const email = await createAccount(page, "/sign-in");
    await expect(page).toHaveURL(/\/#?$/);
    // Name and username both come from the email (see handle_new_user); the name links to their profile.
    const local = email.split("@")[0]!;
    await expect(banner(page).getByRole("link", { name: local, exact: true })).toHaveAttribute("href", new RegExp(`^/u/${local.replace(/-/g, "")}_`));
    await expect(banner(page).getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  });

  test("short passwords are refused before sending", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Email address", { exact: true }).fill(`${unique("short")}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(alert(page)).toHaveText("Use at least 8 characters for your password.");
  });

  test("a coffee drinker's account can't run a roaster", async ({ page, request }) => {
    await signIn(page, accounts.alice.email, accounts.alice.password);
    await expect(page).toHaveURL("/");
    await page.goto("/business/dashboard");
    await expect(page.getByText("This is a coffee drinker's account.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect Shopify store" })).toHaveCount(0);

    // Nor through the API directly.
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"))!;
      return (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token;
    });
    const res = await request.post(`${apiUrl}/trpc/business.connectShopifyUrl`, {
      headers: { authorization: `Bearer ${token}` },
      data: { json: { shop: "someone-else" } },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("roasters", () => {
  // Stores connected here would otherwise show up in other tests' discovery pages.
  test.afterAll(() => {
    sql(`delete from roasters where shopify_domain not in (${seededShopDomains.map((d) => `'${d}'`).join(", ")})`);
  });

  test("the business page offers email and Shopify sign-in", async ({ page }) => {
    await page.goto("/business");
    await expect(page.getByRole("heading", { name: "Sign in with email" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Already on Shopify?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Shopify" })).toBeVisible();

    await page.getByLabel("Shopify store", { exact: true }).fill("north-star.com");
    await page.getByRole("button", { name: "Continue with Shopify" }).click();
    await expect(alert(page)).toHaveText("Enter your store's address, e.g. your-store.myshopify.com");
  });

  test("a roaster's owner sees their dashboard", async ({ page }) => {
    await signIn(page, accounts.northStarOwner.email, accounts.northStarOwner.password, "/business");
    await expect(page).toHaveURL("/business/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: seed.roaster.name })).toBeVisible();
    await expect(banner(page).getByRole("link", { name: "Dashboard" })).toBeVisible();

    const panel = page.getByRole("region", { name: `${seed.roaster.name} dashboard` });
    await expect(panel.getByText("Owner", { exact: true })).toBeVisible();
    await expect(panel.locator(".stat").nth(0)).toContainText(`Connected${seed.roaster.checkoutDomain}`);
    await expect(panel.locator(".stat").nth(1)).toContainText("1of 2 coffees");
    await expect(panel.locator(".coffee-line")).toHaveText([
      new RegExp(`${seed.inStock.name}.*In stock.*£12\\.50`),
      new RegExp(`${seed.soldOut.name}.*Sold out.*—`),
    ]);
    await panel.locator(".coffee-line").getByRole("link", { name: seed.inStock.name }).click();
    await expect(page).toHaveURL(`/${seed.roaster.slug}/${seed.inStock.slug}`);
  });

  test("a new business connects its Shopify store and its coffees sync in", async ({ page }) => {
    await createAccount(page, "/business", `${unique("owner")}@roaster.test`);
    await expect(page).toHaveURL(/\/business\/dashboard#?$/);
    await expect(page.getByRole("heading", { name: "Connect your Shopify store" })).toBeVisible();

    await page.getByLabel("Shopify store", { exact: true }).fill("not a store!");
    await page.getByRole("button", { name: "Connect Shopify store" }).click();
    await expect(alert(page)).toContainText("Enter your store's myshopify.com address");

    // Round trip through (fake) Shopify's approval screen and back.
    const handle = unique("corner");
    await page.getByLabel("Shopify store", { exact: true }).fill(handle);
    await page.getByRole("button", { name: "Connect Shopify store" }).click();
    await expect(page).toHaveURL(`/business/dashboard?connected=${handle}`);
    await expect(page.getByRole("status")).toHaveText(`${shopName(handle)} is connected. Your products sync from Shopify automatically.`);

    const panel = page.getByRole("region", { name: `${shopName(handle)} dashboard` });
    await expect(panel.getByText("Owner", { exact: true })).toBeVisible();
    await expect(panel.locator(".stat").nth(0)).toContainText(`Connected${handle}.myshopify.com`);
    // Products sync in the background; the dashboard picks them up.
    await expect(panel.locator(".coffee-line")).toHaveText([/House Espresso.*In stock.*£10\.50/], { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Connect another store" })).toBeVisible();
  });

  test("Continue with Shopify signs a store's staff member in", async ({ page }) => {
    await page.goto("/business");
    await page.getByLabel("Shopify store", { exact: true }).fill(seed.roaster.checkoutDomain);
    await page.getByRole("button", { name: "Continue with Shopify" }).click();

    // supabase-js reads the session from the link's #fragment and clears it, leaving a bare "#".
    await expect(page).toHaveURL(/\/business\/dashboard#?$/);
    await expect(page.getByRole("heading", { level: 1, name: seed.roaster.name })).toBeVisible();
    // North Star already has an owner, so this person joins as staff.
    const panel = page.getByRole("region", { name: `${seed.roaster.name} dashboard` });
    await expect(panel.getByText("Staff", { exact: true })).toBeVisible();
    await expect(banner(page).locator('a[href^="/u/owner_"]')).toBeVisible();

    // Signed in for real: still there after a reload.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: seed.roaster.name })).toBeVisible();
  });

  test("Continue with Shopify explains a store that isn't connected", async ({ page }) => {
    await page.goto("/business");
    await page.getByLabel("Shopify store", { exact: true }).fill("never-heard-of-it");
    await page.getByRole("button", { name: "Continue with Shopify" }).click();
    await expect(page).toHaveURL(/\/business\?error=not-connected/);
    await expect(alert(page)).toHaveText(
      "never-heard-of-it.myshopify.com isn't on PropperBrew yet. Create a business account below, then connect your store from your dashboard.",
    );
    await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("Continue with Shopify refuses a store that removed the app", async ({ page }) => {
    // Gone Quiet installed PropperBrew once, then uninstalled it (db/seed.sql).
    await page.goto("/business");
    await page.getByLabel("Shopify store", { exact: true }).fill("gone-quiet");
    await page.getByRole("button", { name: "Continue with Shopify" }).click();
    await expect(page).toHaveURL(/\/business\?error=not-connected/);
    await expect(alert(page)).toContainText("gone-quiet.myshopify.com isn't on PropperBrew yet.");
    await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("Continue with Shopify refuses an unverified staff email", async ({ page }) => {
    // Get a store connected first (by a business account), then try to sign in through it.
    await createAccount(page, "/business", `${unique("owner")}@roaster.test`);
    await expect(page.getByRole("heading", { name: "Connect your Shopify store" })).toBeVisible();
    const handle = unique("unverified");
    await page.getByLabel("Shopify store", { exact: true }).fill(handle);
    await page.getByRole("button", { name: "Connect Shopify store" }).click();
    await expect(page).toHaveURL(`/business/dashboard?connected=${handle}`);
    await banner(page).getByRole("button", { name: "Sign out" }).click();

    await page.goto("/business");
    await page.getByLabel("Shopify store", { exact: true }).fill(handle);
    await page.getByRole("button", { name: "Continue with Shopify" }).click();
    await expect(page).toHaveURL("/business?error=email-unverified");
    await expect(alert(page)).toContainText("Shopify hasn't verified the email on your staff account.");
  });

  test("a connect link that's been tampered with doesn't link the store", async ({ page }) => {
    await createAccount(page, "/business", `${unique("owner")}@roaster.test`);
    await expect(page).toHaveURL(/\/business\/dashboard#?$/);
    await page.goto(`${apiUrl}/api/shopify/auth?shop=${unique("tampered")}.myshopify.com&link=not-a-real-token`);
    await expect(page).toHaveURL("/business/dashboard?error=link-expired");
    await expect(alert(page)).toHaveText("That connection took too long to finish. Please connect your store again.");
    await expect(page.getByRole("heading", { name: "Connect your Shopify store" })).toBeVisible();
  });

  test("the dashboard sends signed-out visitors to the business page", async ({ page }) => {
    await page.goto("/business/dashboard");
    await expect(page).toHaveURL("/business");
  });
});
