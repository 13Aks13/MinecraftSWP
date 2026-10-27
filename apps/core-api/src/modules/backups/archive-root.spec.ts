import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BadRequestException } from "@nestjs/common";
import { resolveArchiveRoot } from "./archive-root.js";

describe("resolveArchiveRoot", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mc-archive-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the root when world files are at the top level", async () => {
    await writeFile(path.join(dir, "level.dat"), "");
    await expect(resolveArchiveRoot(dir)).resolves.toBe(dir);
  });

  it("accepts an archive that only has the pack config files", async () => {
    await writeFile(path.join(dir, "world_behavior_packs.json"), "[]");
    await expect(resolveArchiveRoot(dir)).resolves.toBe(dir);
  });

  it("unwraps a single wrapper folder", async () => {
    const nested = path.join(dir, "My World");
    await mkdir(nested);
    await writeFile(path.join(nested, "level.dat"), "");
    await expect(resolveArchiveRoot(dir)).resolves.toBe(nested);
  });

  it("rejects an archive with several worlds", async () => {
    for (const name of ["world-a", "world-b"]) {
      await mkdir(path.join(dir, name));
      await writeFile(path.join(dir, name, "level.dat"), "");
    }
    await expect(resolveArchiveRoot(dir)).rejects.toThrow(/several worlds/);
  });

  it("rejects an archive that is not a world", async () => {
    await writeFile(path.join(dir, "readme.txt"), "hi");
    await expect(resolveArchiveRoot(dir)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a wrapper folder without world files", async () => {
    await mkdir(path.join(dir, "docs"));
    await writeFile(path.join(dir, "docs", "readme.txt"), "hi");
    await expect(resolveArchiveRoot(dir)).rejects.toBeInstanceOf(BadRequestException);
  });
});
