import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

const USER = { id: "u1", email: "a@example.com", role: "admin", isActive: true, tokenVersion: 0 };

function context(): ExecutionContext {
  const request = { headers: { authorization: "Bearer token" }, user: undefined };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard(tv: number | undefined, user: Record<string, unknown> | null) {
  const tokens = {
    verifyAccessToken: vi
      .fn()
      .mockResolvedValue({ sub: "u1", email: USER.email, role: "admin", tv }),
  };
  const users = { findById: vi.fn().mockResolvedValue(user) };
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
  return new JwtAuthGuard(tokens as never, users as never, reflector as unknown as Reflector);
}

describe("JwtAuthGuard token version", () => {
  it("accepts a token whose version matches", async () => {
    const guard = buildGuard(3, { ...USER, tokenVersion: 3 });
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it("accepts a legacy token without tv while the version is still 0", async () => {
    const guard = buildGuard(undefined, USER);
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it("rejects a token issued before a password change", async () => {
    const guard = buildGuard(0, { ...USER, tokenVersion: 1 });
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a legacy token once the version has been bumped", async () => {
    const guard = buildGuard(undefined, { ...USER, tokenVersion: 1 });
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an inactive user", async () => {
    const guard = buildGuard(0, { ...USER, isActive: false });
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
