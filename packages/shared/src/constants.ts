export const SOCKET_NAMESPACES = {
  logs: "/logs",
} as const;

export const SOCKET_EVENTS = {
  logLine: "log.line",
  logHistory: "log.history",
  logError: "log.error",
  logStatus: "log.status",
} as const;

export const STORAGE_DIRS = {
  resourcePacks: "resource_packs",
  behaviorPacks: "behavior_packs",
  worlds: "worlds",
  backups: "backups",
  metadata: "metadata",
  temp: "temp",
} as const;

export const SERVER_PROPERTY_ALLOWLIST = [
  "server-name",
  "gamemode",
  "difficulty",
  "max-players",
  "allow-cheats",
  "online-mode",
  "allow-list",
  "view-distance",
  "tick-distance",
  "player-idle-timeout",
  "level-seed",
  "default-player-permission-level",
  "texturepack-required",
  "content-log-file-enabled",
  "compression-threshold",
  "server-port",
  "server-portv6",
  "enable-lan-visibility",
  "emit-server-telemetry",
  "beta-apis",
] as const;
