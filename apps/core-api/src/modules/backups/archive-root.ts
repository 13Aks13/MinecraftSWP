import { readdir } from "node:fs/promises";
import path from "node:path";
import { BadRequestException } from "@nestjs/common";

const WORLD_MARKERS = new Set([
  "level.dat",
  "db",
  "world_behavior_packs.json",
  "world_resource_packs.json",
]);

/**
 * Returns the directory that actually holds the world files. Archives made by
 * "Create backup" keep them at the root; an archive wrapped in a single folder is
 * unwrapped. Archives with several worlds (backup of all worlds) are rejected
 * because they cannot be restored into one world.
 */
export async function resolveArchiveRoot(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  if (entries.some((entry) => WORLD_MARKERS.has(entry.name))) {
    return dir;
  }

  const folders = entries.filter((entry) => entry.isDirectory());
  if (folders.length > 1) {
    throw new BadRequestException(
      "This archive contains several worlds (a backup of all worlds) and cannot be restored into a single world",
    );
  }
  if (folders.length === 1 && entries.length === 1) {
    const nestedDir = path.join(dir, folders[0].name);
    const nested = await readdir(nestedDir);
    if (nested.some((name) => WORLD_MARKERS.has(name))) {
      return nestedDir;
    }
  }
  throw new BadRequestException("Archive does not look like a Bedrock world");
}
