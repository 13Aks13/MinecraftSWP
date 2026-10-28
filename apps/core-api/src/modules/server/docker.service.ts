import { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";
import type { LogLineDto, ServerStatsDto, ServerStatusDto } from "@mc/shared";
import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Docker from "dockerode";
import { buildDockerOptions } from "./docker.options.js";

const CONTAINER_NOT_FOUND = 404;
const LOG_LINE_RE = /^(\d{4}-\d{2}-\d{2}T[^\s]+)\s(.*)$/;

type LogSink = (line: LogLineDto) => void;

@Injectable()
export class DockerService implements OnModuleDestroy {
  private readonly logger = new Logger(DockerService.name);
  private readonly docker: Docker;
  readonly containerName: string;

  constructor(@Inject(ConfigService) readonly config: ConfigService) {
    this.containerName = config.get<string>("BEDROCK_CONTAINER", "mc-bedrock");
    const socketPath = config.get<string>("DOCKER_SOCKET", "/var/run/docker.sock");
    this.docker = new Docker(buildDockerOptions(config.get<string>("DOCKER_HOST"), socketPath));
  }

  async onModuleDestroy(): Promise<void> {
    (this.docker as unknown as { destroy?: () => void }).destroy?.();
  }

  async ping(): Promise<void> {
    await this.docker.ping();
  }

  private container(): Docker.Container {
    return this.docker.getContainer(this.containerName);
  }

  private async inspectSafe(): Promise<Docker.ContainerInspectInfo | null> {
    try {
      return await this.container().inspect();
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === CONTAINER_NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  async status(): Promise<ServerStatusDto> {
    const info = await this.inspectSafe().catch((error) => {
      this.logger.warn(`Cannot inspect ${this.containerName}: ${(error as Error).message}`);
      return null;
    });

    if (!info) {
      return {
        containerName: this.containerName,
        exists: false,
        state: "unknown",
        image: null,
        startedAt: null,
        uptimeSeconds: 0,
        health: null,
        playersOnline: null,
      };
    }

    const startedAt = info.State.StartedAt ? new Date(info.State.StartedAt) : null;
    const running = info.State.Running;
    return {
      containerName: this.containerName,
      exists: true,
      state: !running
        ? "stopped"
        : info.State.Restarting
          ? "restarting"
          : info.State.Paused
            ? "paused"
            : "running",
      image: info.Config.Image,
      startedAt: startedAt && running ? startedAt.toISOString() : null,
      uptimeSeconds:
        startedAt && running
          ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))
          : 0,
      health: info.State.Health?.Status ?? null,
      playersOnline: null,
    };
  }

  async stats(): Promise<ServerStatsDto> {
    const raw = (await this.container().stats({ stream: false })) as Docker.ContainerStats;
    const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
    const systemDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
    const onlineCpus =
      raw.cpu_stats.online_cpus ?? raw.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
    const cpuPercent =
      systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;

    const cache = raw.memory_stats.stats?.cache ?? raw.memory_stats.stats?.inactive_file ?? 0;
    const memoryUsageBytes = Math.max(0, (raw.memory_stats.usage ?? 0) - cache);
    const memoryLimitBytes = raw.memory_stats.limit ?? 0;

    let networkRxBytes = 0;
    let networkTxBytes = 0;
    for (const network of Object.values(raw.networks ?? {})) {
      networkRxBytes += network.rx_bytes;
      networkTxBytes += network.tx_bytes;
    }

    return {
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      memoryUsageBytes,
      memoryLimitBytes,
      memoryPercent:
        memoryLimitBytes > 0 ? Math.round((memoryUsageBytes / memoryLimitBytes) * 1000) / 10 : 0,
      networkRxBytes,
      networkTxBytes,
      collectedAt: new Date().toISOString(),
    };
  }

  async start(): Promise<void> {
    const info = await this.inspectSafe();
    if (!info) {
      throw new Error(`Container "${this.containerName}" does not exist`);
    }
    if (!info.State.Running) {
      await this.container().start();
      await this.waitFor(true, 60);
    }
  }

  /**
   * Stop the Bedrock container. Docker's SIGTERM is forwarded by the itzg image
   * to the server's stdin, which performs a clean save before exiting.
   *
   * Do not use `exec(["send-command", "stop"])` here: the process would exit
   * but the container restart policy would immediately start it again, so
   * callers could never observe a stopped container while swapping worlds.
   */
  async stop(timeoutSeconds = 45): Promise<void> {
    const info = await this.inspectSafe();
    if (!info) {
      throw new Error(`Container "${this.containerName}" does not exist`);
    }
    if (!info.State.Running) {
      return;
    }

    await this.container().stop({ t: timeoutSeconds });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async sendCommand(command: string): Promise<string> {
    const output = await this.exec(["send-command", command]);
    return output.stdout;
  }

  private async exec(command: string[]): Promise<{ stdout: string; stderr: string }> {
    const exec = await this.container().exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({});
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const out = new Writable({
        write(chunk, _encoding, callback) {
          stdout += chunk.toString();
          callback();
        },
      });
      const err = new Writable({
        write(chunk, _encoding, callback) {
          stderr += chunk.toString();
          callback();
        },
      });
      this.docker.modem.demuxStream(stream, out, err);
      stream.on("end", () => resolve({ stdout, stderr }));
      stream.on("error", reject);
    });
  }

  private async waitFor(running: boolean, timeoutSeconds: number): Promise<boolean> {
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      const info = await this.inspectSafe().catch(() => null);
      if (!info) {
        return !running;
      }
      if (info.State.Running === running) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return false;
  }

  async streamLogs(tail: number, onLine: LogSink): Promise<() => void> {
    const info = await this.inspectSafe();
    if (!info) {
      throw new Error(`Container "${this.containerName}" does not exist`);
    }

    const stream = (await this.container().logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    })) as unknown as NodeJS.ReadableStream & { destroy?: () => void };

    const attach = (streamName: "stdout" | "stderr") => {
      let buffer = "";
      return new Writable({
        write: (chunk: Buffer, _encoding, callback) => {
          buffer += chunk.toString("utf8");
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }
            const match = LOG_LINE_RE.exec(line);
            onLine({
              stream: streamName,
              timestamp: match?.[1] ? new Date(match[1]).toISOString() : new Date().toISOString(),
              message: match?.[2] ?? line,
            });
          }
          callback();
        },
      });
    };

    if (info.Config.Tty) {
      stream.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString("utf8").split("\n")) {
          if (line.trim()) {
            onLine({ stream: "stdout", timestamp: new Date().toISOString(), message: line });
          }
        }
      });
    } else {
      this.docker.modem.demuxStream(stream, attach("stdout"), attach("stderr"));
    }

    stream.on("error", (error: Error) => {
      this.logger.warn(`Log stream error: ${error.message}`);
    });

    return () => {
      stream.destroy?.();
    };
  }

  async logsText(tail = 500): Promise<string> {
    const info = await this.inspectSafe();
    if (!info) {
      throw new Error(`Container "${this.containerName}" does not exist`);
    }

    const buffer = (await this.container().logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    })) as unknown as Buffer;

    if (info.Config.Tty) {
      return buffer.toString("utf8");
    }

    let stdout = "";
    const out = new Writable({
      write(chunk, _encoding, callback) {
        stdout += chunk.toString();
        callback();
      },
    });
    const err = new Writable({
      write(chunk, _encoding, callback) {
        stdout += chunk.toString();
        callback();
      },
    });

    const source = Readable.from(buffer);
    this.docker.modem.demuxStream(source, out, err);
    await finished(source);
    out.end();
    err.end();
    await Promise.all([finished(out), finished(err)]);
    return stdout;
  }
}
