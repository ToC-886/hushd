import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

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
  @IsInt()
  @Min(0)
  @Max(30)
  trialDays?: number;
}
