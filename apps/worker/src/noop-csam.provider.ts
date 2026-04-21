import type { CsamScanProvider, ScanInput, ScanVerdict } from "@hushd/shared";

export class NoopCsamScanProvider implements CsamScanProvider {
  readonly id = "noop_csam";

  async scanObject(input: ScanInput): Promise<ScanVerdict> {
    void input;
    return { status: "clean" };
  }
}
