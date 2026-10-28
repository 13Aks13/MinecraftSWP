import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthUser, JwtPayload } from "./auth.types.js";

const DEFAULT_EXPIRES_IN_SECONDS = 43_200;
const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 };

/**
 * Single source of truth for issuing and verifying access tokens.
 * Both the HTTP guard and the websocket gateway use this service so the
 * signing and verification options can never drift apart.
 */
@Injectable()
export class TokenService {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async issueAccessToken(
    user: AuthUser,
    tokenVersion: number,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: tokenVersion,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, expiresIn: this.expiresInSeconds };
  }

  verifyAccessToken(token: string): Promise<JwtPayload> {
    // Algorithm, issuer and audience are enforced by the JwtModule options.
    return this.jwtService.verifyAsync<JwtPayload>(token);
  }

  private get expiresInSeconds(): number {
    const raw = this.config.get<string>("JWT_EXPIRES_IN", "12h");
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (!match) {
      return DEFAULT_EXPIRES_IN_SECONDS;
    }
    return Number(match[1]) * (UNIT_SECONDS[match[2]] ?? 1);
  }
}
