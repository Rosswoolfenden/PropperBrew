/**
 * Accounts on the website: confirming email, forgotten passwords, account settings (email,
 * password, deleting the account), sessions that run out, and rate limits. Email is read from
 * Mailpit, which catches everything the local auth service sends.
 */
import { expect, test, type Page } from "@playwright/test";
import { accessToken, accounts, apiUrl, createUser, deleteTestUsers, emailCount, emailTo, seed, sql } from "../fixtures";

const main = (page: Page) => page.getByRole("main");
const banner = (page: Page) => page.getByRole("banner");
const notice = (page: Page) => banner(page).locator(".auth-notice");
const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@auth-test.example`;

function signInForm(page: Page) {
  return page.locator("form").filter({ has: page.getByLabel("Password", { exact: true }) });
}

async function signIn(page: Page, email: string, password: string, from = "/sign-in") {
  await page.goto(from);
  const form = signInForm(page);
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  return form;
}

test.afterAll(deleteTestUsers);

test.describe("new accounts", () => {
  test("confirm their email before they can sign in", async ({ page }) => {
    const email = unique("newbie");
    await page.goto("/sign-in?next=/search");
    const form = signInForm(page);
    await form.getByRole("button", { name: "Create account" }).click();
    await form.getByLabel("Email address", { exact: true }).fill(email);
    await form.getByLabel("Password", { exact: true }).fill("a-long-password");
    await form.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(form.getByRole("status")).toContainText(`Check your email. We've sent a link to ${email} to confirm your account.`);
    await expect(page).toHaveURL("/sign-in?next=/search");

    // Not before confirming.
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Confirm your email first: we sent you a link when you signed up.");
    // The auth service sends one of these a second at most.
    await page.waitForTimeout(1100);
    const sentAt = Date.now() - 1000;
    await form.getByRole("button", { name: "Resend the email" }).click();
    await expect(form.getByRole("status")).toHaveText(`Sent again. Check ${email} for the link.`);

    // Our email, with a link that confirms the account and signs them in where they were heading.
    const mail = await emailTo(email, "Confirm your PropperBrew account", { after: sentAt });
    expect(mail.html).toContain("Welcome to PropperBrew");
    expect(mail.link).toContain("type=signup");
    await page.goto(mail.link!);
    await expect(page).toHaveURL(/\/search#?$/);
    await expect(banner(page).getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
  });

  test("a used or expired email link says so", async ({ page }) => {
    await page.goto("/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await expect(notice(page)).toHaveText("That link has expired or has already been used. Sign in or reset your password.");
    await notice(page).getByRole("link", { name: "reset your password" }).click();
    await expect(page).toHaveURL("/forgot-password");
  });
});

test.describe("forgotten passwords", () => {
  test("reset by email, then sign in with the new one", async ({ page }) => {
    const user = await createUser("forgetful");
    const form = await signIn(page, user.email, "not-my-password");
    await expect(form.getByRole("alert")).toHaveText("That email and password don't match an account.");
    await form.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(`/forgot-password?email=${encodeURIComponent(user.email)}`);

    const reset = main(page).getByRole("form", { name: "Reset your password" });
    await expect(reset.getByLabel("Email address")).toHaveValue(user.email);
    await reset.getByRole("button", { name: "Send reset link" }).click();
    await expect(reset.getByRole("status")).toHaveText(`If there's an account for ${user.email}, we've sent it a link to reset the password. It works for an hour.`);

    const mail = await emailTo(user.email, "Reset your PropperBrew password");
    expect(mail.html).toContain(`asked to reset the password for ${user.email}`);
    await page.goto(mail.link!);
    await expect(page).toHaveURL(/\/reset-password/);
    const choose = main(page).getByRole("form", { name: "Choose a new password" });
    await expect(choose).toContainText(`For ${user.email}`);
    await choose.getByLabel("New password").fill("a-brand-new-password");
    await choose.getByLabel("Type it again").fill("a-different-password");
    await choose.getByRole("button", { name: "Save new password" }).click();
    await expect(choose.getByRole("alert")).toHaveText("Those passwords don't match.");
    await choose.getByLabel("Type it again").fill("a-brand-new-password");
    await choose.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL("/account");
    await expect(main(page).getByRole("status").first()).toHaveText("Your password has been changed.");

    // The link only works once.
    await banner(page).getByRole("button", { name: "Sign out" }).click();
    await page.goto(mail.link!);
    await expect(main(page).getByRole("alert")).toHaveText("That link has expired or has already been used.");
    await expect(main(page).getByRole("link", { name: "Send a new link" })).toBeVisible();

    const old = await signIn(page, user.email, user.password);
    await expect(old.getByRole("alert")).toHaveText("That email and password don't match an account.");
    await signIn(page, user.email, "a-brand-new-password");
    await expect(page).toHaveURL("/");
  });

  test("the reply doesn't reveal whether there's an account", async ({ page }) => {
    const nobody = unique("nobody");
    await page.goto("/forgot-password");
    const reset = main(page).getByRole("form", { name: "Reset your password" });
    await reset.getByRole("button", { name: "Send reset link" }).click();
    await expect(reset.getByRole("alert")).toHaveText("Enter the email address you signed up with.");
    await reset.getByLabel("Email address").fill(nobody);
    await reset.getByRole("button", { name: "Send reset link" }).click();
    await expect(reset.getByRole("status")).toHaveText(`If there's an account for ${nobody}, we've sent it a link to reset the password. It works for an hour.`);
    await page.waitForTimeout(1000);
    expect(await emailCount(nobody)).toBe(0);
  });

  test("signed in normally, the reset page sends you to account settings", async ({ page }) => {
    await signIn(page, accounts.alice.email, accounts.alice.password);
    await expect(page).toHaveURL("/");
    await page.goto("/reset-password");
    await expect(main(page).getByRole("form")).toHaveCount(0);
    await main(page).getByRole("link", { name: "Change your password in account settings" }).click();
    await expect(page).toHaveURL("/account");
  });
});

