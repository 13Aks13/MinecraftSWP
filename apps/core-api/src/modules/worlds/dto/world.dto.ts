import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateWorldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[\p{L}\p{N} _.-]+$/u, {
    message: "name may contain letters, numbers, spaces, dots, dashes and underscores",
  })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  seed?: string;

  @IsOptional()
  @IsEnum(["survival", "creative", "adventure"])
  gamemode?: "survival" | "creative" | "adventure";

  @IsOptional()
  @IsEnum(["peaceful", "easy", "normal", "hard"])
  difficulty?: "peaceful" | "easy" | "normal" | "hard";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  resourcePackIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  behaviorPackIds?: string[];
}

/** Pack selection can be changed after a world has been created. */
export class UpdateWorldPacksDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  resourcePackIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  behaviorPackIds?: string[];
}

export class ListWorldsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}
