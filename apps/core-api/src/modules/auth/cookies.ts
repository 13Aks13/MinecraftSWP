/**
 * Minimal cookie reader for the access-token cookie. We do not depend on
 * cookie-parser for a single, well-known cookie.
 */
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key === name) {
      const value = part.slice(separator + 1).trim();
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }

  return null;
}
