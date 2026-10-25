import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Paginated, slugify, type WorldDto, type WorldStatus } from "@mc/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, type Repository } from "typeorm";
import { StorageService } from "../../common/storage/storage.service.js";
import { dirSize, pathExists } from "../../common/utils/fs.utils.js";
import { PackEntity } from "../packs/entities/pack.entity.js";
import { ServerService } from "../server/server.service.js";
import type { CreateWorldDto, ListWorldsQueryDto, UpdateWorldPacksDto } from "./dto/world.dto.js";
import { WorldEntity } from "./entities/world.entity.js";
import { WorldPackEntity } from "./entities/world-pack.entity.js";

const DEFAULT_PACK_FILES = {
  resource: "world_resource_packs.json",
  behavior: "world_behavior_packs.json",
} as const;

@Injectable()
export class WorldsService {
  private readonly logger = new Logger(WorldsService.name);

  constructor(
    @InjectRepository(WorldEntity)
    private readonly worlds: Repository<WorldEntity>,
    @InjectRepository(WorldPackEntity)
    private readonly worldPacks: Repository<WorldPackEntity>,
    @InjectRepository(PackEntity)
    private readonly packs: Repository<PackEntity>,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ServerService) private readonly server: ServerService,
  ) {}

  async list(query: ListWorldsQueryDto): Promise<Paginated<WorldDto>> {
    const builder = this.worlds
      .createQueryBuilder("world")
      .leftJoinAndSelect("world.packs", "worldPack")
      .leftJoinAndSelect("worldPack.pack", "pack");

    if (query.search) {
      builder.andWhere("lower(world.name) LIKE :search", {
        search: `%${query.search.toLowerCase()}%`,
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    builder
      .orderBy("world.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await builder.getManyAndCount();
    return {
      items: items.map((world) => this.toDto(world)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    };
  }

  async get(id: string): Promise<WorldEntity> {
    const world = await this.worlds
      .createQueryBuilder("world")
      .leftJoinAndSelect("world.packs", "worldPack")
      .leftJoinAndSelect("worldPack.pack", "pack")
      .where("world.id = :id", { id })
      .getOne();
    if (!world) {
      throw new NotFoundException(`World ${id} not found`);
    }
    return world;
  }

  async create(dto: CreateWorldDto): Promise<WorldDto> {
    const name = dto.name.trim();
    if (await this.worlds.existsBy({ name })) {
      throw new ConflictException(`World "${name}" already exists`);
    }

    const slug = await this.uniqueSlug(slugify(name, "world"));
    const resourceIds = [...new Set(dto.resourcePackIds ?? [])];
    const behaviorIds = [...new Set(dto.behaviorPackIds ?? [])];
    const packs = await this.loadPacks(resourceIds, behaviorIds);

    const folder = path.join(this.storage.worldsDir(), slug);
    await mkdir(folder, { recursive: true });

    try {
      await this.writePackFiles(folder, packs.resource, packs.behavior);

      const world = this.worlds.create({
        name,
        slug,
        folderName: slug,
        seed: dto.seed ?? null,
        gamemode: dto.gamemode ?? "survival",
        difficulty: dto.difficulty ?? "normal",
        status: "ready",
      });
      const saved = await this.worlds.save(world);

      const links = [
        ...packs.resource.map((pack) =>
          this.worldPacks.create({ worldId: saved.id, packId: pack.id, kind: "resource" }),
        ),
        ...packs.behavior.map((pack) =>
          this.worldPacks.create({ worldId: saved.id, packId: pack.id, kind: "behavior" }),
        ),
      ];
      if (links.length > 0) {
        await this.worldPacks.save(links);
      }

      return this.toDto(await this.get(saved.id));
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
  }

  async activate(id: string): Promise<WorldDto> {
    const world = await this.get(id);

    // Re-activating the live world must never overwrite its progress with the
    // (potentially older) library copy.
    if (world.status === "active") {
      try {
        await this.server.start();
      } catch (error) {
        this.logger.warn(`Could not start Bedrock: ${(error as Error).message}`);
      }
      return this.toDto(world);
    }

    const source = path.join(this.storage.worldsDir(), world.folderName);
    if (!(await pathExists(source))) {
      throw new ConflictException(`World folder "${world.folderName}" is missing on disk`);
    }

    const target = this.storage.activeWorldDir();
    const staging = path.join(path.dirname(target), `.activate-${Date.now()}`);
    await mkdir(path.dirname(target), { recursive: true });

    try {
      await this.server.stop();

      // Persist the outgoing world before its live directory is replaced.
      await this.syncActiveWorld();

      await rm(staging, { recursive: true, force: true });
      await cp(source, staging, { recursive: true, dereference: false });
      await rm(target, { recursive: true, force: true });
      await rename(staging, target);

      await this.worlds.update({ status: "active" }, { status: "ready" as WorldStatus });
      world.status = "active";
      await this.worlds.save(world);
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      try {
        await this.server.start();
      } catch (startError) {
        this.logger.warn(`Could not restart Bedrock: ${(startError as Error).message}`);
      }
      throw error;
    }

    try {
      await this.server.start();
    } catch (error) {
      this.logger.warn(`Could not start Bedrock after activation: ${(error as Error).message}`);
    }

    return this.toDto(await this.get(id));
  }

  /**
   * Deactivate the currently active world so it can be deleted or reconfigured.
   * The server is stopped, the live world is synced back into the library, and
   * the world's status is reverted to "ready".  The server is left stopped
   * because there is no active world to run.
   */
  async deactivate(id: string): Promise<void> {
    const world = await this.get(id);
    if (world.status !== "active") {
      throw new ConflictException(
        `World "${world.name}" is not active; only the active world can be deactivated`,
      );
    }

    let stopped = false;
    try {
      await this.server.stop().catch((error) => {
        this.logger.warn(`Could not stop Bedrock before deactivating: ${(error as Error).message}`);
      });
      stopped = true;
      await this.syncActiveWorld();
      await this.worlds.update({ id }, { status: "ready" });
      this.logger.log(`Deactivated world "${world.name}" — server left stopped`);
    } catch (error) {
      if (stopped) {
        await this.server.start().catch((startError) => {
          this.logger.warn(
            `Could not restart Bedrock after deactivation failure: ${(startError as Error).message}`,
          );
        });
      }
      throw error;
    }
  }

  async updatePacks(id: string, dto: UpdateWorldPacksDto): Promise<WorldDto> {
    const world = await this.get(id);
    const resourceIds = [...new Set(dto.resourcePackIds ?? [])];
    const behaviorIds = [...new Set(dto.behaviorPackIds ?? [])];
    const packs = await this.loadPacks(resourceIds, behaviorIds);
    const libraryDir = path.join(this.storage.worldsDir(), world.folderName);

    // Keep the library template ready for a future activation. An older
    // installation may only have the active copy, so recreate its folder.
    await mkdir(libraryDir, { recursive: true });
    await this.writePackFiles(libraryDir, packs.resource, packs.behavior);

    let stopped = false;
    try {
      if (world.status === "active") {
        await this.server.stop();
        stopped = true;
        await this.writePackFiles(this.storage.activeWorldDir(), packs.resource, packs.behavior);
      }

      await this.worldPacks.delete({ worldId: world.id });
      const links = [
        ...packs.resource.map((pack) =>
          this.worldPacks.create({ worldId: world.id, packId: pack.id, kind: "resource" }),
        ),
        ...packs.behavior.map((pack) =>
          this.worldPacks.create({ worldId: world.id, packId: pack.id, kind: "behavior" }),
        ),
      ];
      if (links.length > 0) {
        await this.worldPacks.save(links);
      }
      const size = await dirSize(
        world.status === "active" ? this.storage.activeWorldDir() : libraryDir,
      );
      world.sizeBytes = String(size);
      await this.worlds.save(world);
    } finally {
      if (stopped) {
        await this.server.start().catch((error) => {
          this.logger.error(
            `Could not restart Bedrock after updating packs: ${(error as Error).message}`,
          );
        });
      }
    }

    return this.toDto(await this.get(id));
  }

  /**
   * Copy the live Bedrock world back into its library folder. Call this after
   * stopping the server (or accepting a point-in-time snapshot while running)
   * so switching worlds or creating a backup does not lose progress.
   */
  async syncActiveWorld(): Promise<WorldEntity | null> {
    const active = await this.worlds.findOneBy({ status: "active" });
    if (!active) {
      return null;
    }

    const activeDir = this.storage.activeWorldDir();
    if (!(await pathExists(activeDir))) {
      return null;
    }

    const target = path.join(this.storage.worldsDir(), active.folderName);
    const staging = path.join(this.storage.worldsDir(), `.sync-${active.id}-${Date.now()}`);

    try {
      await cp(activeDir, staging, { recursive: true, dereference: false });
      await rm(target, { recursive: true, force: true });
      await rename(staging, target);

      const size = await dirSize(target);
      await this.worlds.update({ id: active.id }, { sizeBytes: String(size) });
      active.sizeBytes = String(size);
      this.logger.log(`Synced active world "${active.name}" to the library (${size} bytes)`);
      return active;
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      this.logger.error(
        `Could not sync active world "${active.name}": ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async clone(id: string): Promise<WorldDto> {
    const source = await this.get(id);
    const name = await this.uniqueName(`${source.name} Copy`);
    const slug = await this.uniqueSlug(slugify(name, "world-copy"));
    const sourceFolder = path.join(this.storage.worldsDir(), source.folderName);
    const targetFolder = path.join(this.storage.worldsDir(), slug);

    const cloningActive = source.status === "active";
    let stopped = false;
    try {
      if (cloningActive) {
        await this.server.stop();
        stopped = true;
        await this.syncActiveWorld();
      }

      await cp(sourceFolder, targetFolder, { recursive: true, dereference: false }).catch(
        async (error) => {
          this.logger.warn(`Source folder missing for clone: ${(error as Error).message}`);
          await mkdir(targetFolder, { recursive: true });
        },
      );
    } catch (error) {
      await rm(targetFolder, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    } finally {
      if (stopped) {
        await this.server.start().catch((error) => {
          this.logger.error(`Could not restart Bedrock after clone: ${(error as Error).message}`);
        });
      }
    }

    const clone = this.worlds.create({
      name,
      slug,
      folderName: slug,
      seed: source.seed,
      gamemode: source.gamemode,
      difficulty: source.difficulty,
      status: "ready",
    });
    const saved = await this.worlds.save(clone);

    const links = source.packs.map((link) =>
      this.worldPacks.create({ worldId: saved.id, packId: link.packId, kind: link.kind }),
    );
    if (links.length > 0) {
      await this.worldPacks.save(links);
    }

    return this.toDto(await this.get(saved.id));
  }

  async remove(id: string): Promise<void> {
    const world = await this.get(id);
    if (world.status === "active") {
      throw new ConflictException("Cannot delete the active world; activate another world first");
    }
    await this.worlds.delete({ id });
    await rm(path.join(this.storage.worldsDir(), world.folderName), {
      recursive: true,
      force: true,
    });
  }

  async refreshSize(id: string): Promise<string> {
    const world = await this.get(id);
    const dir =
      world.status === "active"
        ? this.storage.activeWorldDir()
        : path.join(this.storage.worldsDir(), world.folderName);
    const size = await dirSize(dir);
    await this.worlds.update({ id }, { sizeBytes: String(size) });
    return String(size);
  }

  async count(): Promise<number> {
    return this.worlds.count();
  }

  private async writePackFiles(
    folder: string,
    resource: PackEntity[],
    behavior: PackEntity[],
  ): Promise<void> {
    const serialize = (packs: PackEntity[]) =>
      packs.map((pack) => ({ pack_id: pack.packUuid, version: pack.versionArray }));

    await writeFile(
      path.join(folder, DEFAULT_PACK_FILES.resource),
      `${JSON.stringify(serialize(resource), null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(folder, DEFAULT_PACK_FILES.behavior),
      `${JSON.stringify(serialize(behavior), null, 2)}\n`,
      "utf8",
    );
  }

  private async loadPacks(
    resourceIds: string[],
    behaviorIds: string[],
  ): Promise<{ resource: PackEntity[]; behavior: PackEntity[] }> {
    const ids = [...new Set([...resourceIds, ...behaviorIds])];
    if (ids.length === 0) {
      return { resource: [], behavior: [] };
    }

    const found = await this.packs.find({ where: { id: In(ids) } });
    const byId = new Map(found.map((pack) => [pack.id, pack]));

    const resource = resourceIds.map((id) => {
      const pack = byId.get(id);
      if (!pack) {
        throw new BadRequestException(`Resource pack ${id} does not exist`);
      }
      if (pack.type !== "resource") {
        throw new BadRequestException(`Pack "${pack.name}" is not a resource pack`);
      }
      return pack;
    });

    const behavior = behaviorIds.map((id) => {
      const pack = byId.get(id);
      if (!pack) {
        throw new BadRequestException(`Behavior pack ${id} does not exist`);
      }
      if (pack.type !== "behavior") {
        throw new BadRequestException(`Pack "${pack.name}" is not a behavior pack`);
      }
      return pack;
    });

    return { resource, behavior };
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    while (await this.worlds.existsBy({ slug: candidate })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private async uniqueName(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    while (await this.worlds.existsBy({ name: candidate })) {
      candidate = `${base} ${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  toDto(world: WorldEntity): WorldDto {
    return {
      id: world.id,
      name: world.name,
      slug: world.slug,
      seed: world.seed,
      gamemode: world.gamemode,
      difficulty: world.difficulty,
      status: world.status,
      folderName: world.folderName,
      sizeBytes: String(world.sizeBytes ?? 0),
      packs: (world.packs ?? [])
        .filter((link) => link.pack)
        .map((link) => ({
          id: link.pack.id,
          name: link.pack.name,
          packUuid: link.pack.packUuid,
          version: link.pack.version,
          versionArray: link.pack.versionArray,
          type: link.pack.type,
        })),
      lastBackupAt: null,
      createdAt: world.createdAt.toISOString(),
      updatedAt: world.updatedAt.toISOString(),
    };
  }
}
