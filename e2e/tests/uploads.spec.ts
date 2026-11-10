/** Photos: profile pictures, review photos and roaster logos on the website, resized and stripped by the API. */
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { accessToken, accounts, apiUrl, clearReviews, createUser, deleteTestUsers, seed, sql } from "../fixtures";

const repo = join(import.meta.dirname, "../..");
const photo = join(repo, "apps/api/public/mock/kochere.jpg");
const main = (page: Page) => page.getByRole("main");
const loaded = (img: ReturnType<Page["locator"]>) => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);

async function signIn(page: Page, email: string, password: string, from = "/sign-in") {
  await page.goto(from);
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.afterAll(() => {
  clearReviews(seed.kochere.id);
  sql(`update roasters set logo_url = null where slug = '${seed.roaster.slug}'`);
  deleteTestUsers();
});

test("a profile photo: choose it, see it, remove it", async ({ page }) => {
  const user = await createUser("photogenic");
  const username = sql(`select username from profiles where id = '${user.id}'`);
  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL("/");
  await page.goto(`/u/${username}`);
  await main(page).getByRole("button", { name: "Edit profile" }).click();
  const form = main(page).getByRole("form", { name: "Edit profile" });

  // Not a photo: refused, with a reason.
  await form.getByLabel("Choose profile photo").setInputFiles({ name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really a photo") });
  await expect(form.getByRole("alert")).toHaveText("That isn't a photo we can read. Use a JPEG, PNG, WebP or HEIC image.");

  await form.getByLabel("Choose profile photo").setInputFiles(photo);
  const preview = form.getByRole("img", { name: "Profile photo preview" });
  await expect(preview).toHaveAttribute("src", new RegExp(`^${apiUrl}/uploads/avatar/${user.id}/[0-9a-f-]+\\.webp$`));
  await expect.poll(() => loaded(preview)).toBe(true);
  await form.getByRole("button", { name: "Save profile" }).click();

  const avatar = main(page).locator(".avatar img");
  await expect(avatar).toBeVisible();
  // Square, 512px, from a 1024px-wide original.
  expect(await avatar.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([512, 512]);

  await main(page).getByRole("button", { name: "Edit profile" }).click();
  await form.getByRole("button", { name: "Remove photo" }).click();
  await form.getByRole("button", { name: "Save profile" }).click();
  await expect(main(page).locator(".avatar img")).toHaveCount(0);
  await expect(main(page).locator(".avatar")).toHaveText(username.slice(0, 1).toUpperCase());
});

test("a review with a photo", async ({ page }) => {
  const user = await createUser("snapper");
  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL("/");
  await page.goto(`/${seed.kochere.roasterSlug}/${seed.kochere.slug}`);
  await main(page).getByRole("button", { name: "Write a review" }).click();
  const form = main(page).getByRole("form", { name: "Your review" });
  await form.locator("label").filter({ has: page.getByRole("radio", { name: "4 stars", exact: true }) }).click();
  await form.getByLabel("Choose your photo (optional)").setInputFiles(photo);
  await expect(form.getByRole("img", { name: "Your photo (optional) preview" })).toBeVisible();
  await form.getByRole("button", { name: "Post review" }).click();

  const shot = main(page).getByRole("img", { name: /^Photo from .*'s review$/ });
  await expect(shot).toBeVisible();
  await expect.poll(() => loaded(shot)).toBe(true);
  // Kept within 1600px; this one was smaller, so it isn't enlarged.
  expect(await shot.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeLessThanOrEqual(1600);
});

test("a roaster's logo on their page", async ({ page }) => {
  await signIn(page, accounts.northStarOwner.email, accounts.northStarOwner.password, "/business");
  await expect(page).toHaveURL("/business/dashboard");
  const form = page.getByRole("form", { name: "Your page" });
  await form.getByLabel("Choose logo").setInputFiles(photo);
  await expect(form.getByRole("img", { name: "Logo preview" })).toBeVisible();
  await form.getByRole("button", { name: "Save your page" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved. Your page is up to date.");

  await page.goto(`/${seed.roaster.slug}`);
  const logo = main(page).getByRole("img", { name: `${seed.roaster.name} logo` });
  await expect(logo).toBeVisible();
  await expect.poll(() => loaded(logo)).toBe(true);
});

test("photos lose their metadata, and only the uploader can use them", async ({ request }) => {
  // A photo carrying the kind of metadata phones add.
  const tagged = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#8a5a2b" } })
    .jpeg()
    .withExif({ IFD0: { Artist: "Someone Private", Copyright: "secret" } })
    .toBuffer();
  expect((await sharp(tagged).metadata()).exif).toBeDefined();

  const upload = (token: string | null, kind = "review") =>
    request.post(`${apiUrl}/uploads?kind=${kind}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      multipart: { file: { name: "tagged.jpg", mimeType: "image/jpeg", buffer: tagged } },
    });
  const alice = accessToken(seed.alice).token;
  expect((await upload(null)).status()).toBe(401);
  expect((await upload(alice, "banner")).status()).toBe(400);
  const res = await upload(alice);
  expect(res.status()).toBe(200);
  const { url } = await res.json();

  const served = await request.get(url);
  expect(served.headers()["content-type"]).toBe("image/webp");
  const meta = await sharp(await served.body()).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.exif).toBeUndefined();

  // Ben can't put Alice's photo on his profile (nor any photo from elsewhere).
  const ben = accessToken({ id: "00000000-0000-4000-8000-00000000000b", email: "ben@example.com" }).token;
  const attach = (avatarUrl: string) =>
    request.post(`${apiUrl}/trpc/me.update`, { headers: { authorization: `Bearer ${ben}` }, data: { json: { avatarUrl } } });
  expect((await attach(url)).status()).toBe(400);
  expect((await attach("https://elsewhere.example/me.jpg")).status()).toBe(400);
});
