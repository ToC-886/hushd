import { IsOptional, IsString, MinLength } from "class-validator";

export class RefreshDto {
  /** Optional in the body — browser clients send it as an HttpOnly cookie. */
  @IsOptional()
  @IsString()
  @MinLength(20)
  refreshToken?: string;
}
