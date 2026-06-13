import { Injectable, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

export type IdempotencyResponse = {
  status: number;
  body: unknown;
};

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async find(key: string): Promise<IdempotencyResponse | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: { id: key }
    });

    if (!record) {
      return null;
    }

    if (record.expiresAt < new Date()) {
      await this.prisma.idempotencyRecord.delete({ where: { id: key } }).catch(() => {});
      return null;
    }

    if (record.status === "processing") {
      throw new ConflictException("Request with this idempotency key is already being processed");
    }

    return {
      status: record.responseStatus!,
      body: record.responseBody
    };
  }

  async tryAcquire(key: string): Promise<boolean> {
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          id: key,
          status: "processing",
          responseStatus: 0,
          responseBody: {},
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS)
        }
      });
      return true;
    } catch (err: any) {
      if (err?.code === "P2002") {
        return false;
      }
      throw err;
    }
  }

  async complete(key: string, status: number, body: unknown): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: { id: key },
      data: {
        status: "completed",
        responseStatus: status,
        responseBody: body as any
      }
    });
  }
}
