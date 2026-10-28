import type { DataSourceOptions } from "typeorm";
import { envFlag } from "../config/env.js";
import { BackupEntity } from "../modules/backups/entities/backup.entity.js";
import { ImportJobEntity } from "../modules/packs/entities/import-job.entity.js";
import { PackEntity } from "../modules/packs/entities/pack.entity.js";
import { UserEntity } from "../modules/users/entities/user.entity.js";
import { WorldEntity } from "../modules/worlds/entities/world.entity.js";
import { WorldPackEntity } from "../modules/worlds/entities/world-pack.entity.js";
import { InitialSchema1760000000000 } from "./migrations/1760000000000-InitialSchema.js";
import { AddImportJobsTable1760000000001 } from "./migrations/1760000000001-AddImportJobsTable.js";
import { FixImportJobsStatusConstraint1760000000002 } from "./migrations/1760000000002-FixImportJobsStatusConstraint.js";
import { AddUserTokenVersion1760000000003 } from "./migrations/1760000000003-AddUserTokenVersion.js";

export const ENTITIES = [
  UserEntity,
  PackEntity,
  WorldEntity,
  WorldPackEntity,
  BackupEntity,
  ImportJobEntity,
];

export function buildDataSourceOptions(
  get: (key: string) => string | undefined,
): DataSourceOptions {
  return {
    type: "postgres",
    host: get("DB_HOST") ?? "localhost",
    port: Number(get("DB_PORT") ?? 5432),
    username: get("DB_USER") ?? "mc",
    password: get("DB_PASSWORD") ?? "mc",
    database: get("DB_NAME") ?? "mc_platform",
    ssl: envFlag(get("DB_SSL")) ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    migrations: [
      InitialSchema1760000000000,
      AddImportJobsTable1760000000001,
      FixImportJobsStatusConstraint1760000000002,
      AddUserTokenVersion1760000000003,
    ],
    migrationsRun: false,
    synchronize: false,
    logging: envFlag(get("DB_LOGGING")),
    extra: {
      max: 15,
      connectionTimeoutMillis: 10_000,
    },
  };
}
