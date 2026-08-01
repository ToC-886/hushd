# ADR 0002: Fail-open-honest geo enforcement when the edge secret is absent

## Status

Accepted (2026-08-01)

## Context

`GeoBlockGuard` enforces jurisdiction access rules using the `cf-ipcountry`
header set by Cloudflare at the edge. That header is **client-spoofable** unless
the request is known to have traversed the trusted edge. The guard therefore
trusts the country header only when the request also carries a valid
`x-geo-edge-secret` matching `GEO_EDGE_SHARED_SECRET`.

The pre-audit behavior had a dangerous middle case: in **production**, if
`GEO_EDGE_SHARED_SECRET` was *not configured*, the guard silently trusted the
spoofable header. This produced **false compliance assurance** — the system
appeared to enforce geo-blocking while actually enforcing nothing against any
client that set its own header.

## Decision

The guard now fails **open but honest**:

- **Production + secret configured:** requests without a valid edge secret are
  rejected; the country header is trusted only behind the secret.
- **Production + secret NOT configured:** the country header is treated as
  untrusted and ACCESS geo-blocking is **honestly disabled** (allow all), while
  `validateEnv` emits a loud startup warning that geo enforcement is not real.
  The system never claims to enforce a control it cannot actually enforce.
- **Non-production:** the header is trusted without the secret so local
  development and tests can exercise geo rules.

Payout-side jurisdiction (`JurisdictionService`) is unaffected: it reads the
creator's stored `countryCode` and `GeoBlock` rows with `scope=PAYOUTS`, which
are server-side data and not subject to header spoofing.

## Consequences

### Positive

- No false compliance assurance. The control is either real (secret present) or
  visibly absent (secret missing), never silently fake.
- Operators get an explicit startup warning telling them to set
  `GEO_EDGE_SHARED_SECRET` at the edge.

### Negative / costs

- If an operator deploys to production without the secret, ACCESS geo-blocking
  is off. This is intentional: a disabled control is safer than a spoofable one
  that is believed to be on. The warning exists to surface the misconfiguration.

### Alternatives considered

- *Fail closed (deny all) when the secret is missing:* rejected — a missing
  operator secret would take the whole site offline, an availability-destroying
  default for a configuration error.
- *Trust the header unconditionally:* rejected — that is the vulnerability being
  fixed.
