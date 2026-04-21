import { openSecret, sealSecret } from "./secret-crypto";

describe("secret-crypto", () => {
  it("roundtrips sealed secrets", () => {
    const key = "unit-test-encryption-key-32chars!!";
    const secret = "JBSWY3DPEHPK3PXP";
    const sealed = sealSecret(secret, key);
    expect(sealed).not.toContain(secret);
    expect(openSecret(sealed, key)).toBe(secret);
  });
});
