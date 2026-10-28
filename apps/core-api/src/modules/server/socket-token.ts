import { ACCESS_TOKEN_COOKIE } from "../auth/auth.constants.js";
import { readCookie } from "../auth/cookies.js";

export interface SocketHandshakeLike {
  auth?: Record<string, unknown>;
  headers: { authorization?: string; cookie?: string };
}

/**
 * Token sources, in order: handshake `auth.token`, `Authorization: Bearer`, the HttpOnly
 * session cookie. The URL query string is deliberately not a source: proxies and access
 * logs record URLs, so a token there would leak.
 */
export function extractSocketToken(handshake: SocketHandshakeLike): string | null {
  const authToken = handshake.auth?.token;
  if (typeof authToken === "string" && authToken.length > 0) {
    return authToken;
  }

  const header = handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token.length > 0) {
      return token;
    }
  }

  return readCookie(handshake.headers.cookie, ACCESS_TOKEN_COOKIE);
}
