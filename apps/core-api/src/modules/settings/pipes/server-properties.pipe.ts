import { SERVER_PROPERTY_ALLOWLIST } from "@mc/shared";
import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";

const MAX_VALUE_LENGTH = 255;

const ALLOWED = new Set<string>(SERVER_PROPERTY_ALLOWLIST);

/**
 * Turns a JSON body of server.properties updates into the `Record<string, string>`
 * that SettingsService expects: keys must be allow-listed and values must be
 * scalars, so a nested object can never be written into server.properties.
 */
@Injectable()
export class ServerPropertiesPipe implements PipeTransform<unknown, Record<string, string>> {
  transform(value: unknown): Record<string, string> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new BadRequestException("Request body must be an object of server.properties values");
    }

    const updates: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (!ALLOWED.has(key)) {
        throw new BadRequestException(`Property "${key}" is not editable`);
      }
      if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") {
        throw new BadRequestException(`Property "${key}" must be a string, number or boolean`);
      }

      const text = String(raw);
      if (text.length > MAX_VALUE_LENGTH) {
        throw new BadRequestException(
          `Property "${key}" must not be longer than ${MAX_VALUE_LENGTH} characters`,
        );
      }
      updates[key] = text;
    }

    return updates;
  }
}
