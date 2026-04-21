import { IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class SendMessageDto {
  @IsUUID()
  creatorId!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  ppvPriceCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
