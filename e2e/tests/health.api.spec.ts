import { expect, test } from "@playwright/test";

test.describe("API health", () => {
  test("liveness responds 200", async ({ request }) => {
    const res = await request.get("/v1/health");
    expect(res.status()).toBe(200);
  });

  test("readiness responds 200 when the database is reachable", async ({ request }) => {
    const res = await request.get("/v1/health/ready");
    expect(res.status()).toBe(200);
  });
});
