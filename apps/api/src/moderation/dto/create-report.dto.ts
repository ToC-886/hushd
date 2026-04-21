import { IsEnum, IsString } from "class-validator";
import { ReportTargetType } from "@prisma/client";

export class CreateReportDto {
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @IsString()
  targetId!: string;

  @IsString()
  reason!: string;
}
