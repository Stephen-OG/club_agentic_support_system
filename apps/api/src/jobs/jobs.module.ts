import { Module, Global } from "@nestjs/common";
import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { RealtimeModule } from "../realtime/realtime.module";
import { TriageModule } from "../triage/triage.module";
import { TriageReplyProcessor } from "./triage-reply.processor";

const triageReplyQueueName = "triage-reply";

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

export function shouldUseBackgroundJobs(env: NodeJS.ProcessEnv = process.env) {
  if (env.DISABLE_BACKGROUND_JOBS === "true") {
    return false;
  }

  if (env.NODE_ENV === "production") {
    return true;
  }

  return env.ENABLE_BACKGROUND_JOBS === "true";
}

function createDisabledQueue() {
  return {
    add: async () => {
      throw new Error("Background jobs are disabled for this API process");
    }
  };
}

const backgroundJobsEnabled = shouldUseBackgroundJobs();
const bullImports = backgroundJobsEnabled
  ? [
      BullModule.forRootAsync({
        useFactory: () => {
          return {
            connection: createRedisConnectionOptions(process.env.REDIS_URL),
            defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 2000 } }
          };
        }
      }),
      BullModule.registerQueue({
        name: triageReplyQueueName
      })
    ]
  : [];

@Global()
@Module({
  imports: [...bullImports, RealtimeModule, TriageModule],
  providers: backgroundJobsEnabled
    ? [TriageReplyProcessor]
    : [
        {
          provide: getQueueToken(triageReplyQueueName),
          useFactory: createDisabledQueue
        }
      ],
  exports: backgroundJobsEnabled ? [BullModule] : [getQueueToken(triageReplyQueueName)]
})
export class JobsModule {}
