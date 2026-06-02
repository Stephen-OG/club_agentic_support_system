import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRedisConnectionOptions, shouldUseBackgroundJobs } from "./jobs.module";

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

  it("uses local Redis options when background jobs are explicitly enabled without REDIS_URL", () => {
    assert.deepEqual(createRedisConnectionOptions(undefined), {
      host: "127.0.0.1",
      port: 6379
    });
  });

  it("keeps background jobs disabled by default outside production", () => {
    assert.equal(shouldUseBackgroundJobs({ NODE_ENV: "development" } as NodeJS.ProcessEnv), false);
    assert.equal(
      shouldUseBackgroundJobs({ NODE_ENV: "development", ENABLE_BACKGROUND_JOBS: "true" } as NodeJS.ProcessEnv),
      true
    );
    assert.equal(shouldUseBackgroundJobs({ NODE_ENV: "production" } as NodeJS.ProcessEnv), true);
    assert.equal(
      shouldUseBackgroundJobs({ NODE_ENV: "production", DISABLE_BACKGROUND_JOBS: "true" } as NodeJS.ProcessEnv),
      false
    );
  });
});
