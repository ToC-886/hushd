import { DMCAStatus } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional } from "class-validator";

export class UpdateDmcaStatusDto {
  @IsEnum(DMCAStatus)
  status!: DMCAStatus;

  @IsOptional()
  @IsBoolean()
  legalHold?: boolean;
}
