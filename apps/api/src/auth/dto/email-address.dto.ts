import { IsEmail } from "class-validator";

/** Shared shape for resend-verification and password-reset requests. */
export class EmailAddressDto {
  @IsEmail()
  email!: string;
}
