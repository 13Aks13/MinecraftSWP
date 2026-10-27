import { ConflictException, Injectable } from "@nestjs/common";

/**
 * Serialises long-running operations (backup, restore, world activation, ...).
 * The API runs as a single instance and every operation is awaited in memory, so
 * a simple guard is enough; a second concurrent call is rejected with HTTP 409.
 */
@Injectable()
export class OperationLockService {
  private running: string | null = null;

  async runExclusive<T>(name: string, task: () => Promise<T>): Promise<T> {
    if (this.running !== null) {
      throw new ConflictException(
        `Another operation is already running ("${this.running}"). Wait for it to finish and try again.`,
      );
    }

    this.running = name;
    try {
      return await task();
    } finally {
      this.running = null;
    }
  }
}
