import { BadRequestException } from "@nestjs/common";
import { MAX_COMMAND_LENGTH, normalizeConsoleCommand } from "./console-command.js";

describe("normalizeConsoleCommand", () => {
  it("trims and returns a valid command", () => {
    expect(normalizeConsoleCommand("  list  ")).toBe("list");
  });

  it.each([undefined, null, 5, {}, ["list"]])("rejects a non-string: %p", (value) => {
    expect(() => normalizeConsoleCommand(value)).toThrow(BadRequestException);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(() => normalizeConsoleCommand("")).toThrow(/must not be empty/);
    expect(() => normalizeConsoleCommand("   ")).toThrow(/must not be empty/);
  });

  it("rejects line breaks and NUL so a second command cannot be injected", () => {
    expect(() => normalizeConsoleCommand("list\nstop")).toThrow(/single line/);
    expect(() => normalizeConsoleCommand("list\rstop")).toThrow(/single line/);
    expect(() => normalizeConsoleCommand("li\0st")).toThrow(/single line/);
  });

  it("rejects over-long input", () => {
    expect(() => normalizeConsoleCommand("a".repeat(MAX_COMMAND_LENGTH + 1))).toThrow(/at most/);
    expect(normalizeConsoleCommand("a".repeat(MAX_COMMAND_LENGTH))).toHaveLength(
      MAX_COMMAND_LENGTH,
    );
  });
});
