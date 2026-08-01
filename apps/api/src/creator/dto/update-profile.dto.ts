import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateCreatorProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: "countryCode must be an ISO 3166-1 alpha-2 code" })
  countryCode?: string;
}
