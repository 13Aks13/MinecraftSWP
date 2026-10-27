import type { LoginResponseDto } from "@mc/shared";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { UsersService } from "../users/users.service.js";
import type { AuthUser } from "./auth.types.js";
import type { ChangePasswordDto } from "./dto/change-password.dto.js";
import type { LoginDto } from "./dto/login.dto.js";
import { TokenService } from "./token.service.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(TokenService) private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user?.isActive) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await this.usersService.verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.usersService.markLogin(user.id);

    const { accessToken, expiresIn } = await this.tokenService.issueAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      expiresIn,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto): Promise<void> {
    const account = await this.usersService.findByIdWithPassword(user.id);
    if (!account?.isActive) {
      throw new UnauthorizedException("Account is no longer active");
    }

    const valid = await this.usersService.verifyPassword(dto.currentPassword, account.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    await this.usersService.setPassword(user.id, dto.newPassword);
  }
}
