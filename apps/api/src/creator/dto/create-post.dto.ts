import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { PostVisibility } from "@prisma/client";

export class CreatePostDto {
  @IsOptional()
  @IsString()
  body?: string;

  @IsEnum(PostVisibility)
  visibility!: PostVisibility;

  @IsOptional()
  @IsUUID()
  lockedTierId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  mediaIds?: string[];
}
