import { IsString, Matches, MaxLength, MinLength } from "class-validator";

/** Player names go into allowlist.json and are used as a URL path segment. */
export class AllowListNameParamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(/^[^\r\n/\\]+$/, { message: "name contains invalid characters" })
  name!: string;
}
