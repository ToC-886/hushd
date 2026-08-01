import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateTierDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(1000000)
  priceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  trialDays?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
