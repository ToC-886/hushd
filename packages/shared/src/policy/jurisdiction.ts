export type JurisdictionPolicyInput = {
  countryCode: string;
  restrictedCountries?: string[];
  payoutBlockedCountries?: string[];
};

export type JurisdictionDecision = {
  allowAccess: boolean;
  allowPayouts: boolean;
  reason?: string;
};

export function evaluateJurisdictionPolicy(input: JurisdictionPolicyInput): JurisdictionDecision {
  const code = input.countryCode.trim().toUpperCase();
  const restricted = new Set((input.restrictedCountries ?? []).map((c) => c.toUpperCase()));
  const payoutBlocked = new Set((input.payoutBlockedCountries ?? []).map((c) => c.toUpperCase()));
  if (restricted.has(code)) {
    return {
      allowAccess: false,
      allowPayouts: false,
      reason: "geo_blocked",
    };
  }
  return {
    allowAccess: true,
    allowPayouts: !payoutBlocked.has(code),
    reason: payoutBlocked.has(code) ? "payout_blocked_country" : undefined,
  };
}
