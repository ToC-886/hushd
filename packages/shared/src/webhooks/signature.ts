import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time string compare for hex/base64 signatures. */
export function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyHmacSha256Hex(secret: string, payload: string, signatureHex: string): boolean {
  const expected = hmacSha256Hex(secret, payload);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}
