import { validateEnv, type EnvReader } from "./env.validation";

const STRONG_SECRET = "a".repeat(48);

/**
 * Plain object-backed reader: unlike ConfigService, it never falls through to
 * process.env, so tests are isolated from the ambient shell environment.
 */
function makeConfig(env: Record<string, string>): EnvReader {
  return { get: (key: string) => env[key] };
}

const DEV_BASE: Record<string, string> = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hushd",
  JWT_ACCESS_SECRET: STRONG_SECRET,
  JWT_REFRESH_SECRET: STRONG_SECRET,
  ENCRYPTION_KEY: STRONG_SECRET,
};

const PROD_BASE: Record<string, string> = {
  ...DEV_BASE,
  NODE_ENV: "production",
  REDIS_URL: "redis://redis:6379",
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_STAGING: "staging",
  R2_BUCKET_PUBLIC: "public",
  CORS_ORIGINS: "https://app.example.com,https://admin.example.com",
  GEO_EDGE_SHARED_SECRET: STRONG_SECRET,
  CLOUDFLARE_ACCOUNT_ID: "cf-acct",
  CLOUDFLARE_STREAM_API_TOKEN: "cf-token",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_test_key_not_for_production_use_xxxx",
  AUTH_AUTO_ACTIVATE: "false",
  IDV_PROVIDER: "veriff",
  VERIFF_API_KEY: "veriff-key",
  VERIFF_API_SECRET: "veriff-secret",
  PAYMENT_PROCESSORS_ENABLED: "segpay,ccbill",
};

describe("validateEnv", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("accepts a minimal development configuration", () => {
    expect(() => validateEnv(makeConfig(DEV_BASE), DEV_BASE)).not.toThrow();
  });

  it("rejects when a required variable is missing", () => {
    const env = { ...DEV_BASE };
    delete env.JWT_REFRESH_SECRET;
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/JWT_REFRESH_SECRET/);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    const env = { ...DEV_BASE, DATABASE_URL: "mysql://localhost/hushd" };
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/DATABASE_URL/);
  });

  it("accepts a full production configuration", () => {
    expect(() => validateEnv(makeConfig(PROD_BASE), PROD_BASE)).not.toThrow();
  });

  it("lists every missing production variable in one error", () => {
    const env: Record<string, string> = { ...DEV_BASE, NODE_ENV: "production" };
    let caught: unknown;
    try {
      validateEnv(makeConfig(env), env);
    } catch (err) {
      caught = err;
    }
    const message = (caught as Error).message;
    expect(message).toMatch(/REDIS_URL/);
    expect(message).toMatch(/R2_ACCOUNT_ID/);
    expect(message).toMatch(/R2_BUCKET_STAGING/);
    expect(message).toMatch(/CORS_ORIGINS/);
  });

  it("rejects weak secrets in production", () => {
    const env = { ...PROD_BASE, JWT_ACCESS_SECRET: "dev-access-secret" };
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("rejects secrets shorter than 32 characters in production", () => {
    const env = { ...PROD_BASE, ENCRYPTION_KEY: "short-key" };
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/ENCRYPTION_KEY/);
  });

  it("rejects EMAIL_PROVIDER=log in production", () => {
    const env = { ...PROD_BASE, EMAIL_PROVIDER: "log" };
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/EMAIL_PROVIDER/);
  });

  it("rejects AUTH_AUTO_ACTIVATE!=false in production", () => {
    const env = { ...PROD_BASE, AUTH_AUTO_ACTIVATE: "true" };
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/AUTH_AUTO_ACTIVATE/);
  });

  it("rejects IDV_PROVIDER=noop in production", () => {
    const env = { ...PROD_BASE, IDV_PROVIDER: "noop" };
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/IDV_PROVIDER/);
  });

  it("rejects stub payment processors in production", () => {
    const env = { ...PROD_BASE, PAYMENT_PROCESSORS_ENABLED: "segpay_stub" };
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/PAYMENT_PROCESSORS_ENABLED/);
  });

  it("warns when the geo edge secret is missing in production", () => {
    const env = { ...PROD_BASE };
    delete env.GEO_EDGE_SHARED_SECRET;
    validateEnv(makeConfig(env), env);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("GEO_EDGE_SHARED_SECRET"));
  });

  it("rejects an unknown COOKIE_SAMESITE value", () => {
    const env = { ...DEV_BASE, COOKIE_SAMESITE: "bogus" };
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/COOKIE_SAMESITE/);
  });

  it("rejects COOKIE_SAMESITE=none without Secure outside production", () => {
    const env = { ...DEV_BASE, COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" };
    expect(() => validateEnv(makeConfig(env), env)).toThrow(/COOKIE_SECURE/);
  });

  it("accepts COOKIE_SAMESITE=none with COOKIE_SECURE=true", () => {
    const env = { ...DEV_BASE, COOKIE_SAMESITE: "none", COOKIE_SECURE: "true" };
    expect(() => validateEnv(makeConfig(env), env)).not.toThrow();
  });

  it("accepts COOKIE_SAMESITE=none in production (Secure defaults on)", () => {
    const env = { ...PROD_BASE, COOKIE_SAMESITE: "none" };
    expect(() => validateEnv(makeConfig(env), env)).not.toThrow();
  });
});
