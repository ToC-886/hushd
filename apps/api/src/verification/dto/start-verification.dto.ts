import { IsOptional, IsString, IsUrl } from "class-validator";

export class StartVerificationDto {
  @IsUrl()
  returnUrl!: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
