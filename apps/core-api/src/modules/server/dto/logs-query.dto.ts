import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class LogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  tail = 500;
}
