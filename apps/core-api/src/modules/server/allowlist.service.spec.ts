import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConfigService } from "@nestjs/config";
import { StorageService } from "../../common/storage/storage.service.js";
import { AllowlistService } from "./allowlist.service.js";

describe("AllowlistService", () => {
  let dataRoot: string;
  let service: AllowlistService;

  beforeEach(async () => {
  afterEach(async () => {
    if (dataRoot) {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
    const storage = {
      dataRoot,
      allowlistPath: () => path.join(dataRoot, "allowlist.json"),
    } as StorageService;
    const config = {
      get: (_key: string, fallback?: string) => fallback,
    } as ConfigService;
    service = new AllowlistService(storage, config);
  });

  it("writes players to the Bedrock server-root allowlist.json", async () => {
    await service.addEntry({ name: "Steve" });

    const raw = JSON.parse(
      await readFile(path.join(dataRoot, "allowlist.json"), "utf8"),
    ) as unknown;
    expect(raw).toEqual([{ ignoresPlayerLimit: false, name: "Steve" }]);
  });

  it("migrates entries from the world folder when the root file is empty", async () => {
    await writeFile(path.join(dataRoot, "allowlist.json"), "[]\n", "utf8");
    await mkdir(path.join(dataRoot, "worlds", "Experiment"), { recursive: true });
    await writeFile(
      path.join(dataRoot, "worlds", "Experiment", "allowlist.json"),
      JSON.stringify([{ name: "PapaAks13", xuid: "" }]),
      "utf8",
    );

    const result = await service.getAllowlist();

    expect(result.entries).toEqual([{ name: "PapaAks13" }]);
    const raw = JSON.parse(
      await readFile(path.join(dataRoot, "allowlist.json"), "utf8"),
    ) as unknown;
    expect(raw).toEqual([{ ignoresPlayerLimit: false, name: "PapaAks13" }]);
  });
});
