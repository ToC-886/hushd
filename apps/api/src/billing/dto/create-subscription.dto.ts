import { IsString, IsUrl } from "class-validator";

export class CreateSubscriptionDto {
  @IsString()
  creatorSlug!: string;

  @IsString()
  tierId!: string;

  @IsUrl()
  successReturnUrl!: string;

  @IsUrl()
  cancelReturnUrl!: string;
}
