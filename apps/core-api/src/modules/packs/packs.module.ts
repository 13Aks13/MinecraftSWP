import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServerModule } from "../server/server.module.js";
import { WorldEntity } from "../worlds/entities/world.entity.js";
import { WorldPackEntity } from "../worlds/entities/world-pack.entity.js";
import { ImportJobEntity } from "./entities/import-job.entity.js";
import { PackEntity } from "./entities/pack.entity.js";
import { PacksController } from "./packs.controller.js";
import { PacksService } from "./packs.service.js";
import { ImportJobService } from "./services/import-job.service.js";
import { ImportQueueService } from "./services/import-queue.service.js";
import { ImportWorkerService } from "./services/import-worker.service.js";
import { ManifestService } from "./services/manifest.service.js";
import { PackImportService } from "./services/pack-import.service.js";
import { ZipExtractorService } from "./services/zip-extractor.service.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([PackEntity, WorldPackEntity, WorldEntity, ImportJobEntity]),
    ServerModule,
  ],
  controllers: [PacksController],
  providers: [
    PacksService,
    PackImportService,
    ManifestService,
    ZipExtractorService,
    ImportJobService,
    ImportQueueService,
    ImportWorkerService,
  ],
  exports: [PacksService, TypeOrmModule],
})
export class PacksModule {}
