import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { ImportJobDto, ImportReport, PackDependency, PackDto, Paginated } from "@mc/shared";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { StorageService } from "../../common/storage/storage.service.js";
import { DeletePacksQueryDto } from "./dto/delete-query.dto.js";
import { BundleQueryDto, ImportQueryDto } from "./dto/import-bundle.dto.js";
import { ListPacksQueryDto } from "./dto/list-packs.dto.js";
import { PacksService } from "./packs.service.js";
import { ImportJobService } from "./services/import-job.service.js";
import { ImportQueueService } from "./services/import-queue.service.js";
import { PackImportService } from "./services/pack-import.service.js";
import { buildUploadOptions } from "./upload.config.js";

@ApiTags("packs")
@ApiBearerAuth()
@Controller("packs")
export class PacksController {
  constructor(
    @Inject(PacksService) private readonly packs: PacksService,
    @Inject(PackImportService) private readonly importer: PackImportService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ImportJobService) private readonly importJobs: ImportJobService,
    @Inject(ImportQueueService) private readonly importQueue: ImportQueueService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List imported resource/behavior packs" })
  list(@Query() query: ListPacksQueryDto): Promise<Paginated<PackDto>> {
    return this.packs.list(query);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string): Promise<PackDto> {
    return this.packs.get(id).then((pack) => this.packs.toDto(pack));
  }

  @Get(":id/dependencies")
  dependencies(@Param("id", ParseUUIDPipe) id: string): Promise<PackDependency[]> {
    return this.packs.findDependencies(id);
  }

  @Public()
  @Get(":id/icon")
  async icon(@Param("id", ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const pack = await this.packs.get(id);
    if (!pack.iconPath) {
      throw new NotFoundException("This pack has no icon");
    }
    const iconPath = path.join(this.storage.root, pack.iconPath);
    try {
      await stat(iconPath);
    } catch {
      throw new NotFoundException("Icon file is missing");
    }
    const extension = path.extname(iconPath).toLowerCase();
    const mime =
      extension === ".png" ? "image/png" : extension === ".gif" ? "image/gif" : "image/jpeg";
    return new StreamableFile(createReadStream(iconPath), {
      type: mime,
      disposition: `inline; filename="${path.basename(iconPath)}"`,
    });
  }

  @Post("import")
  @Roles("admin", "moderator")
  @UseInterceptors(FileInterceptor("file", buildUploadOptions()))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Import a ZIP bundle and auto-register every pack inside" })
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: ImportQueryDto,
  ): Promise<ImportReport> {
    return this.importer.importBundle(file, query.type, query.onDuplicate ?? "replace");
  }

  @Post("upload/resource-bundle")
  @Roles("admin", "moderator")
  @UseInterceptors(FileInterceptor("file", buildUploadOptions()))
  @ApiConsumes("multipart/form-data")
  resourceBundle(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: BundleQueryDto,
  ): Promise<ImportReport> {
    return this.importer.importBundle(file, "resource", query.onDuplicate ?? "replace");
  }

  @Post("upload/behavior-bundle")
  @Roles("admin", "moderator")
  @UseInterceptors(FileInterceptor("file", buildUploadOptions()))
  @ApiConsumes("multipart/form-data")
  behaviorBundle(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: BundleQueryDto,
  ): Promise<ImportReport> {
    return this.importer.importBundle(file, "behavior", query.onDuplicate ?? "replace");
  }

  @Post("import/async")
  @Roles("admin", "moderator")
  @UseInterceptors(FileInterceptor("file", buildUploadOptions()))
  @ApiConsumes("multipart/form-data")
  async importAsync(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: ImportQueryDto,
  ): Promise<{ jobId: string; status: "queued" }> {
    if (!file) {
      throw new BadRequestException('ZIP file is required in the "file" field');
    }
    const type = query.type;
    const policy = query.onDuplicate ?? "replace";
    const job = await this.importJobs.createJob({
      bundleType: type,
      duplicatePolicy: policy,
      filePath: file.path,
    });
    await this.importQueue.enqueue({ jobId: job.id, filePath: file.path, type, policy });
    return { jobId: job.id, status: "queued" };
  }

  @Get("import/jobs/:id")
  @Roles("admin", "moderator")
  async importJob(@Param("id") id: string): Promise<ImportJobDto> {
    const job = await this.importJobs.getJob(id);
    if (!job) {
      throw new NotFoundException("Import job not found");
    }
    return this.importJobs.toDto(job);
  }

  @Delete(":id")
  @Roles("admin", "moderator")
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: DeletePacksQueryDto,
  ): Promise<{ deleted: true }> {
    await this.packs.remove(id, query.force === "true");
    return { deleted: true };
  }

  @Delete()
  @Roles("admin", "moderator")
  async removeMany(
    @Body() body: { ids?: string[] },
    @Query() query: DeletePacksQueryDto,
  ): Promise<{ deleted: number }> {
    const opts = query.force === "true";
    if (body?.ids?.length) {
      return this.packs.removeMany(body.ids, opts);
    }
    if (query.all === "true") {
      return this.packs.removeAll(query.type, opts);
    }
    throw new BadRequestException(
      'Refusing to delete: pass "ids" in the body or explicitly set all=true',
    );
  }
}
