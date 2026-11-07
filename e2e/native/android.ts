/**
 * Native end-to-end test: the real app in Expo Go on an Android emulator, against the seeded
 * test database and API. Catches what the browser suite can't (native rendering, the Hermes
 * runtime, a stale or mismatched bundle).
 *
 * Needs a running emulator with Expo Go installed. Run with `pnpm test:android`.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { apiEnv, appEnv, ports, seed } from "../fixtures";
import { adb, Device } from "./device";

const repo = join(import.meta.dirname, "../..");
const METRO_PORT = 8197;
const metroUrl = `exp://127.0.0.1:${METRO_PORT}`;
const bean = `/bean/${seed.roaster.slug}/${seed.inStock.slug}`;
/** Coffee pages have the order bar along the bottom; keep scroll targets above it. */
const aboveOrderBar = { maxY: 2100 };

const children: ChildProcess[] = [];
function start(cwd: string, args: string[], env: Record<string, string>) {
  // Its own process group, so stopping it also stops pnpm's children.
  const child = spawn("corepack", ["pnpm", "exec", ...args], { cwd, env: { ...process.env, ...env }, stdio: "ignore", detached: true });
  children.push(child);
  return child;
}
function stopAll() {
  for (const c of children) {
    try {
      process.kill(-c.pid!, "SIGTERM");
    } catch {}
  }
}
async function waitForHttp(url: string, ok: (body: string) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok && ok(await res.text())) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const cases: [name: string, run: (d: Device) => Promise<void>][] = [
  [
    "discover: spotlight, collection, new arrivals and roaster rows",
    async (d) => {
      await d.launch("/");
      await d.expect(["Roaster spotlight", "01 / 02", seed.secondRoaster.name], 60_000);
      await d.scrollTo("The Collection");
      await d.scrollTo("New arrivals");
      // The last roaster's row (North Star has one coffee).
      await d.scrollTo("1 coffee");
    },
  ],
  [
    "search: opens from Discover, finds by tasting note and filters",
    async (d) => {
      await d.launch("/");
      await d.tap("Search coffees");
      await d.expect(["Find your next coffee", /^3 coffees$/i]);
      // The field is focused when the screen opens.
      await d.type("jasmine");
      await d.expect([/^1 coffee$/i, seed.kochere.name]);
      await d.tap(seed.kochere.name);
      await d.expect(["Ethiopia • Light roast", "Order · £14.00"]);
    },
  ],
  [
    "search: filter chips narrow the results",
    async (d) => {
      await d.launch("/search");
      await d.expect([/^3 coffees$/i]);
      await d.tap(/^under £10$/i);
      await d.expect([/^1 coffee$/i, seed.cerrado.name]);
    },
  ],
  [
    "roaster page: story, current roasts and the roastery",
    async (d) => {
      await d.launch(`/roaster/${seed.roaster.slug}`);
      await d.expect(["Established 2016", seed.roaster.name, "Our Philosophy"]);
      await d.scrollTo("Current Roasts");
      await d.scrollTo("Visit the Roastery");
      await d.expect(["12 Call Lane, Leeds LS1 6DT"]);
    },
  ],
  [
    "discover: a new arrival opens its coffee",
    async (d) => {
      await d.launch("/");
      await d.scrollTo("Kochere Natural");
      await d.tap("Kochere Natural");
      await d.expect(["Ethiopia • Light roast", "Order · £14.00"]);
    },
  ],
  [
    "bean: size and quantity update the order total",
    async (d) => {
      await d.launch(bean);
      await d.expect([seed.inStock.name, "from £12.50", "Order · £12.50"]);
      await d.scrollTo("1kg / Wholebean", aboveOrderBar);
      await d.tap("1kg / Wholebean");
      await d.expect(["Order · £42.00"]);
      await d.tap("More");
      await d.expect(["Order · £84.00"]);
    },
  ],
  [
    "bean: brewing guide lists the roaster's pick, then the community",
    async (d) => {
      await d.launch(bean);
      await d.scrollTo("From the roaster", aboveOrderBar);
      await d.expect(["Roaster's pick", `By ${seed.roaster.name}`]);
      await d.scrollTo("From the community", aboveOrderBar);
      await d.scrollTo("Add your recipe", aboveOrderBar);
    },
  ],
  [
    "recipe: opens from the guide and the brew timer runs",
    async (d) => {
      await d.launch(bean);
      await d.scrollTo("By alice", aboveOrderBar);
      await d.tap("By alice");
      await d.expect(["Recipe by alice", "V60 Pour-Over", "Upvote, 7 upvotes"]);
      await d.scrollTo("Start brewing");
      const button = await d.tap("Start brewing");
      // uiautomator can't read a screen that updates every second, so let it run, then tap the
      // same spot (now "Pause") and check the stopped timer.
      await new Promise((r) => setTimeout(r, 3500));
      await d.tapAt(button);
      await d.expect(["Paused", "Resume", "Reset", /^Brew time 0:0[2-9]$/]);
    },
  ],
  [
    "recipe: the roaster's pick credits the roaster",
    async (d) => {
      await d.launch(`/recipe/${seed.inStock.roasterRecipeId}`);
      await d.expect(["Roaster's pick", `Recommended by ${seed.roaster.name}. Tried it? Upvote it.`, "Upvote, 12 upvotes"]);
    },
  ],
  [
    "upvote: signed out goes to sign in",
    async (d) => {
      await d.launch(`/recipe/${seed.inStock.roasterRecipeId}`);
      await d.tap("Upvote, 12 upvotes");
      await d.expect(["The Ritual Awaits", "Email address", "Sign in"]);
    },
  ],
  [
    "reviews: sensory profile, and signed-out reviewers are asked to sign in",
    async (d) => {
      await d.launch(bean);
      await d.scrollTo("Sensory profile", aboveOrderBar);
      await d.expect(["Acidity 4.5 of 5, Bright & citric"]);
      await d.scrollTo("Write a review", aboveOrderBar);
      await d.tap("Write a review");
      await d.expect(["Sign in to review"]);
    },
  ],
  [
    "add recipe: signed out is asked to sign in",
    async (d) => {
      await d.launch(`/recipe/new?beanId=${seed.inStock.id}&beanName=${encodeURIComponent(seed.inStock.name)}`);
      await d.expect(["Share your recipe", "Sign in to add a recipe"]);
    },
  ],
  [
    "sold-out coffee explains itself",
    async (d) => {
      await d.launch(`/bean/${seed.roaster.slug}/${seed.soldOut.slug}`);
      await d.expect([seed.soldOut.name]);
      await d.scrollTo("Sold out — reviews and recipes stay here for reference.", aboveOrderBar);
    },
  ],
  [
    "shelf: signed out offers sign in",
    async (d) => {
      await d.launch("/shelf");
      // react-query retries the 401 a few times first.
      await d.expect(["Sign in to see your shelf"], 30_000);
    },
  ],
  [
    "scan screen opens",
    async (d) => {
      await d.launch("/scan");
      await d.expect(["Scan a bag"]);
    },
  ],
  [
    "unknown recipe says so",
    async (d) => {
      await d.launch("/recipe/00000000-0000-4000-8000-000000000999");
      await d.expect(["Recipe not found."], 30_000);
    },
  ],
];

