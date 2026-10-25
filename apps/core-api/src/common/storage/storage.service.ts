import { cp, mkdir, readdir, rename, rm, statfs } from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIRS } from "@mc/shared";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  readonly root: string;
  readonly dataRoot: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.root = path.resolve(config.get<string>("STORAGE_ROOT", "./storage"));
    this.dataRoot = path.resolve(config.get<string>("DATA_ROOT", "./data"));
  }

  async onModuleInit(): Promise<void> {
    await Promise.all(
      Object.values(STORAGE_DIRS).map((dir) =>
        mkdir(path.join(this.root, dir as string), { recursive: true }),
      ),
    );
    await mkdir(path.join(this.root, STORAGE_DIRS.metadata, "icons"), { recursive: true });
    await mkdir(path.join(this.root, STORAGE_DIRS.temp, "uploads"), { recursive: true });
    await mkdir(this.serverPacksDir("resource"), { recursive: true });
    await mkdir(this.serverPacksDir("behavior"), { recursive: true });
    this.logger.log(`Storage ready at ${this.root} (data root: ${this.dataRoot})`);
  }

  packsDir(type: "resource" | "behavior"): string {
    return path.join(
      this.root,
      type === "resource" ? STORAGE_DIRS.resourcePacks : STORAGE_DIRS.behaviorPacks,
    );
  }

  /** Folders Bedrock Dedicated Server actually loads. */
  serverPacksDir(type: "resource" | "behavior"): string {
    return path.join(
      this.dataRoot,
      type === "resource" ? STORAGE_DIRS.resourcePacks : STORAGE_DIRS.behaviorPacks,
    );
  }

  async occupiedPackFolders(type: "resource" | "behavior"): Promise<Set<string>> {
    const names = new Set<string>();
    for (const dir of [this.packsDir(type), this.serverPacksDir(type)]) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            names.add(entry.name);
          }
        }
      } catch {
        // Directory may not exist yet.
      }
    }
    return names;
  }

  async publishPack(type: "resource" | "behavior", folderName: string): Promise<void> {
    const source = this.safeJoin(this.packsDir(type), folderName);
    const destDir = this.serverPacksDir(type);
    const dest = this.safeJoin(destDir, folderName);
    await mkdir(destDir, { recursive: true });
    const staging = this.safeJoin(destDir, `.staging-${folderName}-${Date.now()}`);
    await rm(staging, { recursive: true, force: true });
    await cp(source, staging, { recursive: true, dereference: false });
    await rm(dest, { recursive: true, force: true });
    await rename(staging, dest);
    this.logger.log(`Published ${type} pack "${folderName}" to ${dest}`);
  }

  async unpublishPack(type: "resource" | "behavior", folderName: string): Promise<void> {
    if (!folderName || folderName.startsWith(".")) {
      return;
    }
    await rm(this.safeJoin(this.serverPacksDir(type), folderName), {
      recursive: true,
      force: true,
    });
  }

  worldsDir(): string {
    return path.join(this.root, STORAGE_DIRS.worlds);
  }

  backupsDir(): string {
    return path.join(this.root, STORAGE_DIRS.backups);
  }

  tempDir(): string {
    return path.join(this.root, STORAGE_DIRS.temp);
  }

  uploadsDir(): string {
    return path.join(this.root, STORAGE_DIRS.temp, "uploads");
  }

  iconsDir(): string {
    return path.join(this.root, STORAGE_DIRS.metadata, "icons");
  }

  activeWorldDir(): string {
    const levelName = this.config.get<string>("BEDROCK_LEVEL_NAME", "active");
    return path.join(this.dataRoot, "worlds", levelName);
  }

  serverPropertiesPath(): string {
    return path.join(this.dataRoot, "server.properties");
  }

  /** Bedrock Dedicated Server reads allowlist.json from the server root, not the world folder. */
  allowlistPath(): string {
    return path.join(this.dataRoot, "allowlist.json");
  }

  /** Join a user-controlled relative path and refuse to escape the base. */
  safeJoin(base: string, relative: string): string {
    const resolvedBase = path.resolve(base);
    const resolved = path.resolve(resolvedBase, relative);
    if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`)) {
      throw new Error(`Path escapes storage root: ${relative}`);
    }
    return resolved;
  }

  async diskUsage(): Promise<{ usedBytes: string; freeBytes: string }> {
    try {
      const stats = await statfs(this.root);
      const usedBytes = (stats.blocks - stats.bfree) * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      return { usedBytes: String(usedBytes), freeBytes: String(freeBytes) };
    } catch {
      return { usedBytes: "0", freeBytes: "0" };
    }
  }
}
