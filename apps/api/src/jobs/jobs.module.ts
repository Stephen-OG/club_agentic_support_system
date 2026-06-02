import { Module, Global } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { TriageModule } from "../triage/triage.module";
import { TriageReplyProcessor } from "./triage-reply.processor";

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const url = process.env.REDIS_URL;
        if (!url) {
          return {
            connection: { host: "127.0.0.1", port: 6379 },
            defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 2000 } }
          };
        }
        const parsed = new URL(url);
        return {
          connection: {
            host: parsed.hostname,
            port: Number(parsed.port) || 6379,
            password: parsed.password || undefined,
            ...(parsed.pathname && parsed.pathname.length > 1 ? { db: Number(parsed.pathname.slice(1)) || 0 } : {})
          },
          defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 2000 } }
        };
      }
    }),
    BullModule.registerQueue({
      name: "triage-reply"
    })
  ],
  providers: [TriageReplyProcessor],
  exports: [BullModule]
})
export class JobsModule {}
