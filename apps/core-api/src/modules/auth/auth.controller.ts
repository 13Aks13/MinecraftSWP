import type { AuthUserDto, LoginResponseDto } from "@mc/shared";
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Public } from "../../common/decorators/public.decorator.js";
import { AuthService } from "./auth.service.js";
import type { AuthUser } from "./auth.types.js";
import { ChangePasswordDto } from "./dto/change-password.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { LoginThrottleService } from "./login-throttle.service.js";
import { clearAccessTokenCookie, setAccessTokenCookie } from "./session-cookie.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(LoginThrottleService) private readonly throttle: LoginThrottleService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Exchange credentials for a JWT" })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const ip = request.ip ?? "unknown";
    this.throttle.assertAllowed(ip, dto.email);

    let session: LoginResponseDto;
    try {
      session = await this.authService.login(dto);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.throttle.recordFailure(ip, dto.email);
      }
      throw error;
    }
    this.throttle.recordSuccess(ip, dto.email);

    setAccessTokenCookie(
      request,
      response,
      session.accessToken,
      session.expiresIn,
      this.isProduction(),
    );
    return session;
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Clear the browser session cookie" })
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): void {
    clearAccessTokenCookie(request, response, this.isProduction());
  }

  @Post("change-password")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change the password of the current user" })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(user, dto);
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Current authenticated user" })
  me(@CurrentUser() user: AuthUser): AuthUserDto {
    return user;
  }

  private isProduction(): boolean {
    return this.config.get<string>("NODE_ENV") === "production";
  }
}
