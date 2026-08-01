/**
 * Minimal config reader contract. Satisfied by Nest's ConfigService in
 * production wiring; tests supply a plain object-backed reader so results
 * never depend on the ambient process environment (ConfigService.get
 * deliberately prioritizes process.env over constructor-passed config).
 */
export type EnvReader = {
  get(key: string): string | undefined;
};

const DATABASE_URL_PREFIXES = ["postgres://", "postgresql://"] as const;

type ConfigIssue = {
  variable: string;
  message: string;
};

const ALWAYS_REQUIRED: readonly string[] = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "ENCRYPTION_KEY",
];

/** Variables that must be explicitly set in production (non-empty). */
const PRODUCTION_REQUIRED: readonly string[] = [
  ...ALWAYS_REQUIRED,
  "REDIS_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_STAGING",
  "R2_BUCKET_PUBLIC",
];

const DEV_DEFAULT_SECRETS = new Set([
  "dev-access-secret",
  "dev-refresh-secret",
  "dev-totp-secret-key-32-bytes-0123456789",
  "insecure-dev-secret",
]);

function looksInsecure(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length < 32 ||
    DEV_DEFAULT_SECRETS.has(normalized) ||
    normalized.includes("dev-") ||
    normalized.includes("changeme") ||
    normalized.includes("example")
  );
}

function checkDatabaseUrl(raw: string): ConfigIssue | null {
  if (DATABASE_URL_PREFIXES.some((p) => raw.startsWith(p))) return null;
  return {
    variable: "DATABASE_URL",
    message: 'must be a postgres URL starting with "postgres://" or "postgresql://"',
  };
}

/**
 * Validates process environment at application startup.
 *
 * @param config - Config reader (Nest ConfigService at runtime).
 * @param env - Raw environment; defaults to process.env (injectable for tests).
 * @throws Error listing every detected problem when validation fails.
 */
export function validateEnv(
  config: EnvReader,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const issues: ConfigIssue[] = [];
  const isProduction = config.get("NODE_ENV") === "production";

  const required = isProduction ? PRODUCTION_REQUIRED : ALWAYS_REQUIRED;
  for (const variable of required) {
    if (!config.get(variable)?.trim()) {
      issues.push({ variable, message: "is required but not set" });
    }
  }

  const databaseUrl = config.get("DATABASE_URL");
  if (databaseUrl) {
    const issue = checkDatabaseUrl(databaseUrl);
    if (issue) issues.push(issue);
  }

  if (isProduction) {
    for (const variable of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY"]) {
      const value = config.get(variable);
      if (value && looksInsecure(value)) {
        issues.push({
          variable,
          message: "must be a strong random secret of at least 32 characters in production",
        });
      }
    }
  }

  const corsOrigins = config.get("CORS_ORIGINS");
  if (isProduction && !corsOrigins?.trim()) {
    issues.push({
      variable: "CORS_ORIGINS",
      message:
        "must list the allowed web/admin origins in production (comma-separated); the API does not silently allow all origins",
    });
  }

  const cookieSameSite = (config.get("COOKIE_SAMESITE") ?? "lax").trim().toLowerCase();
  if (!["lax", "strict", "none"].includes(cookieSameSite)) {
    issues.push({
      variable: "COOKIE_SAMESITE",
      message: 'must be one of "lax", "strict", "none"',
    });
  }
  if (cookieSameSite === "none") {
    const secureOverride = config.get("COOKIE_SECURE")?.trim().toLowerCase();
    const cookieSecure = secureOverride ? secureOverride === "true" : isProduction;
    if (!cookieSecure) {
      issues.push({
        variable: "COOKIE_SECURE",
        message: 'must be "true" when COOKIE_SAMESITE=none — browsers reject SameSite=None without Secure',
      });
    }
  }

  if (isProduction) {
    const emailProvider = (config.get("EMAIL_PROVIDER") ?? "log").trim().toLowerCase();
    if (emailProvider === "log") {
      issues.push({
        variable: "EMAIL_PROVIDER",
        message:
          'must not be "log" in production — set EMAIL_PROVIDER=resend and RESEND_API_KEY (or another real provider)',
      });
    }
    if (emailProvider === "resend" && !config.get("RESEND_API_KEY")?.trim()) {
      issues.push({
        variable: "RESEND_API_KEY",
        message: "is required when EMAIL_PROVIDER=resend",
      });
    }
    if ((config.get("AUTH_AUTO_ACTIVATE") ?? "true").trim().toLowerCase() !== "false") {
      issues.push({
        variable: "AUTH_AUTO_ACTIVATE",
        message: 'must be "false" in production so email verification gates account activation',
      });
    }
    const idvProvider = (config.get("IDV_PROVIDER") ?? "noop").trim().toLowerCase();
    if (idvProvider === "noop") {
      issues.push({
        variable: "IDV_PROVIDER",
        message: 'must not be "noop" in production — configure Veriff (or another IDV vendor)',
      });
    }
    if (idvProvider === "veriff") {
      if (!config.get("VERIFF_API_KEY")?.trim()) {
        issues.push({ variable: "VERIFF_API_KEY", message: "is required when IDV_PROVIDER=veriff" });
      }
      if (!config.get("VERIFF_API_SECRET")?.trim()) {
        issues.push({
          variable: "VERIFF_API_SECRET",
          message: "is required when IDV_PROVIDER=veriff",
        });
      }
    }
    const processors = (config.get("PAYMENT_PROCESSORS_ENABLED") ?? "").trim().toLowerCase();
    if (!processors || processors.includes("_stub")) {
      issues.push({
        variable: "PAYMENT_PROCESSORS_ENABLED",
        message:
          "must list live processor ids only in production (stub processors are not launch-safe)",
      });
    }
  }

  if (!env.CLOUDFLARE_ACCOUNT_ID?.trim() || !env.CLOUDFLARE_STREAM_API_TOKEN?.trim()) {
    console.warn(
      "config_warning: Cloudflare Stream credentials are not set — video ingest stays plain R2 until CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN are configured.",
    );
  }

  if (isProduction && !env.GEO_EDGE_SHARED_SECRET?.trim()) {
    console.warn(
      "config_warning: GEO_EDGE_SHARED_SECRET is not set — ACCESS geo-blocking is disabled because country headers are spoofable without a trusted edge. Set the secret and have the edge send it as x-geo-edge-secret.",
    );
  }

  if (issues.length > 0) {
    const lines = issues.map((i) => `  - ${i.variable}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
}
