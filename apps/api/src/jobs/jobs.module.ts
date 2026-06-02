import { Module, Global } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { RealtimeModule } from "../realtime/realtime.module";
import { TriageModule } from "../triage/triage.module";
import { TriageReplyProcessor } from "./triage-reply.processor";

export function createRedisConnectionOptions(url: string | undefined) {
  if (!url) {
    return { host: "127.0.0.1", port: 6379 };
  }

  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.pathname && parsed.pathname.length > 1 ? { db: Number(parsed.pathname.slice(1)) || 0 } : {}),
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {})
  };
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        return {
          connection: createRedisConnectionOptions(process.env.REDIS_URL),
          defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 2000 } }
        };
      }
    }),
    BullModule.registerQueue({
      name: "triage-reply"
    }),
    RealtimeModule,
    TriageModule
  ],
  providers: [TriageReplyProcessor],
  exports: [BullModule]
})
export class JobsModule {}
