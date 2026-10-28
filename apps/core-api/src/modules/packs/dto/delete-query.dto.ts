import { PACK_TYPES, type PackType } from "@mc/shared";
import { IsEnum, IsIn, IsOptional } from "class-validator";

const FLAG_VALUES = ["true", "false"];

export class ForceQueryDto {
  @IsOptional()
  @IsIn(FLAG_VALUES, { message: 'force must be "true" or "false"' })
  force?: string;
}

export class DeletePacksQueryDto extends ForceQueryDto {
  @IsOptional()
  @IsEnum(PACK_TYPES)
  type?: PackType;

  @IsOptional()
  @IsIn(FLAG_VALUES, { message: 'all must be "true" or "false"' })
  all?: string;
}
