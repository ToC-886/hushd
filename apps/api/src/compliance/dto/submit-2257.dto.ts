import { IsDateString, IsOptional, IsString, Length } from "class-validator";

export class Submit2257Dto {
  @IsString()
  @Length(2, 200)
  legalFullName!: string;

  /** ISO-8601 date (YYYY-MM-DD). Must place the creator at 18+. */
  @IsDateString()
  dateOfBirth!: string;

  /** e.g. PASSPORT, NATIONAL_ID, DRIVERS_LICENSE */
  @IsString()
  @Length(2, 60)
  documentType!: string;

  @IsString()
  @Length(3, 120)
  documentNumber!: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  issuedBy?: string;
}
