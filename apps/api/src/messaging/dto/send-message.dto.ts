import { IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class SendMessageDto {
  /** Creator side of the conversation. Equals the sender when a creator replies. */
  @IsUUID()
  creatorId!: string;

  /** Required when the sender is the creator (creator → fan reply). */
  @IsOptional()
  @IsUUID()
  fanUserId?: string;

  @IsOptional()
  @IsString()
  body?: string;

  /** Creators only: lock the message behind a pay-per-view price. */
  @IsOptional()
  @IsInt()
  @Min(100)
  ppvPriceCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
