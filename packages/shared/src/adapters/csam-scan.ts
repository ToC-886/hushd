/**
 * Pluggable CSAM / hash-matching integration.
 * Implementations must run **before** promoting staged bytes to durable storage.
 */

export type ScanInput = {
  /** Logical media identifier in your database */
  mediaId: string;
  /** Staging object key or signed URL fetch hint — never public URLs */
  stagingObjectKey: string;
  /** MIME type hint */
  contentType?: string;
  sha256?: string;
};

export type ScanVerdict =
  | { status: "clean" }
  | { status: "match" | "suspect"; reasonCode: string; vendorRef?: string }
  | { status: "error"; retryable: boolean; message: string };

export interface CsamScanProvider {
  readonly id: string;

  scanObject(input: ScanInput): Promise<ScanVerdict>;
}

/**
 * Development stub — always returns clean. Production must configure a real
 * hash-matching integration (e.g. the worker's hashlist provider).
 * Single authoritative implementation shared by API and worker.
 */
export class NoopCsamScanProvider implements CsamScanProvider {
  readonly id = "noop_csam";

  async scanObject(): Promise<ScanVerdict> {
    return { status: "clean" };
  }
}
