import type { ServerStatsDto, ServerStatusDto } from "@mc/shared";

export const STATUS_RUNNING: ServerStatusDto = {
  containerName: "mc-bedrock",
  exists: true,
  state: "running",
  image: "itzg/minecraft-bedrock-server",
  startedAt: "2026-01-01T00:00:00.000Z",
  uptimeSeconds: 60,
  health: null,
  playersOnline: null,
};

export const STATS: ServerStatsDto = {
  cpuPercent: 1.5,
  memoryUsageBytes: 100_000_000,
  memoryLimitBytes: 1_000_000_000,
  memoryPercent: 10,
  networkRxBytes: 10,
  networkTxBytes: 20,
  collectedAt: "2026-01-01T00:00:00.000Z",
};

/** Stand-in for DockerService: nothing here touches a real Docker daemon. */
export function createDockerMock() {
  return {
    containerName: "mc-bedrock",
    ping: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue(STATUS_RUNNING),
    stats: vi.fn().mockResolvedValue(STATS),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue(""),
    streamLogs: vi.fn().mockResolvedValue(() => undefined),
    logsText: vi.fn().mockResolvedValue("[INFO] Server started\n"),
  };
}

export type DockerMock = ReturnType<typeof createDockerMock>;
