import { IsString, MaxLength, MinLength } from "class-validator";

export class PasswordResetConfirmDto {
  @IsString()
  @MinLength(32)
  token!: string;

  // bcrypt silently truncates past 72 bytes — reject instead of surprising users.
  @IsString()
  @MinLength(12, { message: "password must be at least 12 characters" })
  @MaxLength(72, { message: "password must be at most 72 characters" })
  password!: string;
}
