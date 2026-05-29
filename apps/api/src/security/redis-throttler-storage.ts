import { Injectable, Logger } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

type RedisClient = {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<"OK">;
  pttl(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly client: RedisClient | null;
  private readonly fallback: ThrottlerStorage;
  private warningLogged = false;

  constructor() {
    this.fallback = createFallbackStorage();
    this.client = this.tryConnect();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    if (!this.client) {
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    const storageKey = this.storageKey(key, throttlerName);
    const blockKey = this.blockKey(key, throttlerName);
    const ttlSeconds = Math.ceil(ttl / 1000);

    try {
      const blockTtl = await this.client.pttl(blockKey);

      if (blockTtl > 0) {
        const remaining = await this.client.get(storageKey);
        return {
          totalHits: Number(remaining) || 0,
          timeToExpire: 0,
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockTtl / 1000)
        };
      }

      const totalHits = await this.client.incr(storageKey);

      if (totalHits === 1) {
        await this.client.expire(storageKey, ttlSeconds);
      }

      if (totalHits > limit) {
        await this.client.setex(blockKey, Math.ceil(blockDuration / 1000), "1");
        await this.client.expire(storageKey, Math.ceil(blockDuration / 1000));

        return {
          totalHits,
          timeToExpire: 0,
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockDuration / 1000)
        };
      }

      const remainingTtl = await this.client.pttl(storageKey);

      return {
        totalHits,
        timeToExpire: Math.ceil(Math.max(remainingTtl, 0) / 1000),
        isBlocked: false,
        timeToBlockExpire: 0
      };
    } catch (error) {
      this.warnOnce(error instanceof Error ? error : new Error("Unknown throttler storage error"));
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  private storageKey(key: string, throttlerName: string) {
    return `ratelimit:${throttlerName}:${key}`;
  }

  private blockKey(key: string, throttlerName: string) {
    return `ratelimit:${throttlerName}:${key}:block`;
  }

  private tryConnect(): RedisClient | null {
    const url = process.env.REDIS_URL;
    if (!url) {
      return null;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const Redis = require("ioredis");
      return new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy(times: number) {
          if (times > 2) return null;
          return Math.min(times * 100, 500);
        },
        lazyConnect: true
      }) as RedisClient;
    } catch {
      return null;
    }
  }

  private warnOnce(error: Error) {
    if (!this.warningLogged) {
      this.warningLogged = true;
      this.logger.warn(`Redis throttler storage error, falling back to in-memory: ${error.message}`);
    }
  }
}

function createFallbackStorage(): ThrottlerStorage {
  const store = new Map<string, { totalHits: number; expiresAt: number; isBlocked: boolean; blockExpiresAt: number }>();

  return {
    async increment(
      key: string,
      ttl: number,
      limit: number,
      blockDuration: number,
      _throttlerName: string
    ): Promise<ThrottlerStorageRecord> {
      const now = Date.now();
      let record = store.get(key);

      if (!record || record.expiresAt <= now) {
        record = { totalHits: 0, expiresAt: now + ttl, isBlocked: false, blockExpiresAt: 0 };
        store.set(key, record);
      }

      if (record.isBlocked && record.blockExpiresAt <= now) {
        record.isBlocked = false;
        record.totalHits = 0;
        record.expiresAt = now + ttl;
      }

      record.totalHits += 1;

      if (record.totalHits > limit && !record.isBlocked) {
        record.isBlocked = true;
        record.blockExpiresAt = now + blockDuration;
      }

      const timeToExpire = Math.ceil(Math.max(record.expiresAt - now, 0) / 1000);
      const timeToBlockExpire = Math.ceil(Math.max(record.blockExpiresAt - now, 0) / 1000);

      return {
        totalHits: record.totalHits,
        timeToExpire,
        isBlocked: record.isBlocked,
        timeToBlockExpire
      };
    }
  };
}