/**
 * Starts a throwaway database and auth service for the tests: the same compose services as the
 * local preview (db, auth, gateway, then migrate for migrations + seed), as a separate compose
 * project on their own ports. Runs before Playwright (see package.json) because the API's
 * background jobs query the database as soon as it boots.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { apiEnv, apiUrl, encryptToken, jwtSecret, ports, seed, sql } from "./fixtures";

const repo = join(import.meta.dirname, "..");
const compose = (...args: string[]) =>
  execFileSync("docker", ["compose", "--project-name", "propperbrew-e2e", ...args], {
    cwd: repo,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      DB_PORT: String(ports.db),
      SUPABASE_PORT: String(ports.supabase),
      MAIL_PORT: String(ports.mail),
      JWT_SECRET: jwtSecret,
      // Seeded photo URLs point at the API under test.
      API_PORT: String(ports.api),
      WEB_PORT: String(ports.web),
    },
  });

compose("down", "--volumes", "--remove-orphans");
rmSync(apiEnv.UPLOADS_DIR, { recursive: true, force: true });
compose("up", "--detach", "--wait", "db", "mailpit", "auth", "gateway");
compose("run", "--rm", "migrate");
// The roaster that takes payment here needs a Shopify token, so paid orders can be created in its
// (fake) store. Encrypted with the test key, which seed.sql can't do.
sql(`update roasters set shopify_access_token_enc = '${encryptToken("shpat_e2e_hackney")}' where id = '${seed.payingRoaster.id}'`);
console.info(`e2e database ready on :${ports.db}, auth on :${ports.supabase} (seed images from ${apiUrl})`);
