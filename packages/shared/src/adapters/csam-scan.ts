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
