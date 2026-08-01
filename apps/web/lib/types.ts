/** Shared API response shapes (mirrors the NestJS services). */

export type UserRole = "FAN" | "CREATOR" | "ADMIN" | "MODERATOR";
export type UserStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";

export type Me = {
  id: string;
  email: string;
  roles: UserRole[];
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  creatorSlug: string | null;
  totpEnabled: boolean;
};

export type RegisterResult =
  | import("./api").AuthTokens
  | { pendingVerification: true; user: { id: string; email: string } };

export type PostVisibility = "PUBLIC" | "SUBSCRIBERS" | "TIER_LOCKED";

export type FeedPost = {
  id: string;
  creator: { userId: string; slug: string; displayName: string | null };
  body: string;
  visibility: PostVisibility;
  lockedTierId: string | null;
  publishedAt: string | null;
  media: Array<{
    id: string;
    type: string;
    streamUid: string | null;
    url: string | null;
  }>;
};

export type CreatorDashboard = {
  windowDays: number;
  activeTiers: number;
  activeSubscribers: number;
  grossCents30d: number;
  netCents30d: number;
};

export type SubscriptionTier = {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  priceCents: number;
  interval: "MONTH" | "YEAR";
  trialDays: number;
  active: boolean;
};

export type Transaction = {
  id: string;
  type: string;
  status: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  processor: string;
  processorTxnId: string | null;
  occurredAt: string;
};

export type MessagePpv = {
  priceCents: number;
  currency: string;
  unlocked: boolean;
};

export type Message = {
  id: string;
  senderUserId: string;
  createdAt: string;
  locked: boolean;
  body: string | null;
  ppv: MessagePpv | null;
};

export type Conversation = {
  id: string;
  fanUserId: string;
  creatorId: string;
  messages: Message[];
};

export type CheckoutResult = {
  processor: string;
  redirectUrl: string;
  processorSessionRef: string;
};

export type PayoutAccount = {
  id: string;
  rail: string;
  label: string | null;
  createdAt: string;
};

export type Payout = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  requestedAt: string;
};

export type Balance = {
  availableCents: number;
  currency: string;
};

export type VerificationRecord = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  verifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type VerificationStatus = {
  ageVerification: VerificationRecord | null;
  idVerification: VerificationRecord | null;
};
