import { IsOptional, IsString } from "class-validator";

export class CancelSubscriptionDto {
  @IsString()
  subscriptionId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
