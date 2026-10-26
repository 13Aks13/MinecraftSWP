import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AllowlistService } from "./allowlist.service.js";
import { DockerService } from "./docker.service.js";
import { LogsGateway } from "./logs.gateway.js";
import { ServerController } from "./server.controller.js";
import { ServerService } from "./server.service.js";

@Module({
  controllers: [ServerController],
  providers: [DockerService, ServerService, JwtService, LogsGateway, AllowlistService],
  exports: [DockerService, ServerService, JwtService, AllowlistService],
})
export class ServerModule {}
