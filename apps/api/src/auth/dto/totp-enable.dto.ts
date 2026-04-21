import { IsString, Length } from "class-validator";

export class TotpEnableDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
