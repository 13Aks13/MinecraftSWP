import type { BackupDto, Paginated } from "@mc/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto.js";
import { BackupsService } from "./backups.service.js";
import { CreateBackupDto, RestoreBackupDto } from "./dto/backup.dto.js";

@ApiTags("backups")
@ApiBearerAuth()
@Controller("backups")
export class BackupsController {
  constructor(@Inject(BackupsService) private readonly backups: BackupsService) {}

  @Get()
  list(@Query() query: PaginationQueryDto): Promise<Paginated<BackupDto>> {
    return this.backups.list(query);
  }

  @Post()
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Create a compressed backup of a world (or all worlds)" })
  create(@Body() dto: CreateBackupDto): Promise<BackupDto> {
    return this.backups.create(dto.worldId);
  }

  @Post(":id/restore")
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Stop the server, restore the archive, then start it again" })
  restore(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RestoreBackupDto,
  ): Promise<BackupDto> {
    return this.backups.restore(id, dto.worldId);
  }

  @Get(":id/download")
  @Header("Content-Type", "application/gzip")
  async download(@Param("id", ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const backup = await this.backups.get(id);
    return new StreamableFile(this.backups.downloadStream(backup), {
      type: "application/gzip",
      disposition: `attachment; filename="${backup.fileName}"`,
    });
  }

  @Delete(":id")
  @Roles("admin", "moderator")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ deleted: true }> {
    await this.backups.remove(id);
    return { deleted: true };
  }
}
