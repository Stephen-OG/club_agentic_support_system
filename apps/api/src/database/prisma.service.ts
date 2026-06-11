import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

export const requiredDatabaseTables = ["AuthUser", "AuthSession", "AuthEmailToken"] as const;

export function assertDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the API. Add it to the repo root .env before starting dev:api.");
  }
}

export function getMissingDatabaseTables(existingTables: string[]) {
  const existing = new Set(existingTables);
  return requiredDatabaseTables.filter((table) => !existing.has(table));
}

export function formatMissingDatabaseTablesError(missingTables: readonly string[]) {
  return [
    `DATABASE_URL points to a database missing required tables: ${missingTables.join(", ")}.`,
    "For local development, sync the schema with:",
    "npx prisma db push --schema packages/database/prisma/schema.prisma",
    "For a shared or deployed database, apply migrations with:",
    "npx prisma migrate deploy --schema packages/database/prisma/schema.prisma"
  ].join("\n");
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    assertDatabaseUrl();
    await this.$connect();
    await this.assertRequiredDatabaseTables();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async assertRequiredDatabaseTables() {
    const rows = await this.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('AuthUser', 'AuthSession', 'AuthEmailToken')
    `;
    const missing = getMissingDatabaseTables(rows.map((row) => row.table_name));

    if (missing.length) {
      throw new Error(formatMissingDatabaseTablesError(missing));
    }
  }
}
