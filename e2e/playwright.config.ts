import { defineConfig, devices } from "@playwright/test";
import { apiEnv, apiUrl, appEnv, ports } from "./fixtures";

const phone = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } };

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Shelf tests write to the shared database.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "web", testMatch: "web.spec.ts", use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${ports.web}` } },
    { name: "mobile", testMatch: "mobile.spec.ts", use: { ...phone, baseURL: `http://localhost:${ports.mobile}` } },
  ],
  webServer: [
    {
      name: "api",
      cwd: "../apps/api",
      command: "corepack pnpm exec tsx src/index.ts",
      url: `${apiUrl}/health`,
      env: apiEnv,
    },
    {
      name: "web",
      cwd: "../apps/web",
      // A production build: closer to what ships, and it doesn't clash with a local `next dev`.
      // Servers start in order, so the API is up for the build's prerender.
      command: `corepack pnpm exec next build && corepack pnpm exec next start --port ${ports.web}`,
      url: `http://localhost:${ports.web}`,
      env: { NEXT_PUBLIC_API_URL: apiUrl },
      timeout: 240_000,
    },
    {
      name: "mobile",
      cwd: "../apps/mobile",
      command: `corepack pnpm exec expo start --web --port ${ports.mobile}`,
      url: `http://localhost:${ports.mobile}`,
      env: { ...appEnv, CI: "1" },
      timeout: 180_000,
    },
  ],
});
