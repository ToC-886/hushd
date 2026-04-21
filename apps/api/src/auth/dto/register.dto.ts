import { UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12, { message: "password must be at least 12 characters" })
  password!: string;

  @IsOptional()
  @IsEnum(UserRole)
  /** Defaults to FAN. Only FAN or CREATOR may self-register in v1. */
  role?: UserRole;
}
