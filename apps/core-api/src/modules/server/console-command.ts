import { BadRequestException } from "@nestjs/common";

export const MAX_COMMAND_LENGTH = 1000;

/**
 * Console commands are written to the server as one line. Reject anything that could
 * smuggle a second command (line breaks) or is not a plain non-empty string.
 */
export function normalizeConsoleCommand(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new BadRequestException("command must be a string");
  }
  const command = raw.trim();
  if (command.length === 0) {
    throw new BadRequestException("command must not be empty");
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new BadRequestException(`command must be at most ${MAX_COMMAND_LENGTH} characters`);
  }
  if (/[\r\n\0]/.test(command)) {
    throw new BadRequestException("command must be a single line");
  }
  return command;
}
