import { expect, test } from "@playwright/test";

/**
 * Browser smokes for the web app. Requires the web app and API running
 * locally (see playwright.config.ts header).
 */
test.describe("web smoke", () => {
  test("home page renders the site navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/hushd/i);
  });

  test("login page renders the credential form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("register → session persists across navigation without web storage tokens", async ({
    page,
  }) => {
    const email = `e2e-ui-${Date.now()}@example.com`;
    await page.goto("/register");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill("e2e-password-123");
    await page.getByRole("button", { name: /create account|sign up|register/i }).click();

    // Auto-activated dev accounts land signed in on the feed.
    await page.waitForURL(/\/feed$/, { timeout: 15_000 });

    // No tokens in web storage — the session is an HttpOnly cookie.
    const stored = await page.evaluate(() => ({
      local: Object.keys(window.localStorage),
      session: Object.keys(window.sessionStorage),
    }));
    expect(stored.local.filter((k) => k.includes("hushd"))).toEqual([]);
    expect(stored.session.filter((k) => k.includes("hushd"))).toEqual([]);
  });
});
