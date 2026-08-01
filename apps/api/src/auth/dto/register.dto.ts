import { UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  // bcrypt silently truncates past 72 bytes — reject instead of surprising users.
  @IsString()
  @MinLength(12, { message: "password must be at least 12 characters" })
  @MaxLength(72, { message: "password must be at most 72 characters" })
  password!: string;

  @IsOptional()
  @IsEnum(UserRole)
  /** Defaults to FAN. Only FAN or CREATOR may self-register in v1. */
  role?: UserRole;
}
