import type { AuthUserDto, LoginResponseDto } from "@mc/shared";
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Public } from "../../common/decorators/public.decorator.js";
import { AuthService } from "./auth.service.js";
import type { AuthUser } from "./auth.types.js";
import { LoginDto } from "./dto/login.dto.js";
import { clearAccessTokenCookie, setAccessTokenCookie } from "./session-cookie.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Exchange credentials for a JWT" })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const session = await this.authService.login(dto);
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
  @ApiOperation({ summary: "Clear the browser session cookie" })
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): void {
    clearAccessTokenCookie(request, response, this.isProduction());
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Current authenticated user" })
  me(@CurrentUser() user: AuthUser): AuthUserDto {
    return user;
  }

  private isProduction(): boolean {
    return this.config.get<string>("NODE_ENV") === "production";
  }
}
