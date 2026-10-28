import type { AllowListDto, DashboardDto, ServerStatsDto, ServerStatusDto } from "@mc/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { AllowlistService } from "./allowlist.service.js";
import { AllowListEntryDto, AllowListNameParamDto } from "./dto/allowlist.dto.js";
import { LogsQueryDto } from "./dto/logs-query.dto.js";
import { SendCommandDto } from "./dto/send-command.dto.js";
import { ServerService } from "./server.service.js";

@ApiTags("server")
@ApiBearerAuth()
@Controller("server")
export class ServerController {
  constructor(
    @Inject(ServerService) private readonly server: ServerService,
    @Inject(AllowlistService) private readonly allowlist: AllowlistService,
  ) {}

  @Get("status")
  status(): Promise<ServerStatusDto> {
    return this.server.status();
  }

  @Get("stats")
  stats(): Promise<ServerStatsDto> {
    return this.server.stats();
  }

  @Get("dashboard")
  dashboard(): Promise<DashboardDto> {
    return this.server.dashboard();
  }

  @Post("start")
  @HttpCode(202)
  @Roles("admin", "moderator")
  start(): Promise<void> {
    return this.server.start();
  }

  @Post("stop")
  @HttpCode(202)
  @Roles("admin", "moderator")
  stop(): Promise<void> {
    return this.server.stop();
  }

  @Post("restart")
  @HttpCode(202)
  @Roles("admin", "moderator")
  restart(): Promise<void> {
    return this.server.restart();
  }

  @Post("command")
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Send a command to the Bedrock console" })
  command(@Body() dto: SendCommandDto): Promise<{ output: string }> {
    return this.server.sendCommand(dto.command).then((output) => ({ output }));
  }

  @Get("logs")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async logs(@Query() query: LogsQueryDto): Promise<string> {
    return this.server.logsText(query.tail);
  }

  @Get("allowlist")
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Get the current allowlist" })
  async getAllowlist(): Promise<AllowListDto> {
    return this.allowlist.getAllowlist();
  }

  @Post("allowlist")
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Add a player to the allowlist" })
  async addToAllowlist(@Body() entry: AllowListEntryDto): Promise<AllowListDto> {
    return this.allowlist.addEntry(entry);
  }

  @Delete("allowlist/:name")
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Remove a player from the allowlist" })
  async removeFromAllowlist(@Param() params: AllowListNameParamDto): Promise<AllowListDto> {
    return this.allowlist.removeEntry(params.name);
  }

  @Delete("allowlist")
  @Roles("admin", "moderator")
  @HttpCode(204)
  @ApiOperation({ summary: "Clear the entire allowlist" })
  async clearAllowlist(): Promise<void> {
    await this.allowlist.clear();
  }
}
