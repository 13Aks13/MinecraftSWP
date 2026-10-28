import { Transform } from "class-transformer";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { MAX_COMMAND_LENGTH } from "../console-command.js";

export class SendCommandDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: "command must not be empty" })
  @MaxLength(MAX_COMMAND_LENGTH)
  @Matches(/^[^\r\n\0]+$/, { message: "command must be a single line" })
  command!: string;
}
