import { HttpException } from "@nestjs/common";
import { LoginThrottleService } from "./login-throttle.service.js";

const IP = "203.0.113.7";
const EMAIL = "admin@example.com";
const MINUTE = 60_000;

function fail(service: LoginThrottleService, times: number, now: number, email = EMAIL, ip = IP) {
  for (let i = 0; i < times; i += 1) {
    service.recordFailure(ip, email, now);
  }
}

describe("LoginThrottleService", () => {
  it("allows attempts below the limit", () => {
    const service = new LoginThrottleService();
    fail(service, 4, 0);
    expect(() => service.assertAllowed(IP, EMAIL, 1)).not.toThrow();
  });

  it("locks the account after 5 failures with HTTP 429", () => {
    const service = new LoginThrottleService();
    fail(service, 5, 0);
    try {
      service.assertAllowed(IP, EMAIL, 1_000);
      expect.unreachable("expected a 429");
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it("unlocks after the lock period", () => {
    const service = new LoginThrottleService();
    fail(service, 5, 0);
    expect(() => service.assertAllowed(IP, EMAIL, 16 * MINUTE)).not.toThrow();
  });

  it("is case-insensitive for the email and does not lock other IPs", () => {
    const service = new LoginThrottleService();
    fail(service, 5, 0, "ADMIN@example.com");
    expect(() => service.assertAllowed(IP, EMAIL, 1)).toThrow(HttpException);
    expect(() => service.assertAllowed("198.51.100.1", EMAIL, 1)).not.toThrow();
  });

  it("a successful login clears the account counter", () => {
    const service = new LoginThrottleService();
    fail(service, 4, 0);
    service.recordSuccess(IP, EMAIL);
    fail(service, 4, 1);
    expect(() => service.assertAllowed(IP, EMAIL, 2)).not.toThrow();
  });

  it("locks an IP that sprays many different accounts", () => {
    const service = new LoginThrottleService();
    for (let i = 0; i < 30; i += 1) {
      service.recordFailure(IP, `user${i}@example.com`, 0);
    }
    expect(() => service.assertAllowed(IP, "someone-new@example.com", 1)).toThrow(HttpException);
    expect(() => service.assertAllowed("198.51.100.1", "someone-new@example.com", 1)).not.toThrow();
  });

  it("unlocks the IP after the lock period", () => {
    const service = new LoginThrottleService();
    for (let i = 0; i < 30; i += 1) {
      service.recordFailure(IP, `user${i}@example.com`, 0);
    }
    expect(() => service.assertAllowed(IP, "someone-new@example.com", 16 * MINUTE)).not.toThrow();
  });
});
