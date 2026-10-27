import { BadRequestException } from "@nestjs/common";
import { ServerPropertiesPipe } from "./server-properties.pipe.js";

describe("ServerPropertiesPipe", () => {
  const pipe = new ServerPropertiesPipe();

  it("accepts allow-listed keys and stringifies scalars", () => {
    expect(
      pipe.transform({ "max-players": 12, "allow-cheats": true, gamemode: "creative" }),
    ).toEqual({
      "max-players": "12",
      "allow-cheats": "true",
      gamemode: "creative",
    });
  });

  it.each([null, undefined, "text", 5, ["gamemode"]])("rejects a non-object body: %p", (body) => {
    expect(() => pipe.transform(body)).toThrow(BadRequestException);
  });

  it("rejects keys that are not allow-listed", () => {
    expect(() => pipe.transform({ "level-name": "hacked" })).toThrow(/not editable/);
  });

  it("rejects non-scalar values", () => {
    expect(() => pipe.transform({ gamemode: { nested: true } })).toThrow(
      /string, number or boolean/,
    );
    expect(() => pipe.transform({ gamemode: null })).toThrow(BadRequestException);
  });

  it("rejects values longer than 255 characters", () => {
    expect(() => pipe.transform({ "server-name": "a".repeat(256) })).toThrow(/longer than 255/);
  });
});
