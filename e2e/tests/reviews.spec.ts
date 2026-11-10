/** Reviews on the website: the coffee's sensory profile, writing a review, and editing yours. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { accounts, clearReviews, createUser, deleteTestUsers, seed } from "../fixtures";

const beanPath = `/${seed.roaster.slug}/${seed.inStock.slug}`;
const kocherePath = `/${seed.kochere.roasterSlug}/${seed.kochere.slug}`;
const reviewsSection = (page: Page) => page.getByRole("region", { name: "Reviews" });
/** Click a star or sensory stop the way a person does: on its visible label, not the hidden radio. */
const pick = (form: Locator, name: string) =>
  // `has` takes an unscoped locator; it's matched inside each label.
  form.locator("label").filter({ has: form.page().getByRole("radio", { name, exact: true }) }).click();

async function signIn(page: Page, email: string, password: string) {
  const form = page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.afterAll(() => {
  clearReviews(seed.kochere.id);
  deleteTestUsers();
});

test("a coffee shows its community sensory profile", async ({ page }) => {
  await page.goto(beanPath);
  const profile = reviewsSection(page).getByLabel("Sensory profile");
  // Averages from the seeded reviews: acidity 4.5, sweetness 4, body 2.5, aftertaste 4, balance 4.
  await expect(profile.locator(".sensory-bar")).toHaveText([
    /Acidity\s*Bright & citric/,
    /Sweetness\s*Sweet/,
    /Body\s*Medium/,
    /Aftertaste\s*Long/,
    /Balance\s*Harmonic/,
  ]);
  await expect(profile.getByLabel("Acidity 4.5 of 5")).toBeVisible();
});

test("signed out, you're asked to sign in and come straight back", async ({ page }) => {
  await page.goto(kocherePath);
  await reviewsSection(page).getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`/sign-in?next=${kocherePath}`);
  await signIn(page, accounts.alice.email, accounts.alice.password);
  await expect(page).toHaveURL(kocherePath);
  await expect(reviewsSection(page).getByRole("button", { name: "Write a review" })).toBeVisible();
});

test("the sign-in return path stays on this site", async ({ page }) => {
  await page.goto("/sign-in?next=//evil.example/steal");
  await signIn(page, accounts.alice.email, accounts.alice.password);
  await expect(page).toHaveURL("/");
});

test("write a review and see it on the coffee", async ({ page }) => {
  // A brand-new account, so this is its first review of Kochere.
  const user = await createUser("reviewer");
  await page.goto("/sign-in");
  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL("/");

  await page.goto(kocherePath);
  await expect(reviewsSection(page)).toContainText("No reviews yet.");
  await reviewsSection(page).getByRole("button", { name: "Write a review" }).click();
  const review = page.getByRole("form", { name: "Your review" });

  await review.getByRole("button", { name: "Post review" }).click();
  await expect(review.getByRole("alert")).toHaveText("Choose a star rating.");

  await pick(review, "3 stars");
  await pick(review, "Acidity 2 of 5, Gentle");
  await expect(review.getByRole("group", { name: "Acidity" })).toContainText("Gentle");
  // Clicking the chosen stop again clears it.
  await pick(review, "Body 4 of 5, Round");
  await pick(review, "Body 4 of 5, Round");
  await expect(review.getByRole("group", { name: "Body" })).toContainText("Not rated");

  await review.getByRole("checkbox", { name: "Jasmine" }).check();
  await review.getByLabel("Add a note").fill("Lemon");
  await review.getByRole("button", { name: "Add", exact: true }).click();
  await expect(review.getByRole("checkbox", { name: "Lemon" })).toBeChecked();
  await review.getByLabel("Editorial notes").fill("Floral and light, lovely as it cools.");
  await review.getByRole("button", { name: "Post review" }).click();

  await expect(reviewsSection(page).getByRole("status")).toHaveText("Thanks, your review is posted.");
  // The page is rebuilt with the new rating, sensory profile and review.
  await expect(page.getByText("3.0 (1 review)").first()).toBeVisible();
  await expect(reviewsSection(page).getByLabel("Sensory profile").locator(".sensory-bar")).toHaveText([/Acidity\s*Gentle/]);
  const posted = reviewsSection(page).locator(".review");
  await expect(posted).toHaveCount(1);
  await expect(posted).toContainText(user.email.split("@")[0]!.replace(/-/g, ""));
  await expect(posted.getByRole("img", { name: "3.0 out of 5" })).toBeVisible();
  await expect(posted.getByRole("list", { name: "Tasted" })).toHaveText(/Jasmine\s*Lemon/);
  await expect(posted).toContainText("Floral and light, lovely as it cools.");
  await expect(reviewsSection(page).getByRole("button", { name: "Edit your review" })).toBeVisible();
});

test("edit your existing review", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, accounts.alice.email, accounts.alice.password);
  await expect(page).toHaveURL("/");
  await page.goto(beanPath);
  await reviewsSection(page).getByRole("button", { name: "Edit your review" }).click();
  const review = page.getByRole("form", { name: "Your review" });
  await expect(review.getByRole("radio", { name: "5 stars" })).toBeChecked();
  await expect(review.getByRole("radio", { name: "Acidity 5 of 5, Bright & citric" })).toBeChecked();
  await expect(review.getByRole("checkbox", { name: "Rhubarb" })).toBeChecked();
  await expect(review.getByLabel("Editorial notes")).toHaveValue("Bright and juicy, with a long floral finish.");
  await expect(review.getByRole("button", { name: "Update review" })).toBeVisible();
  await review.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("form", { name: "Your review" })).toHaveCount(0);
});
