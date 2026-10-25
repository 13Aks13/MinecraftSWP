import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConfigService } from "@nestjs/config";
import { StorageService } from "./storage.service.js";

describe("StorageService pack publish", () => {
  async function createStorage(): Promise<{
    storage: StorageService;
    storageRoot: string;
    dataRoot: string;
  }> {
    const root = await mkdtemp(path.join(tmpdir(), "mc-packs-"));
    const storageRoot = path.join(root, "storage");
    const dataRoot = path.join(root, "data");
    await mkdir(path.join(storageRoot, "resource_packs"), { recursive: true });
    await mkdir(path.join(dataRoot, "resource_packs", "vanilla"), { recursive: true });
    const storage = new StorageService({
      get: (key: string, fallback?: string) => {
        if (key === "STORAGE_ROOT") {
          return storageRoot;
        }
        if (key === "DATA_ROOT") {
          return dataRoot;
        }
        return fallback;
      },
    } as ConfigService);
    return { storage, storageRoot, dataRoot };
  }

  it("copies imported packs into the Bedrock resource_packs folder", async () => {
    const { storage, storageRoot, dataRoot } = await createStorage();
    const libraryDir = path.join(storageRoot, "resource_packs", "better-trees");
    await mkdir(libraryDir, { recursive: true });
    await writeFile(path.join(libraryDir, "manifest.json"), '{"header":{"name":"Better Trees"}}');

    await storage.publishPack("resource", "better-trees");

    const published = path.join(dataRoot, "resource_packs", "better-trees", "manifest.json");
    expect(await readFile(published, "utf8")).toContain("Better Trees");
  });

  it("does not reuse vanilla Bedrock folder names", async () => {
    const { storage } = await createStorage();
    const occupied = await storage.occupiedPackFolders("resource");
    expect(occupied.has("vanilla")).toBe(true);
  });
});
