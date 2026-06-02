import { Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";

const ONE_MINUTE = 60;
const ONE_HOUR = 3600;
const ONE_DAY = 86400;

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis | null;
  private readonly fallback: MemoryCache;
  private warningLogged = false;

  constructor() {
    this.fallback = new MemoryCache();
    this.client = this.tryConnect();
  }

  /**
   * Get a cached value.
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.client) {
      try {
        const raw = await this.client.get(key);
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      } catch (error) {
        this.warnOnce(error instanceof Error ? error : new Error("Unknown cache error"));
        return this.fallback.get<T>(key);
      }
    }
    return this.fallback.get<T>(key);
  }

  /**
   * Set a cached value with TTL in seconds.
   */
  async set(key: string, value: unknown, ttlSeconds = ONE_MINUTE): Promise<void> {
    if (this.client) {
      try {
        const serialized = JSON.stringify(value);
        await this.client.setex(key, ttlSeconds, serialized);
        return;
      } catch (error) {
        this.warnOnce(error instanceof Error ? error : new Error("Unknown cache error"));
      }
    }
    this.fallback.set(key, value, ttlSeconds);
  }

  /**
   * Delete a cached value.
   */
  async del(key: string): Promise<void> {
    if (this.client) {
      try {
        await this.client.del(key);
        return;
      } catch (error) {
        this.warnOnce(error instanceof Error ? error : new Error("Unknown cache error"));
      }
    }
    this.fallback.del(key);
  }

  /**
   * Delete all keys matching a pattern (e.g. `venue:*`).
   * Uses SCAN for production safety, falls back to KEYS for simple setups.
   */
  async delPattern(pattern: string): Promise<void> {
    if (this.client) {
      try {
        let cursor = "0";
        do {
          const result = await this.client.scan(cursor, "MATCH", pattern, "COUNT", 100);
          cursor = result[0];
          const keys = result[1];
          if (keys.length > 0) {
            await this.client.del(...keys);
          }
        } while (cursor !== "0");
        return;
      } catch (error) {
        this.warnOnce(error instanceof Error ? error : new Error("Unknown cache error"));
      }
    }
    this.fallback.delPattern(pattern);
  }

  /**
   * Cache the result of a function. Uses the key to cache, calls fn on miss.
   */
  async remember<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Check if Redis is connected.
   */
  isConnected(): boolean {
    return this.client !== null && this.client.status === "ready";
  }

  /**
   * Publish a message to a Redis channel (for WebSocket use later).
   */
  async publish(channel: string, message: unknown): Promise<void> {
    if (this.client) {
      try {
        await this.client.publish(channel, JSON.stringify(message));
      } catch (error) {
        this.warnOnce(error instanceof Error ? error : new Error("Unknown publish error"));
      }
    } else if (this.fallback) {
      this.fallback.publish(channel, message);
    }
  }

  private tryConnect(): Redis | null {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log("REDIS_URL not set, using in-memory cache fallback");
      return null;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const Redis = require("ioredis");
      const client = new Redis(url, {
        maxRetriesPerRequest: 2,
        retryStrategy(times: number) {
          if (times > 3) return null;
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true
      });

      client.on("error", (error: Error) => {
        this.logger.warn(`Redis connection error: ${error.message}`);
      });

      client.on("ready", () => {
        this.logger.log("Redis ready");
      });

      return client as Redis;
    } catch (error) {
      this.logger.warn(`Failed to create Redis client: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    }
  }

  private warnOnce(error: Error) {
    if (!this.warningLogged) {
      this.warningLogged = true;
      this.logger.warn(`Redis cache error, falling back to in-memory: ${error.message}`);
    }
  }
}

/**
 * In-memory fallback with TTL support.
 */
class MemoryCache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();
  private listeners = new Map<string, Array<(message: unknown) => void>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      expiresAt: Date.now() + ttlSeconds * 1000,
      value
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  async publish(channel: string, message: unknown): Promise<void> {
    const subs = this.listeners.get(channel);
    if (subs) {
      for (const fn of subs) {
        fn(message);
      }
    }
  }
}
