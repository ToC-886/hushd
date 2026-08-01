import { IsIn, IsInt, IsString, Matches, Max, Min } from "class-validator";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** Request body for POST /v1/media/uploads/init. MIME and size are required. */
export class InitUploadDto {
  @IsString()
  ownerCreatorId!: string;

  @IsIn(["IMAGE", "VIDEO", "AUDIO", "OTHER"])
  mediaType!: "IMAGE" | "VIDEO" | "AUDIO" | "OTHER";

  @IsString()
  @Matches(/^(image|video|audio)\//, {
    message: "content_type_must_be_media",
  })
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  byteSize!: number;
}
