import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { SubscriptionInterval } from "@prisma/client";

export class CreateTierDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(100)
  @Max(1000000)
  priceCents!: number;

  @IsOptional()
  @IsEnum(SubscriptionInterval)
  interval?: SubscriptionInterval;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  trialDays?: number;
}
