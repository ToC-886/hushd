import { IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class TipDto {
  @IsUUID()
  creatorId!: string;

  @IsOptional()
  @IsUUID()
  postId?: string;

  @IsOptional()
  @IsUUID()
  messageId?: string;

  @IsInt()
  @Min(100)
  amountCents!: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
