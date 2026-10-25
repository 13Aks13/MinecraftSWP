import { rm } from "node:fs/promises";
import path from "node:path";
import type { PackDependency, PackDto, PackType, Paginated } from "@mc/shared";
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, type Repository } from "typeorm";
import { StorageService } from "../../common/storage/storage.service.js";
import { ServerService } from "../server/server.service.js";
import { WorldEntity } from "../worlds/entities/world.entity.js";
import { WorldPackEntity } from "../worlds/entities/world-pack.entity.js";
import type { ListPacksQueryDto } from "./dto/list-packs.dto.js";
import { PackEntity } from "./entities/pack.entity.js";

@Injectable()
export class PacksService implements OnModuleInit {
  private readonly logger = new Logger(PacksService.name);

  constructor(
    @InjectRepository(PackEntity)
    private readonly packs: Repository<PackEntity>,
    @InjectRepository(WorldPackEntity)
    private readonly worldPacks: Repository<WorldPackEntity>,
    @InjectRepository(WorldEntity)
    private readonly worlds: Repository<WorldEntity>,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ServerService) private readonly server: ServerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const packs = await this.packs.find({ select: { type: true, folderName: true, name: true } });
    for (const pack of packs) {
      try {
        await this.storage.publishPack(pack.type, pack.folderName);
      } catch (error) {
        this.logger.warn(
          `Could not publish pack "${pack.name}" to the Bedrock server folders: ${(error as Error).message}`,
        );
      }
    }
  }

  async list(query: ListPacksQueryDto): Promise<Paginated<PackDto>> {
    const builder = this.packs.createQueryBuilder("pack");
    if (query.type) {
      builder.andWhere("pack.type = :type", { type: query.type });
    }
    if (query.search) {
      builder.andWhere("(lower(pack.name) LIKE :search OR pack.packUuid::text LIKE :search)", {
        search: `%${query.search.toLowerCase()}%`,
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    builder
      .orderBy("pack.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await builder.getManyAndCount();
    return {
      items: items.map((pack) => this.toDto(pack)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    };
  }

  async get(id: string): Promise<PackEntity> {
    const pack = await this.packs.findOneBy({ id });
    if (!pack) {
      throw new NotFoundException(`Pack ${id} not found`);
    }
    return pack;
  }

  async findDependencies(
    id: string,
  ): Promise<Array<PackDependency & { resolvedPackId: string | null; missing: boolean }>> {
    const pack = await this.get(id);
    const uuids = pack.dependencies.map((dependency) => dependency.uuid);
    if (uuids.length === 0) {
      return [];
    }

    const resolved = await this.packs.find({
      where: { packUuid: In(uuids) },
      select: { id: true, packUuid: true, name: true },
    });
    const byUuid = new Map(resolved.map((item) => [item.packUuid, item.id]));

    return pack.dependencies.map((dependency) => ({
      ...dependency,
      missing: !byUuid.has(dependency.uuid),
      resolvedPackId: byUuid.get(dependency.uuid) ?? null,
    }));
  }

  async remove(id: string, force = false): Promise<void> {
    const pack = await this.get(id);
    const usages = await this.worldPacks.count({ where: { packId: id } });
    if (usages > 0 && !force) {
      throw new ConflictException(
        `Pack "${pack.name}" is used by ${usages} world configuration(s); detach it first or use force=true`,
      );
    }

    if (usages > 0 && force) {
      await this.detachFromWorlds(pack);
    }

    await this.packs.delete({ id });
    await rm(path.join(this.storage.packsDir(pack.type), pack.folderName), {
      recursive: true,
      force: true,
    });
    await this.storage.unpublishPack(pack.type, pack.folderName);
    if (pack.iconPath) {
      await rm(path.join(this.storage.root, pack.iconPath), { force: true });
    }
  }

  /**
   * Detach a pack from all worlds it is attached to.
   * When the pack is attached to the active world the Bedrock server is stopped
   * first, pack files are rewritten without the deleted pack, then the server
   * is restarted.
   */
  private async detachFromWorlds(pack: PackEntity): Promise<void> {
    const links = await this.worldPacks.find({
      where: { packId: pack.id },
      select: { worldId: true, kind: true },
    });

    const worldIds = [...new Set(links.map((link) => link.worldId))];
    const activeWorlds = await this.worlds.find({
      where: { id: In(worldIds), status: "active" },
    });

    let stopped = false;
    if (activeWorlds.length > 0) {
      this.logger.warn(
        `Stopping server to detach pack "${pack.name}" from active world(s): ${activeWorlds.map((w) => w.name).join(", ")}`,
      );
      try {
        await this.server.stop();
        stopped = true;
      } catch (error) {
        this.logger.error(`Failed to stop Bedrock server. Aborting pack detachment to prevent corruption: ${(error as Error).message}`);
        throw new InternalServerErrorException("Could not stop server for maintenance");
      }
        this.logger.warn(`Could not stop Bedrock: ${(error as Error).message}`);
      });
      stopped = true;
    }

    try {
      // Remove all world_pack associations for this pack.
      await this.worldPacks.delete({ packId: pack.id });

      // For each still-active world rebuild the pack manifest without the deleted pack.
      for (const world of activeWorlds) {
        const remaining = await this.worldPacks.find({
          where: { worldId: world.id },
          relations: { pack: true },
        });
        const resourcePacks = remaining
          .filter((link) => link.kind === "resource" && link.pack)
          .map((link) => link.pack);
        const behaviorPacks = remaining
          .filter((link) => link.kind === "behavior" && link.pack)
          .map((link) => link.pack);

        // Update the live world directory.
        await this.storage.writeWorldPackFiles(
          this.storage.activeWorldDir(),
          resourcePacks,
          behaviorPacks,
        );

        // Update the library copy as well.
        const libraryDir = path.join(this.storage.worldsDir(), world.folderName);
        await this.storage.writeWorldPackFiles(libraryDir, resourcePacks, behaviorPacks);
      }
    } finally {
      if (stopped) {
        await this.server.start().catch((error) => {
          this.logger.error(
            `Could not restart Bedrock after pack deletion: ${(error as Error).message}`,
          );
        });
      }
    }
  }

  async removeMany(ids: string[], force = false): Promise<{ deleted: number }> {
    let deleted = 0;
    for (const id of ids) {
      try {
        await this.remove(id, force);
        deleted += 1;
      } catch {
        // skip packs in use
      }
    }
    return { deleted };
  }

  async removeAll(type?: PackType, force = false): Promise<{ deleted: number }> {
    const where = type ? { type } : {};
    const packs = await this.packs.find({ where, select: { id: true } });
    return this.removeMany(
      try {
        await this.remove(id, force);
        deleted += 1;
      } catch (error) {
        if (error instanceof ConflictException) {
          this.logger.log(`Skipping pack ${id}: ${error.message}`);
          continue;
        }
        throw error;
      }
      force,
    );
  }
  toDto(pack: PackEntity): PackDto {
    return {
      id: pack.id,
      name: pack.name,
      packUuid: pack.packUuid,
      version: pack.version,
      versionArray: pack.versionArray,
      type: pack.type,
      folderName: pack.folderName,
      iconPath: pack.iconPath,
      sizeBytes: String(pack.sizeBytes),
      dependencies: pack.dependencies ?? [],
      sourceBundle: pack.sourceBundle,
      createdAt: pack.createdAt.toISOString(),
      updatedAt: pack.updatedAt.toISOString(),
    };
  }

  countByType(): Promise<Record<PackType, number>> {
    return this.packs
      .createQueryBuilder("pack")
      .select("pack.type", "type")
      .addSelect("count(*)", "count")
      .groupBy("pack.type")
      .getRawMany<{ type: PackType; count: string }>()
      .then((rows) => ({
        resource: Number(rows.find((row) => row.type === "resource")?.count ?? 0),
        behavior: Number(rows.find((row) => row.type === "behavior")?.count ?? 0),
      }));
  }
}
