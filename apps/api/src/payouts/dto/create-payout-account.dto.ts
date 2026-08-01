import { IsEnum, IsOptional, IsString, Length, Matches } from "class-validator";
import { PayoutMethod } from "@prisma/client";

export class CreatePayoutAccountDto {
  @IsEnum(PayoutMethod)
  method!: PayoutMethod;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  label?: string;

  /**
   * Processor-form account details (e.g. { "iban": "DE..." } or
   * { "routingNumber": "...", "accountNumber": "..." }). Sealed at rest;
   * only the last four characters are ever exposed again.
   */
  @IsString()
  @Length(4, 200)
  accountReference!: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
