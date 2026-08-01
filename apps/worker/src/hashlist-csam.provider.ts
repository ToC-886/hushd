import { readFile } from "node:fs/promises";
import type { CsamScanProvider, ScanInput, ScanVerdict } from "@hushd/shared";

/**
 * Hash-matching CSAM provider: matches the client-computed SHA-256 of an
 * upload against a known-bad hash list (NCMEC/Thorn-style feeds are
 * distributed in exactly this format to vetted platforms).
 *
 * Config:
 *   CSAM_HASHLIST_FILE       — path to a newline- or JSON-array list of hex hashes
 *   CSAM_HASHLIST_URL        — alternative remote source, fetched and refreshed
 *   CSAM_HASHLIST_REFRESH_MS — refresh interval for the URL source (default 10m)
 *   CSAM_FAIL_CLOSED         — "true" quarantines uploads that cannot be checked
 */
export class HashListCsamProvider implements CsamScanProvider {
  readonly id = "hashlist_csam";
  private hashes = new Set<string>();
  private lastLoadError: string | null = null;
  private loaded = false;

  constructor(
    private readonly options: { file?: string; url?: string; failClosed: boolean },
  ) {}

  async init(): Promise<void> {
    await this.reload();
    if (this.options.url) {
      const refreshMs = Number(process.env.CSAM_HASHLIST_REFRESH_MS ?? 10 * 60 * 1000);
      setInterval(() => void this.reload(), refreshMs).unref();
    }
  }

  async scanObject(input: ScanInput): Promise<ScanVerdict> {
    if (!this.loaded) {
      if (this.options.failClosed) {
        return { status: "error", retryable: true, message: "hashlist_not_loaded" };
      }
      return { status: "clean" };
    }
    if (!input.sha256) {
      if (this.options.failClosed) {
        return { status: "error", retryable: false, message: "sha256_required_for_hash_matching" };
      }
      return { status: "clean" };
    }
    if (this.hashes.size === 0 && this.lastLoadError) {
      if (this.options.failClosed) {
        return { status: "error", retryable: true, message: `hashlist_unavailable: ${this.lastLoadError}` };
      }
      return { status: "clean" };
    }
    const normalized = input.sha256.trim().toLowerCase();
    if (this.hashes.has(normalized)) {
      return { status: "match", reasonCode: "sha256_hashlist_match" };
    }
    return { status: "clean" };
  }

  private async reload(): Promise<void> {
    try {
      const raw = await this.loadRaw();
      this.hashes = new Set(
        raw
          .split(/\r?\n/)
          .flatMap((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return [];
            if (trimmed.startsWith("[")) {
              try {
                return (JSON.parse(trimmed) as string[]).map((h) => h.trim().toLowerCase());
              } catch {
                return [];
              }
            }
            return [trimmed.toLowerCase()];
          })
          .filter((h) => /^[a-f0-9]{64}$/.test(h)),
      );
      this.lastLoadError = null;
      this.loaded = true;
    } catch (err) {
      this.lastLoadError = err instanceof Error ? err.message : String(err);
      this.loaded = true;
      // eslint-disable-next-line no-console
      console.error("csam_hashlist_load_failed", this.lastLoadError);
    }
  }

  private async loadRaw(): Promise<string> {
    if (this.options.url) {
      const res = await fetch(this.options.url);
      if (!res.ok) throw new Error(`hashlist fetch failed: ${res.status}`);
      return res.text();
    }
    if (this.options.file) {
      return readFile(this.options.file, "utf8");
    }
    throw new Error("no hashlist source configured");
  }
}
