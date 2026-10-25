export const PACK_TYPES = ["resource", "behavior"] as const;

export type PackType = (typeof PACK_TYPES)[number];

export const DUPLICATE_POLICIES = ["skip", "replace"] as const;
export type DuplicatePolicy = (typeof DUPLICATE_POLICIES)[number];

export const USER_ROLES = ["admin", "moderator", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const WORLD_STATUSES = ["draft", "ready", "active", "error"] as const;
export type WorldStatus = (typeof WORLD_STATUSES)[number];

export const BACKUP_STATUSES = ["creating", "ready", "failed"] as const;
export type BackupStatus = (typeof BACKUP_STATUSES)[number];

export const SERVER_ACTIONS = ["start", "stop", "restart"] as const;
export type ServerAction = (typeof SERVER_ACTIONS)[number];

export const PACK_TYPE_LABELS: Record<PackType, string> = {
  resource: "Resource Pack",
  behavior: "Behavior Pack",
};

/** Minimal pack fields written into world_resource_packs.json / world_behavior_packs.json. */
export interface PackFileEntry {
  packUuid: string;
  versionArray: number[];
}
