/**
 * Public runtime configuration. Only non-secret values may appear here — this
 * is bundled into the client. The API base URL is same-origin by default and
 * can be overridden for split deployments.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/v1";
