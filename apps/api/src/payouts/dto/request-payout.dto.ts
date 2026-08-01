import { IsInt, IsOptional, IsUUID, Min } from "class-validator";

export class RequestPayoutDto {
  /** Defaults to the most recently added active account. */
  @IsOptional()
  @IsUUID()
  payoutAccountId?: string;

  /** Defaults to the full available balance. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;
}
