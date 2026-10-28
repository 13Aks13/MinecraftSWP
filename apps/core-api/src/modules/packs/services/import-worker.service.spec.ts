import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ImportReport } from "@mc/shared";

type Processor = (job: { data: Record<string, unknown> }) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  workers: [] as Array<{
    processor: Processor;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>,
  connections: [] as Array<{ disconnect: ReturnType<typeof vi.fn> }>,
}));

vi.mock("bullmq", () => ({
  Worker: class {
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);

    constructor(
      _name: string,
      public readonly processor: Processor,
      _options: unknown,
    ) {
      mocks.workers.push(this);
    }
  },
}));

vi.mock("ioredis", () => ({
  Redis: class {
    disconnect = vi.fn();

    constructor() {
      mocks.connections.push(this);
    }
  },
}));

import { ImportWorkerService } from "./import-worker.service.js";

function buildService(runWorker = "true") {
  const config = {
    get: vi.fn((key: string, fallback?: string) => {
      if (key === "RUN_WORKER") {
        return runWorker;
      }
      if (key === "REDIS_URL") {
        return "redis://localhost:6379";
      }
      return fallback;
    }),
  };
  const jobs = {
    getJob: vi.fn(),
    markActive: vi.fn(),
    updateProgress: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };
  const importer = { importBundle: vi.fn() };
  const service = new ImportWorkerService(config as never, jobs as never, importer as never);
  return { service, jobs, importer };
}

function currentWorker() {
  const worker = mocks.workers[0];
  if (!worker) {
    throw new Error("worker was not created");
  }
  return worker;
}

const REPORT = {
  imported: [],
  skipped: [],
  replaced: [],
  warnings: [],
  errors: [],
  durationMs: 1,
  bundleType: "behavior",
  duplicatePolicy: "replace",
  logs: [],
} as unknown as ImportReport;

describe("ImportWorkerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workers.length = 0;
    mocks.connections.length = 0;
  });

  it("does not start BullMQ when RUN_WORKER is false", () => {
    buildService("false");
    expect(mocks.workers).toHaveLength(0);
    expect(mocks.connections).toHaveLength(0);
  });

  it("processes an import and marks the job completed", async () => {
    const { jobs, importer } = buildService();
    const worker = currentWorker();
    jobs.getJob.mockResolvedValue({ id: "job-1" });
    importer.importBundle.mockResolvedValue(REPORT);

    const dir = await mkdtemp(path.join(tmpdir(), "mc-worker-"));
    const filePath = path.join(dir, "bundle.zip");
    await writeFile(filePath, "zip");

    try {
      const result = await worker.processor({
        data: { jobId: "job-1", filePath, type: "behavior", policy: "replace" },
      });

      expect(jobs.markActive).toHaveBeenCalledWith("job-1", "Starting");
      expect(importer.importBundle).toHaveBeenCalledWith(
        expect.objectContaining({ path: filePath, originalname: "bundle.zip" }),
        "behavior",
        "replace",
        expect.any(Function),
      );
      expect(jobs.complete).toHaveBeenCalledWith("job-1", REPORT);
      expect(result).toBe(REPORT);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails the job before touching the file when the job row is missing", async () => {
    const { jobs, importer } = buildService();
    const worker = currentWorker();
    jobs.getJob.mockResolvedValue(null);

    await expect(
      worker.processor({ data: { jobId: "job-1", filePath: "/missing.zip" } }),
    ).rejects.toThrow("Import job not found");
    expect(importer.importBundle).not.toHaveBeenCalled();
  });

  it("marks the import job failed when BullMQ reports a failure", async () => {
    const { jobs } = buildService();
    const worker = currentWorker();
    const failed = worker.on.mock.calls.find(([event]) => event === "failed")?.[1] as
      | ((job: { data: { jobId?: string } }, error: Error) => Promise<void>)
      | undefined;
    if (!failed) {
      throw new Error("failed handler was not registered");
    }

    await failed({ data: { jobId: "job-1" } }, new Error("boom"));

    expect(jobs.fail).toHaveBeenCalledWith("job-1", "boom");
  });

  it("closes the worker and Redis connection on shutdown", async () => {
    const { service } = buildService();
    const worker = currentWorker();
    const connection = mocks.connections[0];

    await service.onModuleDestroy();

    expect(worker.close).toHaveBeenCalledOnce();
    expect(connection?.disconnect).toHaveBeenCalledOnce();
  });
});
