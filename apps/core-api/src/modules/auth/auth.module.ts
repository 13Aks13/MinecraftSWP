import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions, type JwtSignOptions } from "@nestjs/jwt";
import { UsersModule } from "../users/users.module.js";
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from "./auth.constants.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { TokenService } from "./token.service.js";

@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          algorithm: JWT_ALGORITHM,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: (config.get<string>("JWT_EXPIRES_IN", "12h") ??
            "12h") as JwtSignOptions["expiresIn"],
        },
        verifyOptions: {
          algorithms: [JWT_ALGORITHM],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