test.describe("account settings", () => {
  test("change your password (with your current one)", async ({ page }) => {
    const user = await createUser("changer");
    await signIn(page, user.email, user.password);
    await expect(page).toHaveURL("/");
    await page.goto("/u/" + sql(`select username from profiles where id = '${user.id}'`));
    await main(page).getByRole("link", { name: "Account settings" }).click();
    await expect(page).toHaveURL("/account");

    const form = main(page).getByRole("form", { name: "Change password" });
    await form.getByLabel("Current password").fill("wrong-password");
    await form.getByLabel("New password").fill("another-long-password");
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByRole("alert")).toHaveText("That's not your current password.");
    await form.getByLabel("Current password").fill(user.password);
    await form.getByLabel("New password").fill("short");
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByRole("alert")).toHaveText("Use at least 8 characters for your new password.");
    await form.getByLabel("New password").fill("another-long-password");
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByRole("status")).toHaveText("Your password has been changed.");

    await main(page).getByRole("region", { name: "Sign out" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    // Signing out on purpose isn't "you've been signed out".
    await expect(notice(page)).toHaveCount(0);
    await signIn(page, user.email, "another-long-password");
    await expect(page).toHaveURL("/");
  });

  test("change your email, confirmed from the new address", async ({ page }) => {
    const user = await createUser("mover");
    const next = unique("moved");
    await signIn(page, user.email, user.password);
    await expect(page).toHaveURL("/");
    await page.goto("/account");
    const form = main(page).getByRole("form", { name: "Change email" });
    await expect(form).toContainText(`You sign in with ${user.email}.`);
    await form.getByLabel("New email address").fill(user.email);
    await form.getByRole("button", { name: "Change email" }).click();
    await expect(form.getByRole("alert")).toHaveText("That's already your email address.");
    await form.getByLabel("New email address").fill(next);
    await form.getByRole("button", { name: "Change email" }).click();
    await expect(form.getByRole("status")).toHaveText(`Check ${next} for a link to confirm it. Until then, you sign in with ${user.email}.`);

    const mail = await emailTo(next, "Confirm your new email address");
    expect(mail.html).toContain(`Confirm ${next} as the email address`);
    await page.goto(mail.link!);
    await expect(page).toHaveURL("/account");
    await expect(main(page).getByRole("status").first()).toHaveText(`Your email is now ${next}.`);

    await banner(page).getByRole("button", { name: "Sign out" }).click();
    await signIn(page, next, user.password);
    await expect(page).toHaveURL("/");
  });

  test("delete your account: your things go, your ratings are recounted, orders stay", async ({ page }) => {
    const user = await createUser("leaver");
    // A five-star review that lifts Kochere's average, and a vote on Ben's espresso.
    sql(`insert into reviews (user_id, coffee_bean_id, rating, tasting_notes) values ('${user.id}', '${seed.kochere.id}', 50, '{}');
         update coffee_beans set avg_rating = 50, review_count = 1 where id = '${seed.kochere.id}';
         insert into recipe_votes (recipe_id, user_id) values ('${seed.inStock.espressoRecipeId}', '${user.id}');
         update brew_recipes set upvotes_count = upvotes_count + 1 where id = '${seed.inStock.espressoRecipeId}';`);
    const votesBefore = Number(sql(`select upvotes_count from brew_recipes where id = '${seed.inStock.espressoRecipeId}'`));

    await signIn(page, user.email, user.password);
    await expect(page).toHaveURL("/");
    await page.goto("/account");
    const form = main(page).getByRole("form", { name: "Delete account" });
    const button = form.getByRole("button", { name: "Delete my account" });
    await expect(button).toBeDisabled();
    await form.getByLabel("Type “delete my account” to confirm").fill("delete my acc");
    await expect(button).toBeDisabled();
    await form.getByLabel("Type “delete my account” to confirm").fill("Delete my account");
    await button.click();

    await expect(page).toHaveURL("/");
    await expect(notice(page)).toHaveText("Your account has been deleted. Thank you for brewing with us.");
    await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();
    expect(sql(`select count(*) from auth.users where id = '${user.id}'`)).toBe("0");
    expect(sql(`select count(*) from reviews where user_id = '${user.id}'`)).toBe("0");
    expect(sql(`select review_count || '|' || coalesce(avg_rating::text, 'none') from coffee_beans where id = '${seed.kochere.id}'`)).toBe("0|none");
    expect(Number(sql(`select upvotes_count from brew_recipes where id = '${seed.inStock.espressoRecipeId}'`))).toBe(votesBefore - 1);

    const again = await signIn(page, user.email, user.password);
    await expect(again.getByRole("alert")).toHaveText("That email and password don't match an account.");
  });

  test("a roaster's only owner can't delete their account", async ({ page }) => {
    await signIn(page, accounts.northStarOwner.email, accounts.northStarOwner.password, "/business");
    await expect(page).toHaveURL("/business/dashboard");
    await page.goto("/account");
    const form = main(page).getByRole("form", { name: "Delete account" });
    await form.getByLabel("Type “delete my account” to confirm").fill("delete my account");
    await form.getByRole("button", { name: "Delete my account" }).click();
    await expect(form.getByRole("alert")).toHaveText(
      `You're the only owner of ${seed.roaster.name}. Contact PropperBrew to hand it over or close it before deleting your account.`,
    );
    expect(sql(`select count(*) from auth.users where email = '${accounts.northStarOwner.email}'`)).toBe("1");
  });

  test("signed out, account settings ask you to sign in", async ({ page }) => {
    await page.goto("/account");
    await expect(main(page).getByText("Sign in to manage your account.")).toBeVisible();
  });
});

