/** DTOs shared with the hushd admin API (admin.* endpoints + auth/me). */

export type Me = {
  id: string;
  email: string;
  handle: string;
  displayName: string | null;
  roles: string[];
  accountStatus: string;
  emailVerified: boolean;
  totpEnabled: boolean;
};

export type ModerationQueueItem = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export type Payout = {
  id: string;
  creatorId: string;
  payoutAccountId: string | null;
  transactionId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  requestedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  processorRef: string | null;
  failureReason: string | null;
  creator: { slug: string; displayName: string | null };
  payoutAccount: { method: string; last4: string | null; label: string | null } | null;
};

export type LedgerHold = {
  id: string;
  creatorId: string;
  amountCents: number;
  currency: string;
  reason: string;
  active: boolean;
  createdAt: string;
  releasedAt: string | null;
  creator: { slug: string; displayName: string | null };
};

export type FraudDashboard = {
  chargebacks: number;
  refunds: number;
  failedPayouts: number;
};

export type GeoBlock = {
  id: string;
  countryCode: string;
  scope: "ACCESS" | "PAYOUTS";
  reason: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DmcaRequest = {
  id: string;
  reporterEmail: string;
  reporterName: string | null;
  description: string;
  targetUrl: string | null;
  status: string;
  legalHold: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  actorType: string;
  actorAdminId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  diff: unknown;
  createdAt: string;
};

export type ComplianceEvent = {
  id: string;
  eventType: string;
  creatorId: string | null;
  userId: string | null;
  jurisdiction: string | null;
  payload: unknown;
  occurredAt: string;
};
