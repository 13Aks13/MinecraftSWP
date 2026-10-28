import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Tests create worlds, packs and server.properties, so they must never touch real data.
const root = path.join(tmpdir(), "mc-platform-test");
process.env.STORAGE_ROOT = path.join(root, "storage");
process.env.DATA_ROOT = path.join(root, "data");
mkdirSync(process.env.STORAGE_ROOT, { recursive: true });
mkdirSync(process.env.DATA_ROOT, { recursive: true });

// process.env wins over .env files in @nestjs/config, so these defaults also protect a
// developer's real database. CI and local runs override them through the environment.
process.env.DB_HOST ??= "localhost";
process.env.DB_PORT ??= "5432";
process.env.DB_USER ??= "mc";
process.env.DB_PASSWORD ??= "mc";
process.env.DB_NAME ??= "mc_platform_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-only-secret-at-least-32-characters-long";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.ADMIN_PASSWORD ??= "ChangeMe123!";
process.env.RUN_WORKER = "false";
