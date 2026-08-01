import { expect, test } from "@playwright/test";

/**
 * Exercises the cookie-auth session lifecycle end to end: register, /me,
 * cookie-based refresh, CSRF enforcement, and logout. Runs against a dev
 * stack with AUTH_AUTO_ACTIVATE=true.
 */
test.describe("auth session (cookie transport)", () => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "e2e-password-123";

  test("register → me → refresh → csrf guard → logout", async ({ request }) => {
    const registerRes = await request.post("/v1/auth/register", {
      data: { email, password, role: "FAN" },
    });
    expect(registerRes.status()).toBe(201);
    const tokens = await registerRes.json();
    expect(tokens.accessToken).toBeTruthy();

    // The session must be readable via the cookie jar alone (no Bearer header).
    const meRes = await request.get("/v1/auth/me");
    expect(meRes.status()).toBe(200);
    expect((await meRes.json()).email).toBe(email);

    // Refresh with no body — the refresh token travels in its cookie.
    const refreshRes = await request.post("/v1/auth/refresh");
    expect(refreshRes.status()).toBe(200);
    expect((await refreshRes.json()).accessToken).toBeTruthy();

    // Cookie-authenticated mutations without the CSRF header are rejected.
    const noHeader = await request.post("/v1/auth/logout", {
      headers: { "X-Requested-With": "" },
    });
    expect(noHeader.status()).toBe(403);
    expect((await noHeader.json()).message).toBe("csrf_header_missing");

    // Logout with the header revokes the session and clears the cookies.
    const logoutRes = await request.post("/v1/auth/logout");
    expect(logoutRes.status()).toBe(200);
    const afterLogout = await request.get("/v1/auth/me");
    expect(afterLogout.status()).toBe(401);
  });

  test("login sets HttpOnly auth cookies", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const registerRes = await page.request.post(`${baseURL}/v1/auth/register`, {
      data: { email: `e2e-cookie-${Date.now()}@example.com`, password, role: "FAN" },
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    expect(registerRes.status()).toBe(201);

    const cookies = await context.cookies(baseURL);
    const access = cookies.find((c) => c.name === "hushd_access");
    const refresh = cookies.find((c) => c.name === "hushd_refresh");
    expect(access?.httpOnly).toBe(true);
    expect(access?.sameSite).toBe("Lax");
    expect(refresh?.httpOnly).toBe(true);
    expect(refresh?.path).toBe("/v1/auth");
    await context.close();
  });
});
