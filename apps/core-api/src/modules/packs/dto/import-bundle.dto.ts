import { DUPLICATE_POLICIES, type DuplicatePolicy, PACK_TYPES, type PackType } from "@mc/shared";
import { IsEnum, IsIn, IsOptional } from "class-validator";

export class ImportQueryDto {
  @IsEnum(PACK_TYPES)
  type!: PackType;

  @IsOptional()
  @IsIn(DUPLICATE_POLICIES)
  onDuplicate?: DuplicatePolicy;
}

export class BundleQueryDto {
  @IsOptional()
  @IsEnum(["skip", "replace"])
  onDuplicate?: "skip" | "replace";
}
