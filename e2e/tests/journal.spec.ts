/** The brew journal on the website: your shelf, logging brews, and brewing again. */
import { expect, test, type Page } from "@playwright/test";
import { accessToken, apiUrl, createUser, deleteTestUsers, seed, sql } from "../fixtures";

const main = (page: Page) => page.getByRole("main");
const kochere = `/${seed.kochere.roasterSlug}/${seed.kochere.slug}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
}

test.afterAll(deleteTestUsers);

test("from a bag on your shelf to a journal of brews", async ({ page }) => {
  const user = await createUser("journaller");
  await signIn(page, user.email, user.password);

  // Put a bag on the shelf from the coffee's page.
  await page.goto(kochere);
  const shelfForm = main(page).getByRole("form", { name: "Add to your shelf" });
  await shelfForm.getByLabel("Roast date (on the bag)").fill(daysAgo(10));
  await shelfForm.getByRole("button", { name: "Add to my shelf" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "on your shelf" })).toHaveText(`${seed.kochere.name} is on your shelf. Log a brew in your journal.`);
  await main(page).getByRole("link", { name: "Log a brew in your journal" }).click();
  await expect(page).toHaveURL("/journal");

  const shelf = main(page).getByRole("region", { name: "On your shelf" });
  await expect(shelf.getByRole("listitem")).toHaveCount(1);
  await expect(shelf.getByRole("listitem")).toContainText("Day 10 post-roast");
  await expect(main(page).getByText("No brews yet. Log one from a bag on your shelf.")).toBeVisible();

  // First brew: a blank form, checked before saving.
  await shelf.getByRole("button", { name: "Log a brew" }).click();
  const form = main(page).getByRole("form", { name: `Log a brew of ${seed.kochere.name}` });
  await form.getByRole("button", { name: "Save brew" }).click();
  await expect(form.getByText("Enter the coffee dose")).toBeVisible();
  await form.getByLabel("Method").selectOption({ label: "V60 Pour-Over" });
  await form.getByLabel("Coffee (g)").fill("15");
  await form.getByLabel("Water (g)").fill("250");
  await expect(form.getByText("Ratio 1:16.7")).toBeVisible();
  await form.getByLabel("Temperature (°C)").fill("94");
  await form.getByLabel("Brew time").fill("2:45");
  await form.getByLabel("Grinder").fill("Comandante C40");
  await form.getByLabel("Grind", { exact: true }).fill("22 clicks");
  await form.locator("label").filter({ has: page.getByRole("radio", { name: "4 stars", exact: true }) }).click();
  await form.getByLabel("Notes").fill("Bright, a little thin. Try finer.");
  await form.getByRole("button", { name: "Save brew" }).click();

  const brews = main(page).getByRole("region", { name: "Recent brews" }).getByRole("listitem");
  await expect(brews).toHaveCount(1);
  await expect(brews.first()).toContainText("V60 Pour-Over");
  await expect(brews.first()).toContainText("15g → 250g (1:16.7) · 94°C · 2:45 · Comandante C40 @ 22 clicks");
  await expect(brews.first()).toContainText("Bright, a little thin. Try finer.");
  await expect(brews.first().getByRole("img", { name: "4.0 out of 5" })).toBeVisible();
  await expect(main(page).locator(".journal-stats")).toHaveText("This week1Brew1FavouriteV60 Pour-Over");
  await expect(shelf.getByRole("listitem")).toContainText("1 brew");

  // Second brew from the same bag starts from the first: change only what's different.
  await shelf.getByRole("button", { name: "Log a brew" }).click();
  const again = main(page).getByRole("form", { name: `Log a brew of ${seed.kochere.name}` });
  await expect(main(page).getByText(`Logging a brew of ${seed.kochere.name}, starting from your last one.`)).toBeVisible();
  await expect(again.getByLabel("Coffee (g)")).toHaveValue("15");
  await expect(again.getByLabel("Grind", { exact: true })).toHaveValue("22 clicks");
  await expect(again.getByLabel("Notes")).toHaveValue("");
  await again.getByLabel("Grind", { exact: true }).fill("20 clicks");
  await again.getByRole("button", { name: "Save brew" }).click();
  await expect(brews).toHaveCount(2);
  await expect(brews.first()).toContainText("@ 20 clicks");
  await expect(main(page).locator(".journal-stats")).toHaveText("This week2Brews2FavouriteV60 Pour-Over");

  // Edit one, repeat one, delete one.
  await brews.nth(1).getByRole("button", { name: "Edit" }).click();
  const edit = main(page).getByRole("form", { name: `Edit brew of ${seed.kochere.name}` });
  await expect(edit.getByLabel("Notes")).toHaveValue("Bright, a little thin. Try finer.");
  await edit.locator("label").filter({ has: page.getByRole("radio", { name: "2 stars", exact: true }) }).click();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(brews.nth(1).getByRole("img", { name: "2.0 out of 5" })).toBeVisible();

  await brews.first().getByRole("button", { name: "Brew again" }).click();
  await expect(main(page).getByText("starting from that brew.")).toBeVisible();
  await main(page).getByRole("form", { name: `Log a brew of ${seed.kochere.name}` }).getByRole("button", { name: "Cancel" }).click();
  await brews.first().getByRole("button", { name: "Delete" }).click();
  await expect(brews).toHaveCount(1);

  // Finishing the bag takes it off the shelf; its brews stay in the journal.
  await shelf.getByRole("button", { name: `Finished ${seed.kochere.name}` }).click();
  await expect(main(page).getByText("Nothing on your shelf.", { exact: false })).toBeVisible();
  await expect(brews).toHaveCount(1);
});

test("signed out, the journal asks you to sign in", async ({ page }) => {
  await page.goto("/journal");
  await expect(main(page).getByText("Sign in to see your shelf and your brews.")).toBeVisible();
  await page.goto(kochere);
  await expect(main(page).getByText("to keep this coffee on your shelf and log your brews.", { exact: false })).toBeVisible();
});

test("the API keeps brews to their owner", async ({ request }) => {
  const call = (user: { id: string; email: string }, path: string, input: unknown) =>
    request.post(`${apiUrl}/trpc/${path}`, { headers: { authorization: `Bearer ${accessToken(user).token}` }, data: { json: input } });
  const ben = { id: "00000000-0000-4000-8000-00000000000b", email: "ben@example.com" };
  const brew = { coffeeBeanId: seed.cerrado.id, brewMethod: "aeropress", coffeeDoseG: 15, waterWeightG: 230 };
  const created = await call(seed.alice, "brews.create", brew);
  expect(created.status()).toBe(200);
  const { id } = (await created.json()).result.data.json;

  expect((await call(ben, "brews.update", { ...brew, id, rating: 1 })).status()).toBe(404);
  expect((await call(ben, "brews.delete", { id })).status()).toBe(404);
  const peek = await request.get(`${apiUrl}/trpc/brews.get?input=${encodeURIComponent(JSON.stringify({ json: { id } }))}`, {
    headers: { authorization: `Bearer ${accessToken(ben).token}` },
  });
  expect(peek.status()).toBe(404);

  // Someone else's bag, and a date in the future, are refused.
  const aliceBag = sql(`select id from shelf_entries where user_id = '${seed.alice.id}' and coffee_bean_id = '${seed.cerrado.id}' limit 1`);
  expect((await call(ben, "brews.create", { ...brew, shelfEntryId: aliceBag })).status()).toBe(400);
  expect((await call(seed.alice, "brews.create", { ...brew, brewedAt: new Date(Date.now() + 86_400_000).toISOString() })).status()).toBe(400);
  sql(`delete from brews where id = '${id}'`);
});
