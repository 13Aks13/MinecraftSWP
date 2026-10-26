const DEFAULT_JWT_SECRET = "replace-with-at-least-32-random-characters";

export interface RawEnv {
  [key: string]: string | undefined;
}

/**
 * Fail fast on unsafe configuration. Called by ConfigModule before any module
 * is instantiated, so a broken deployment never starts half-configured.
 */
export function validateEnv(env: RawEnv): RawEnv {
  const nodeEnv = env.NODE_ENV ?? "development";
  const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const secret = env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  if (secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  if (nodeEnv === "production" && secret === DEFAULT_JWT_SECRET) {
    throw new Error("JWT_SECRET must be changed before running in production");
  }

  const expiresIn = env.JWT_EXPIRES_IN ?? "12h";
  if (!/^\d+[smhd]$/.test(expiresIn)) {
    throw new Error("JWT_EXPIRES_IN must be a duration such as 30m, 12h or 7d");
  }

  const adminPassword = env.ADMIN_PASSWORD ?? "";
  if (nodeEnv === "production" && adminPassword && adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters in production");
  }

  return {
    ...env,
    NODE_ENV: nodeEnv,
    PORT: env.PORT ?? "3000",
    JWT_SECRET: secret,
    JWT_EXPIRES_IN: expiresIn,
    STORAGE_ROOT: env.STORAGE_ROOT ?? "./storage",
    DATA_ROOT: env.DATA_ROOT ?? "./data",
    BEDROCK_CONTAINER: env.BEDROCK_CONTAINER ?? "mc-bedrock",
    BEDROCK_LEVEL_NAME: env.BEDROCK_LEVEL_NAME ?? "active",
    DOCKER_SOCKET: env.DOCKER_SOCKET ?? "/var/run/docker.sock",
    MAX_UPLOAD_MB: env.MAX_UPLOAD_MB ?? "500",
  };
}

export function envFlag(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
