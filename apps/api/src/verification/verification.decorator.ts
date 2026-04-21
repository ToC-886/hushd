import { SetMetadata } from "@nestjs/common";

export const VERIFICATION_POLICY_KEY = "verificationPolicy";

export type VerificationPolicy = "age" | "creator";

export const RequireVerification = (policy: VerificationPolicy) =>
  SetMetadata(VERIFICATION_POLICY_KEY, policy);
