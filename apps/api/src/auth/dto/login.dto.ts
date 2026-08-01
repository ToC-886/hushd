import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** Required when the account has TOTP enabled. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: "totpCode must be a 6-digit code" })
  totpCode?: string;
}