test.describe("sessions", () => {
  test("a session that runs out says so, and signing in brings you back", async ({ page }) => {
    const user = await createUser("sleepy");
    await signIn(page, user.email, user.password);
    await expect(page).toHaveURL("/");
    // The session can't be refreshed any more (as if it was revoked or expired long ago).
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"))!;
      const session = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...session, expires_at: 1, refresh_token: "revoked" }));
    });
    await page.goto("/search");
    await expect(notice(page)).toHaveText("You've been signed out. Sign in again to carry on.");
    await notice(page).getByRole("link", { name: "Sign in again" }).click();
    await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent("/search")}`);
    const form = signInForm(page);
    await form.getByLabel("Email address", { exact: true }).fill(user.email);
    await form.getByLabel("Password", { exact: true }).fill(user.password);
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/search");
    await expect(notice(page)).toHaveCount(0);
  });

  test("costly actions are rate limited", async ({ request }) => {
    const someone = { id: "00000000-0000-4000-8000-0000000000ff", email: "speedy@auth-test.example" };
    const start = () =>
      request.post(`${apiUrl}/trpc/orders.start`, {
        headers: { authorization: `Bearer ${accessToken(someone).token}` },
        data: { json: { address: { name: "A B", line1: "1 St", city: "Leeds", postcode: "LS1 6DT" } } },
      });
    for (let i = 0; i < 20; i++) expect((await start()).status()).not.toBe(429);
    const limited = await start();
    expect(limited.status()).toBe(429);
    expect((await limited.json()).error.json.message).toBe("You're going a bit fast. Try again in a minute.");
  });
});
