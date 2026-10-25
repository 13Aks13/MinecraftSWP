import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AllowListDto, AllowListEntry } from "@mc/shared";
import { Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StorageService } from "../../common/storage/storage.service.js";

interface RawAllowListEntry {
  ignoresPlayerLimit?: boolean;
  name: string;
  xuid?: string;
}

@Injectable()
export class AllowlistService implements OnModuleInit {
  private readonly logger = new Logger(AllowlistService.name);

  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.getAllowlist();
  }

  private getAllowlistPath(): string {
    return this.storage.allowlistPath();
  }

  async getAllowlist(): Promise<AllowListDto> {
    const entries = await this.readCanonicalEntries();
    if (entries.length > 0) {
      return this.toDto(entries);
    }

    const migrated = await this.readLegacyEntries();
    if (migrated.length > 0) {
      await this.saveAllowlist(migrated);
      this.logger.warn(
        `Migrated ${migrated.length} allowlist ${migrated.length === 1 ? "entry" : "entries"} from the world folder to ${this.getAllowlistPath()}`,
      );
      return this.toDto(migrated);
    }

    return { entries: [] };
  }

  async addEntry(entry: AllowListEntry): Promise<AllowListDto> {
    const allowlist = await this.getAllowlist();

    const exists = allowlist.entries.some(
      (e) =>
        e.name.toLowerCase() === entry.name.toLowerCase() || (entry.xuid && e.xuid === entry.xuid),
    );

    if (exists) {
      return allowlist;
    }

    allowlist.entries.push({ name: entry.name, xuid: this.normalizeXuid(entry.xuid) });
    await this.saveAllowlist(allowlist.entries);
    return allowlist;
  }

  async removeEntry(name: string): Promise<AllowListDto> {
    const allowlist = await this.getAllowlist();
    const filtered = allowlist.entries.filter((e) => e.name.toLowerCase() !== name.toLowerCase());

    if (filtered.length === allowlist.entries.length) {
      throw new NotFoundException(`Player "${name}" not found in allowlist`);
    }

    await this.saveAllowlist(filtered);
    return { entries: filtered };
  }

  async clear(): Promise<AllowListDto> {
    await this.saveAllowlist([]);
    return { entries: [] };
  }

  private async saveAllowlist(entries: AllowListEntry[]): Promise<void> {
    const filePath = this.getAllowlistPath();
    const payload: RawAllowListEntry[] = entries.map((entry) => {
      const xuid = this.normalizeXuid(entry.xuid);
      return {
        ignoresPlayerLimit: false,
        name: entry.name,
        ...(xuid ? { xuid } : {}),
      };
    });
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    this.logger.log(`Updated allowlist at ${filePath}`);
  }

  private async readCanonicalEntries(): Promise<AllowListEntry[]> {
    return this.readEntriesFromFile(this.getAllowlistPath());
  }

  private async readLegacyEntries(): Promise<AllowListEntry[]> {
    const candidates = new Set<string>();
    const levelName = this.config.get<string>("BEDROCK_LEVEL_NAME", "active");
    candidates.add(path.join(this.storage.dataRoot, "worlds", levelName, "allowlist.json"));

    const worldsDir = path.join(this.storage.dataRoot, "worlds");
    try {
      const worlds = await readdir(worldsDir, { withFileTypes: true });
      for (const world of worlds) {
        if (world.isDirectory()) {
          candidates.add(path.join(worldsDir, world.name, "allowlist.json"));
        }
      }
    } catch {
      // No worlds directory yet.
    }

    for (const filePath of candidates) {
      const entries = await this.readEntriesFromFile(filePath);
      if (entries.length > 0) {
        return entries;
      }
    }

    return [];
  }

  private async readEntriesFromFile(filePath: string): Promise<AllowListEntry[]> {
    try {
      const content = await readFile(filePath, "utf8");
      const parsed: unknown = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((entry): entry is RawAllowListEntry => {
          return (
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as RawAllowListEntry).name === "string" &&
            (entry as RawAllowListEntry).name.trim().length > 0
          );
        })
        .map((entry) => ({
          name: entry.name,
          xuid: this.normalizeXuid(entry.xuid),
        }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      if (error instanceof SyntaxError) {
        this.logger.warn(`Ignoring invalid allowlist JSON at ${filePath}`);
        return [];
      }
      this.logger.error(`Failed to read allowlist: ${(error as Error).message}`);
      throw error;
    }
  }

  private toDto(entries: AllowListEntry[]): AllowListDto {
    return {
      entries: entries.map((entry) => ({
        name: entry.name,
        ...(entry.xuid ? { xuid: entry.xuid } : {}),
      })),
    };
  }

  private normalizeXuid(xuid: string | undefined): string | undefined {
    const trimmed = xuid?.trim();
    return trimmed ? trimmed : undefined;
  }
}
