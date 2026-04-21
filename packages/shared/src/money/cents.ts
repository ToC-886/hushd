/** Money helpers — store amounts as integer cents in the database. */

export function assertNonNegativeCents(value: number, field = "cents"): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`);
  }
}

export function platformFeeCents(grossCents: number, feeBps: number): number {
  assertNonNegativeCents(grossCents, "grossCents");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new TypeError("feeBps must be an integer between 0 and 10000");
  }
  return Math.floor((grossCents * feeBps) / 10_000);
}

export function netAfterFeeCents(grossCents: number, feeBps: number): number {
  return grossCents - platformFeeCents(grossCents, feeBps);
}
