import type { CsamScanProvider, ScanInput, ScanVerdict } from "@hushd/shared";

/** Development stub — production must swap for a real hash-matching vendor integration. */
export class NoopCsamScanProvider implements CsamScanProvider {
  readonly id = "noop_csam";

  async scanObject(_input: ScanInput): Promise<ScanVerdict> {
    return { status: "clean" };
  }
}
