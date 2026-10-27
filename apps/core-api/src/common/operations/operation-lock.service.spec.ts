import { ConflictException } from "@nestjs/common";
import { OperationLockService } from "./operation-lock.service.js";

describe("OperationLockService", () => {
  it("returns the result of the task", async () => {
    const locks = new OperationLockService();
    await expect(locks.runExclusive("a", async () => 42)).resolves.toBe(42);
  });

  it("rejects a second operation while the first is running", async () => {
    const locks = new OperationLockService();
    let release!: () => void;
    const first = locks.runExclusive(
      "backup create",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    await expect(locks.runExclusive("world activate", async () => "x")).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(locks.runExclusive("world activate", async () => "x")).rejects.toThrow(
      "backup create",
    );

    release();
    await first;
  });

  it("releases the lock after the task finishes", async () => {
    const locks = new OperationLockService();
    await locks.runExclusive("a", async () => undefined);
    await expect(locks.runExclusive("b", async () => "ok")).resolves.toBe("ok");
  });

  it("releases the lock when the task fails", async () => {
    const locks = new OperationLockService();
    await expect(
      locks.runExclusive("a", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(locks.runExclusive("b", async () => "ok")).resolves.toBe("ok");
  });
});
