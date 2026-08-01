import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, Length } from "class-validator";

export class CreateDmcaDto {
  /** Reference identifying the claimant (email, case ref, etc.). */
  @IsString()
  @Length(3, 200)
  claimantRef!: string;

  /** Target references (post/media/profile URLs or IDs). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  targetRefs!: string[];

  @IsOptional()
  @IsString()
  @Length(3, 500)
  notesRef?: string;
}
