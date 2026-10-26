import type { CookieOptions, Request, Response } from "express";
import { ACCESS_TOKEN_COOKIE } from "./auth.constants.js";

function isSecure(request: Request, production: boolean): boolean {
  return production || request.secure || request.headers["x-forwarded-proto"] === "https";
}

function cookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  };
}

export function setAccessTokenCookie(
  request: Request,
  response: Response,
  token: string,
  expiresInSeconds: number,
  production: boolean,
): void {
  response.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...cookieOptions(isSecure(request, production)),
    maxAge: expiresInSeconds * 1_000,
  });
}

export function clearAccessTokenCookie(
  request: Request,
  response: Response,
  production: boolean,
): void {
  response.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions(isSecure(request, production)));
}
