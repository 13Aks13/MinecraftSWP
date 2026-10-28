import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service.js";

const USER = {
  id: "u1",
  email: "admin@example.com",
  role: "admin" as const,
  isActive: true,
  passwordHash: "hashed-password",
  tokenVersion: 4,
};

const AUTH_USER = { id: USER.id, email: USER.email, role: USER.role };

function buildService() {
  const users = {
    findByEmailWithPassword: vi.fn(),
    findByIdWithPassword: vi.fn(),
    findById: vi.fn(),
    verifyPassword: vi.fn(),
    markLogin: vi.fn(),
    setPassword: vi.fn(),
  };
  const tokens = { issueAccessToken: vi.fn() };
  return {
    service: new AuthService(users as never, tokens as never),
    users,
    tokens,
  };
}

describe("AuthService", () => {
  it("issues a login token carrying the user's current token version", async () => {
    const { service, users, tokens } = buildService();
    users.findByEmailWithPassword.mockResolvedValue(USER);
    users.verifyPassword.mockResolvedValue(true);
    users.markLogin.mockResolvedValue(undefined);
    tokens.issueAccessToken.mockResolvedValue({ accessToken: "jwt", expiresIn: 3_600 });

    const session = await service.login({ email: USER.email, password: "correct-password" });

    expect(users.markLogin).toHaveBeenCalledWith(USER.id);
    expect(tokens.issueAccessToken).toHaveBeenCalledWith(AUTH_USER, USER.tokenVersion);
    expect(session).toEqual({
      accessToken: "jwt",
      expiresIn: 3_600,
      user: AUTH_USER,
    });
  });

  it("rejects invalid credentials without issuing a token", async () => {
    const { service, users, tokens } = buildService();
    users.findByEmailWithPassword.mockResolvedValue(USER);
    users.verifyPassword.mockResolvedValue(false);

    await expect(
      service.login({ email: USER.email, password: "wrong-password" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issueAccessToken).not.toHaveBeenCalled();
  });

  it("rejects a password change when the current password is wrong", async () => {
    const { service, users, tokens } = buildService();
    users.findByIdWithPassword.mockResolvedValue(USER);
    users.verifyPassword.mockResolvedValue(false);

    await expect(
      service.changePassword(AUTH_USER, {
        currentPassword: "wrong-password",
        newPassword: "new-correct-password",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.setPassword).not.toHaveBeenCalled();
    expect(tokens.issueAccessToken).not.toHaveBeenCalled();
  });

  it("issues a fresh token with the bumped version after a password change", async () => {
    const { service, users, tokens } = buildService();
    users.findByIdWithPassword.mockResolvedValue(USER);
    users.verifyPassword.mockResolvedValue(true);
    users.setPassword.mockResolvedValue(undefined);
    // setPassword() increments the version atomically; the next read sees it.
    users.findById.mockResolvedValue({ ...USER, tokenVersion: USER.tokenVersion + 1 });
    tokens.issueAccessToken.mockResolvedValue({ accessToken: "fresh-jwt", expiresIn: 3_600 });

    const session = await service.changePassword(AUTH_USER, {
      currentPassword: "correct-password",
      newPassword: "new-correct-password",
    });

    expect(users.setPassword).toHaveBeenCalledWith(USER.id, "new-correct-password");
    expect(tokens.issueAccessToken).toHaveBeenCalledWith(AUTH_USER, USER.tokenVersion + 1);
    expect(session).toEqual({
      accessToken: "fresh-jwt",
      expiresIn: 3_600,
      user: AUTH_USER,
    });
  });
});
