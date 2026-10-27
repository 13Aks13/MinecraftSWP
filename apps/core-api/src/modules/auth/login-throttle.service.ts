import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

interface Bucket {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
const MAX_PER_ACCOUNT = 5;
const MAX_PER_IP = 30;
const MAX_TRACKED = 10_000;

/** In-memory failed-login limiter. core-api is a single instance, so no shared store is needed. */
@Injectable()
export class LoginThrottleService {
  private readonly buckets = new Map<string, Bucket>();

  assertAllowed(ip: string, email: string, now = Date.now()): void {
    for (const key of [this.accountKey(ip, email), this.ipKey(ip)]) {
      const bucket = this.buckets.get(key);
      if (bucket && bucket.lockedUntil > now) {
        const seconds = Math.ceil((bucket.lockedUntil - now) / 1000);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: "Too Many Requests",
            message: `Too many failed login attempts. Try again in ${seconds} seconds`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  recordFailure(ip: string, email: string, now = Date.now()): void {
    this.prune(now);
    this.bump(this.accountKey(ip, email), MAX_PER_ACCOUNT, now);
    this.bump(this.ipKey(ip), MAX_PER_IP, now);
  }

  recordSuccess(ip: string, email: string): void {
    this.buckets.delete(this.accountKey(ip, email));
  }

  private bump(key: string, limit: number, now: number): void {
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart > WINDOW_MS) {
      bucket = { failures: 0, windowStart: now, lockedUntil: 0 };
      this.buckets.set(key, bucket);
    }
    bucket.failures += 1;
    if (bucket.failures >= limit) {
      bucket.lockedUntil = now + LOCK_MS;
      bucket.failures = 0;
      bucket.windowStart = now;
    }
  }

  private prune(now: number): void {
    if (this.buckets.size < MAX_TRACKED) {
      return;
    }
    for (const [key, bucket] of this.buckets) {
      if (bucket.lockedUntil <= now && now - bucket.windowStart > WINDOW_MS) {
        this.buckets.delete(key);
      }
    }
  }

  private accountKey(ip: string, email: string): string {
    return `acct:${ip}|${email.trim().toLowerCase()}`;
  }

  private ipKey(ip: string): string {
    return `ip:${ip}`;
  }
}
