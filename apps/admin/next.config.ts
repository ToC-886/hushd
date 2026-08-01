import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Standalone tracing uses symlinks that fail on Windows without Developer Mode
// (EPERM). Docker/Linux CI always emit standalone; local Windows builds skip it
// unless NEXT_STANDALONE=1 is set explicitly.
const useStandalone =
  process.env.NEXT_STANDALONE === "1" ||
  (process.env.NEXT_STANDALONE !== "0" && process.platform !== "win32");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Always pin the monorepo root so Next does not pick an unrelated parent lockfile.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  ...(useStandalone ? { output: "standalone" as const } : {}),
};

export default nextConfig;