async function main() {
  Device.check();
  console.info("Seeding the test database…");
  execFileSync("corepack", ["pnpm", "exec", "tsx", "setup-db.ts"], { cwd: join(repo, "e2e"), stdio: "inherit" });

  console.info("Starting the API and Metro…");
  start(join(repo, "apps/api"), ["tsx", "src/index.ts"], apiEnv);
  // --clear so the device always gets a bundle built from the current code.
  start(join(repo, "apps/mobile"), ["expo", "start", "--port", String(METRO_PORT), "--clear"], { ...appEnv, CI: "1" });
  await waitForHttp(`${apiEnv.PUBLIC_API_URL}/health`, () => true, 60_000);
  await waitForHttp(`http://localhost:${METRO_PORT}/status`, (b) => b.includes("running"), 180_000);

  // The emulator reaches the API and Metro on the host through these.
  adb("reverse", `tcp:${ports.api}`, `tcp:${ports.api}`);
  adb("reverse", `tcp:${ports.supabase}`, `tcp:${ports.supabase}`);
  adb("reverse", `tcp:${METRO_PORT}`, `tcp:${METRO_PORT}`);

  const device = new Device(metroUrl);
  console.info("Loading the app (first bundle can take a minute)…");
  await device.launch("/");
  await device.expect(["Roaster spotlight"], 180_000);
  console.info("Running (please don't touch the emulator)…");

  // ONLY=search runs just the cases whose name contains "search".
  const only = process.env.ONLY?.toLowerCase();
  const chosen = only ? cases.filter(([name]) => name.toLowerCase().includes(only)) : cases;
  const failures: string[] = [];
  for (const [name, run] of chosen) {
    device.clearLog();
    try {
      await run(device);
      const errors = device.jsErrors();
      if (errors.length > 0) throw new Error(`JavaScript errors:\n${errors.join("\n")}`);
      console.info(`  ✓ ${name}`);
    } catch (err) {
      failures.push(name);
      const shot = join(repo, "e2e/test-results", `android-${failures.length}.png`);
      device.screenshot(shot);
      console.error(`  ✘ ${name}\n    ${String(err instanceof Error ? err.message : err).replace(/\n/g, "\n    ")}\n    Screenshot: ${shot}`);
    }
  }

  console.info(`\n${chosen.length - failures.length} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(stopAll);
