import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

export function assertDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the API. Add it to the repo root .env before starting dev:api.");
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    assertDatabaseUrl();
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
