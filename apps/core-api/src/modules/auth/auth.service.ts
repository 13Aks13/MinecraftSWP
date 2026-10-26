import type { LoginResponseDto } from "@mc/shared";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { UsersService } from "../users/users.service.js";
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
}
