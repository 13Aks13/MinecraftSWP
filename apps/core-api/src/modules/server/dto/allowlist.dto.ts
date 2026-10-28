import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const NAME_PATTERN = /^[^\r\n/\\]+$/;
const XUID_PATTERN = /^\d{15,20}$/;

/** Player names go into allowlist.json and are used as a URL path segment. */
export class AllowListNameParamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(NAME_PATTERN, { message: "name contains invalid characters" })
  name!: string;
}

export class AllowListEntryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(NAME_PATTERN, { message: "name contains invalid characters" })
  name!: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  })
  @IsOptional()
  @Matches(XUID_PATTERN, { message: "xuid must be a numeric Xbox user id" })
  xuid?: string;
}
