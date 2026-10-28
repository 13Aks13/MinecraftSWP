import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ACCESS_TOKEN_COOKIE } from "../../modules/auth/auth.constants.js";
import type { AuthUser, JwtPayload } from "../../modules/auth/auth.types.js";
import { readCookie } from "../../modules/auth/cookies.js";
import { TokenService } from "../../modules/auth/token.service.js";
import { UsersService } from "../../modules/users/users.service.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException("Missing authentication token");
    }

    let payload: JwtPayload;
    try {
      payload = await this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    if (!payload?.sub) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    // Re-read the user so deactivated accounts and role changes take effect
    // immediately instead of waiting for the token to expire.
    const user = await this.usersService.findById(payload.sub);
    // A password change bumps tokenVersion, which revokes older tokens.
    if (!user?.isActive || (payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    return true;
  }

  private extractToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length).trim();
      if (token.length > 0) {
        return token;
      }
    }

    return readCookie(request.headers.cookie, ACCESS_TOKEN_COOKIE);
  }
}
