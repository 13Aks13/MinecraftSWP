import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StorageService } from "../../common/storage/storage.service.js";
import { SettingsService } from "./settings.service.js";

describe("SettingsService", () => {
  it("keeps unknown properties and forces transport=nethernet", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "mc-settings-"));
    const propertiesPath = path.join(dataRoot, "server.properties");
    await writeFile(
      propertiesPath,
      ["server-name=Test", "allow-list=true", "level-name=active", "custom-flag=keep-me"].join(
        "\n",
      ),
      "utf8",
    );

    const storage = {
      serverPropertiesPath: () => propertiesPath,
    } as StorageService;
    const service = new SettingsService(storage);
    await service.onModuleInit();
    await service.update({ "max-players": "12" });

    const text = await readFile(propertiesPath, "utf8");
    expect(text).toContain("transport=nethernet");
    expect(text).toContain("custom-flag=keep-me");
    expect(text).toContain("level-name=active");
    expect(text).toContain("max-players=12");
  });
});
