import { readFile, writeFile } from "node:fs/promises";
import { SERVER_PROPERTY_ALLOWLIST, type ServerPropertyDto } from "@mc/shared";
import { BadRequestException, Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { StorageService } from "../../common/storage/storage.service.js";
import { pathExists } from "../../common/utils/fs.utils.js";

interface PropertyMeta extends Omit<ServerPropertyDto, "value"> {
  default: string;
}

const META: Record<string, PropertyMeta> = {
  "server-name": {
    key: "server-name",
    label: "Server name",
    type: "string",
    default: "Minecraft Bedrock",
  },
  gamemode: {
    key: "gamemode",
    label: "Game mode",
    type: "enum",
    options: ["survival", "creative", "adventure"],
    default: "survival",
  },
  difficulty: {
    key: "difficulty",
    label: "Difficulty",
    type: "enum",
    options: ["peaceful", "easy", "normal", "hard"],
    default: "normal",
  },
  "max-players": { key: "max-players", label: "Max players", type: "number", default: "10" },
  "allow-cheats": { key: "allow-cheats", label: "Allow cheats", type: "boolean", default: "false" },
  "online-mode": {
    key: "online-mode",
    label: "Xbox Live authentication",
    type: "boolean",
    default: "true",
  },
  "allow-list": { key: "allow-list", label: "Use allow list", type: "boolean", default: "false" },
  "view-distance": { key: "view-distance", label: "View distance", type: "number", default: "10" },
  "tick-distance": { key: "tick-distance", label: "Tick distance", type: "number", default: "4" },
  "player-idle-timeout": {
    key: "player-idle-timeout",
    label: "Idle timeout (min)",
    type: "number",
    default: "30",
  },
  "level-seed": { key: "level-seed", label: "Level seed", type: "string", default: "" },
  "default-player-permission-level": {
    key: "default-player-permission-level",
    label: "Default permission",
    type: "enum",
    options: ["visitor", "member", "operator"],
    default: "member",
  },
  "texturepack-required": {
    key: "texturepack-required",
    label: "Require texture packs",
    type: "boolean",
    default: "false",
  },
  "content-log-file-enabled": {
    key: "content-log-file-enabled",
    label: "Content log file",
    type: "boolean",
    default: "false",
  },
  "compression-threshold": {
    key: "compression-threshold",
    label: "Compression threshold",
    type: "number",
    default: "1",
  },
  "server-port": {
    key: "server-port",
    label: "IPv4 port",
    type: "number",
    default: "19132",
  },
  "server-portv6": {
    key: "server-portv6",
    label: "IPv6 port",
    type: "number",
    default: "19133",
  },
  "enable-lan-visibility": {
    key: "enable-lan-visibility",
    label: "LAN visibility",
    type: "boolean",
    default: "true",
  },
  "beta-apis": {
    key: "beta-apis",
    label: "Enable Beta APIs experiment",
    type: "boolean",
    default: "false",
  },
};

const REQUIRED_PROPERTIES: Record<string, string> = {
  transport: "nethernet",
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache: Record<string, string> = {};

  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  async onModuleInit(): Promise<void> {
    this.cache = await this.read();
    if (this.needsRequiredProperties()) {
      await this.persist();
    }
  }

  async list(): Promise<ServerPropertyDto[]> {
    const values = await this.read();
    return SERVER_PROPERTY_ALLOWLIST.map((key: (typeof SERVER_PROPERTY_ALLOWLIST)[number]) => {
      const meta = META[key];
      return {
        key,
        label: meta?.label ?? key,
        type: meta?.type ?? "string",
        options: meta?.options,
        readOnly: meta?.readOnly,
        value: values[key] ?? meta?.default ?? "",
      };
    });
  }

  async update(updates: Record<string, string>): Promise<ServerPropertyDto[]> {
    const allowed = new Set<string>(SERVER_PROPERTY_ALLOWLIST);

    for (const [key, rawValue] of Object.entries(updates)) {
      if (!allowed.has(key)) {
        throw new BadRequestException(`Property "${key}" is not editable`);
      }
      const meta = META[key];
      if (meta?.readOnly) {
        throw new BadRequestException(`Property "${key}" is read-only`);
      }

      const value = String(rawValue).trim();
      if (value.includes("\n") || value.includes("\r")) {
        throw new BadRequestException(`Property "${key}" contains an invalid newline`);
      }
      if (meta?.type === "boolean" && !["true", "false"].includes(value)) {
        throw new BadRequestException(`Property "${key}" must be true or false`);
      }
      if (meta?.type === "number" && (!/^\d+$/.test(value) || Number(value) > 100_000)) {
        throw new BadRequestException(`Property "${key}" must be a non-negative integer`);
      }
      if (meta?.type === "enum" && meta.options && !meta.options.includes(value)) {
        throw new BadRequestException(
          `Property "${key}" must be one of: ${meta.options.join(", ")}`,
        );
      }
      this.cache[key] = value;
    }

    await this.persist();
    return this.list();
  }

  private async read(): Promise<Record<string, string>> {
    const file = this.storage.serverPropertiesPath();
    if (!(await pathExists(file))) {
      return {};
    }
    const text = await readFile(file, "utf8");
    const values: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      if (index <= 0) {
        continue;
      }
      values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1);
    }
    return values;
  }

  private needsRequiredProperties(): boolean {
    return Object.entries(REQUIRED_PROPERTIES).some(([key, value]) => this.cache[key] !== value);
  }

  private async persist(): Promise<void> {
    const onDisk = await this.read();
    this.cache = { ...onDisk, ...this.cache, ...REQUIRED_PROPERTIES };
    const lines = [
      "# Managed by the Minecraft Platform API. Manual edits may be overwritten.",
      ...Object.keys(this.cache)
        .sort()
        .map((key) => `${key}=${this.cache[key]}`),
    ];
    await writeFile(this.storage.serverPropertiesPath(), `${lines.join("\n")}\n`, "utf8");
    this.logger.log(`Updated ${this.storage.serverPropertiesPath()}`);
  }
}
