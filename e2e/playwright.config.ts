import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke coverage for the critical journeys. These tests run against a live
 * local (or staging) stack — they are not hermetic unit tests:
 *
 *   docker compose up -d postgres redis
 *   pnpm db:migrate:deploy && pnpm dev
 *   pnpm --filter @hushd/e2e install:browsers   # once, for UI tests
 *   pnpm test:e2e
 *
 * The API project only needs the API + Postgres + Redis. The API must run
 * with AUTH_AUTO_ACTIVATE=true (the dev default) so register returns a
 * session without a mailbox round-trip.
 */
const API_URL = process.env.API_URL ?? "http://localhost:3001";
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  projects: [
    {
      name: "api",
      testMatch: /.*\.api\.spec\.ts/,
      use: {
        baseURL: API_URL,
        extraHTTPHeaders: { "X-Requested-With": "XMLHttpRequest" },
      },
    },
    {
      name: "chromium",
      testMatch: /.*\.ui\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: WEB_URL },
    },
  ],
});
