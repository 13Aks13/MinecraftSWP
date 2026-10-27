import { Module } from "@nestjs/common";
import { ServerModule } from "../server/server.module.js";
import { ServerPropertiesPipe } from "./pipes/server-properties.pipe.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";

@Module({
  imports: [ServerModule],
  controllers: [SettingsController],
  providers: [SettingsService, ServerPropertiesPipe],
})
export class SettingsModule {}
