/**
 * Starts a throwaway Postgres in Docker, loaded with the real migrations plus db/seed.sql by
 * db/docker-init.sh (the same script compose.yaml uses). Runs before Playwright (see package.json)
 * because the API's background jobs query the database as soon as it boots.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ports } from "./fixtures";

const CONTAINER = "propperbrew-e2e-db";
const IMAGE = "pgvector/pgvector:pg17";
const repo = join(import.meta.dirname, "..");

const docker = (args: string[]) => execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

async function waitForInit(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (docker(["inspect", "-f", "{{.State.Running}}", CONTAINER]).trim() !== "true") {
      throw new Error(`Database init failed:\n${docker(["logs", CONTAINER])}`);
    }
    try {
      // Postgres only listens on TCP once the init scripts have finished.
      docker(["exec", CONTAINER, "psql", "-h", "127.0.0.1", "-U", "postgres", "-c", "select 1"]);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Postgres in ${CONTAINER} wasn't ready after ${timeoutMs}ms`);
}

docker(["rm", "-f", CONTAINER]);
docker([
  "run", "-d", "--name", CONTAINER,
  "-e", "POSTGRES_PASSWORD=postgres",
  "-p", `${ports.db}:5432`,
  "-v", `${join(repo, "supabase/migrations")}:/migrations:ro`,
  "-v", `${join(repo, "e2e/db")}:/fixtures:ro`,
  "-v", `${join(repo, "e2e/db/docker-init.sh")}:/docker-entrypoint-initdb.d/init.sh:ro`,
  IMAGE,
]);
await waitForInit();
console.info(`e2e database ready on :${ports.db}`);
