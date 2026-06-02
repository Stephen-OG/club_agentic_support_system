import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRedisConnectionOptions } from "./jobs.module";

describe("JobsModule Redis connection", () => {
  it("preserves username, password, db, and TLS from hosted Redis URLs", () => {
    assert.deepEqual(createRedisConnectionOptions("rediss://default:secret@redis.example.com:6380/2"), {
      host: "redis.example.com",
      port: 6380,
      username: "default",
      password: "secret",
      db: 2,
      tls: {}
    });
  });

  it("uses local Redis when REDIS_URL is missing in development", () => {
    assert.deepEqual(createRedisConnectionOptions(undefined), {
      host: "127.0.0.1",
      port: 6379
    });
  });
});
