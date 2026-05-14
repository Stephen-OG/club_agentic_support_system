import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { PrismaService } from "./prisma.service";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("PrismaService", () => {
  it("fails fast when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const service = new PrismaService();

    await assert.rejects(() => service.onModuleInit(), /DATABASE_URL is required/);
  });
});
