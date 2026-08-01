import { GeoBlockScope } from "@prisma/client";
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateGeoBlockDto {
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: "countryCode must be an ISO 3166-1 alpha-2 code" })
  countryCode!: string;

  @IsEnum(GeoBlockScope)
  scope!: GeoBlockScope;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
