import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DeletePacksQueryDto } from "../../packs/dto/delete-query.dto.js";
import { AllowListNameParamDto } from "./allowlist.dto.js";
import { LogsQueryDto } from "./logs-query.dto.js";
import { SendCommandDto } from "./send-command.dto.js";

async function check<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, errors };
}

describe("SendCommandDto", () => {
  it("accepts and trims a command", async () => {
    const { instance, errors } = await check(SendCommandDto, { command: "  list " });
    expect(errors).toHaveLength(0);
    expect(instance.command).toBe("list");
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["two lines", "list\nstop"],
    ["carriage return", "list\rstop"],
    ["too long", "a".repeat(1001)],
    ["not a string", 5],
  ])("rejects %s", async (_name, command) => {
    const { errors } = await check(SendCommandDto, { command });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects unknown properties", async () => {
    const { errors } = await check(SendCommandDto, { command: "list", extra: 1 });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("LogsQueryDto", () => {
  it("defaults to 500 lines", async () => {
    const { instance, errors } = await check(LogsQueryDto, {});
    expect(errors).toHaveLength(0);
    expect(instance.tail).toBe(500);
  });

  it("converts a numeric string", async () => {
    const { instance, errors } = await check(LogsQueryDto, { tail: "2000" });
    expect(errors).toHaveLength(0);
    expect(instance.tail).toBe(2000);
  });

  it.each(["0", "10001", "abc", "1.5"])("rejects tail=%s", async (tail) => {
    const { errors } = await check(LogsQueryDto, { tail });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("AllowListNameParamDto", () => {
  it("accepts a normal name", async () => {
    const { errors } = await check(AllowListNameParamDto, { name: "Steve_01" });
    expect(errors).toHaveLength(0);
  });

  it.each(["", "a/b", "x".repeat(33)])("rejects %p", async (name) => {
    const { errors } = await check(AllowListNameParamDto, { name });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("DeletePacksQueryDto", () => {
  it("accepts valid flags and type", async () => {
    const { errors } = await check(DeletePacksQueryDto, {
      type: "resource",
      all: "true",
      force: "false",
    });
    expect(errors).toHaveLength(0);
  });

  it("accepts an empty query", async () => {
    const { errors } = await check(DeletePacksQueryDto, {});
    expect(errors).toHaveLength(0);
  });

  it.each([{ all: "yes" }, { force: "1" }, { type: "world" }])(
    "rejects invalid flags and type: %p",
    async (query) => {
      const { errors } = await check(DeletePacksQueryDto, query);
      expect(errors.length).toBeGreaterThan(0);
    },
  );
});
