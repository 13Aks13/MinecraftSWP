import { createReadStream } from "node:fs";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { type BackupDto, formatBytes, type Paginated, slugify } from "@mc/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { c as createTar, x as extractTar } from "tar";
import type { Repository } from "typeorm";
import type { PaginationQueryDto } from "../../common/dto/pagination-query.dto.js";
import { StorageService } from "../../common/storage/storage.service.js";
import { dirSize, pathExists } from "../../common/utils/fs.utils.js";
import { envFlag } from "../../config/env.js";
import { ServerService } from "../server/server.service.js";
import { WorldEntity } from "../worlds/entities/world.entity.js";
import { WorldsService } from "../worlds/worlds.service.js";
import { BackupEntity } from "./entities/backup.entity.js";

@Injectable()
export class BackupsService implements OnModuleInit {
  private readonly logger = new Logger(BackupsService.name);
  private readonly gracefulStop: boolean;

  constructor(
    @InjectRepository(BackupEntity)
    private readonly backups: Repository<BackupEntity>,
    @InjectRepository(WorldEntity)
    private readonly worlds: Repository<WorldEntity>,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ServerService) private readonly server: ServerService,
    @Inject(WorldsService) private readonly worldsService: WorldsService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.gracefulStop = envFlag(config.get<string>("BACKUP_GRACEFUL_STOP"), true);
  }

  async onModuleInit(): Promise<void> {
    // Backups left in "creating" state mean the process died mid-archive.
    const stale = await this.backups.findBy({ status: "creating" });
    for (const backup of stale) {
      await this.backups.update(
        { id: backup.id },
        { status: "failed", error: "Interrupted by an API restart" },
      );
    }
    if (stale.length > 0) {
      this.logger.warn(`Marked ${stale.length} interrupted backup(s) as failed`);
    }
  }

  async list(query: PaginationQueryDto): Promise<Paginated<BackupDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const [items, total] = await this.backups.findAndCount({
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((backup) => this.toDto(backup)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    };
  }

  async get(id: string): Promise<BackupEntity> {
    const backup = await this.backups.findOneBy({ id });
    if (!backup) {
      throw new NotFoundException(`Backup ${id} not found`);
    }
    return backup;
  }

  filePath(backup: BackupEntity): string {
    return path.join(this.storage.backupsDir(), backup.fileName);
  }

  downloadStream(backup: BackupEntity) {
    return createReadStream(this.filePath(backup));
  }

  async create(worldId?: string): Promise<BackupDto> {
    const world = worldId ? await this.worlds.findOneBy({ id: worldId }) : null;
    if (worldId && !world) {
      throw new NotFoundException(`World ${worldId} not found`);
    }

    const sourceDir = world
      ? path.join(this.storage.worldsDir(), world.folderName)
      : this.storage.worldsDir();
    if (!(await pathExists(sourceDir))) {
      throw new ConflictException("World folder is missing on disk");
    }

    const label = world ? slugify(world.name, "world") : "all-worlds";
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+$/, "");
    const fileName = `${label}-${stamp}.tar.gz`;
    const target = path.join(this.storage.backupsDir(), fileName);

    const activeWorld = await this.worlds.findOneBy({ status: "active" });
    const includesActiveWorld = !world || (activeWorld !== null && world.id === activeWorld.id);

    const backup = await this.backups.save(
      this.backups.create({
        worldId: world?.id ?? null,
        worldName: world?.name ?? "All worlds",
        fileName,
        status: "creating",
      }),
    );

    let stopped = false;
    try {
      // The library folder of the active world is only a copy of the source
      // world. Stop the server and sync it back before archiving so a backup
      // always contains the latest live progress.
      if (this.gracefulStop && includesActiveWorld) {
        const status = await this.server.status().catch(() => null);
        if (status?.state === "running") {
          await this.server.stop();
          stopped = true;
        }
      }
      if (includesActiveWorld) {
        await this.worldsService.syncActiveWorld();
      }

      await mkdir(this.storage.backupsDir(), { recursive: true });
      await createTar(
        {
          gzip: true,
          file: target,
          cwd: sourceDir,
          portable: true,
          noMtime: false,
        },
        ["."],
      );

      const fileStats = await stat(target);
      backup.sizeBytes = String(fileStats.size);
      backup.status = "ready";
      backup.error = null;
      await this.backups.save(backup);
      return this.toDto(backup);
    } catch (error) {
      backup.status = "failed";
      backup.error = (error as Error).message;
      await this.backups.save(backup);
      await rm(target, { force: true }).catch(() => undefined);
      this.logger.error(`Backup failed: ${(error as Error).message}`, (error as Error).stack);
      throw new BadRequestException(`Backup failed: ${(error as Error).message}`);
    } finally {
      if (stopped) {
        await this.server.start().catch((error) => {
          this.logger.error(`Could not restart Bedrock after backup: ${(error as Error).message}`);
        });
      }
    }
  }

  async restore(id: string, worldId: string): Promise<BackupDto> {
    const backup = await this.get(id);
    if (backup.status !== "ready") {
      throw new ConflictException(`Backup is not ready (status: ${backup.status})`);
    }

    const world = await this.worlds.findOneBy({ id: worldId });
    if (!world) {
      throw new NotFoundException(`World ${worldId} not found`);
    }

    const archive = this.filePath(backup);
    if (!(await pathExists(archive))) {
      throw new NotFoundException("Backup archive is missing on disk");
    }

    const worldDir = path.join(this.storage.worldsDir(), world.folderName);
    const extractionDir = path.join(this.storage.tempDir(), `restore-${Date.now()}`);

    try {
      await this.server.stop();
    } catch (error) {
      this.logger.warn(`Could not stop Bedrock before restore: ${(error as Error).message}`);
    }

    try {
      await mkdir(extractionDir, { recursive: true });
      await extractTar({ file: archive, cwd: extractionDir, strict: true });
      await this.assertArchiveRoot(extractionDir);

      await rm(worldDir, { recursive: true, force: true });
      await cp(extractionDir, worldDir, { recursive: true, dereference: false });
      await this.worlds.update({ id: world.id }, { sizeBytes: String(await dirSize(worldDir)) });

      if (world.status === "active") {
        const activeDir = this.storage.activeWorldDir();
        await rm(activeDir, { recursive: true, force: true });
        await cp(worldDir, activeDir, { recursive: true, dereference: false });
      }

      return this.toDto(backup);
    } catch (error) {
      this.logger.error(`Restore failed: ${(error as Error).message}`, (error as Error).stack);
      throw new BadRequestException(`Restore failed: ${(error as Error).message}`);
    } finally {
      await rm(extractionDir, { recursive: true, force: true }).catch(() => undefined);
      try {
        await this.server.start();
      } catch (error) {
        this.logger.warn(`Could not start Bedrock after restore: ${(error as Error).message}`);
      }
    }
  }

  private async assertArchiveRoot(dir: string): Promise<void> {
    const entries = await readdir(dir);
    if (
      entries.includes("level.dat") ||
      entries.includes("db") ||
      entries.includes("world_behavior_packs.json")
    ) {
      return;
    }
    const nested = await readdir(path.join(dir, entries[0] ?? ""), { withFileTypes: true }).catch(
      () => [],
    );
    if (nested.some((entry) => entry.name === "level.dat" || entry.name === "db")) {
      return;
    }
    throw new BadRequestException("Archive does not look like a Bedrock world");
  }

  async remove(id: string): Promise<void> {
    const backup = await this.get(id);
    await this.backups.delete({ id });
    await rm(this.filePath(backup), { force: true });
  }

  async count(): Promise<number> {
    return this.backups.count();
  }

  toDto(backup: BackupEntity): BackupDto {
    return {
      id: backup.id,
      worldId: backup.worldId,
      worldName: backup.worldName,
      fileName: backup.fileName,
      sizeBytes: String(backup.sizeBytes),
      status: backup.status,
      createdAt: backup.createdAt.toISOString(),
    };
  }

  humanSize(backup: BackupEntity): string {
    return formatBytes(backup.sizeBytes);
  }
}
