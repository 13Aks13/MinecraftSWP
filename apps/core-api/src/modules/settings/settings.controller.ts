import type { ServerPropertyDto } from "@mc/shared";
import { Body, Controller, Get, Inject, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { ServerService } from "../server/server.service.js";
import { ServerPropertiesPipe } from "./pipes/server-properties.pipe.js";
import { SettingsService } from "./settings.service.js";

@ApiTags("settings")
@ApiBearerAuth()
@Controller("settings")
export class SettingsController {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(ServerService) private readonly server: ServerService,
  ) {}

  @Get("server-properties")
  list(): Promise<ServerPropertyDto[]> {
    return this.settings.list();
  }

  @Put("server-properties")
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Update allow-listed server.properties values (restart required)" })
  update(
    @Body(ServerPropertiesPipe) updates: Record<string, string>,
  ): Promise<ServerPropertyDto[]> {
    return this.settings.update(updates);
  }

  @Post("apply")
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Restart Bedrock to apply pending settings" })
  async apply(): Promise<{ restarted: true }> {
    await this.server.restart();
    return { restarted: true };
  }
}
