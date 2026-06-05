import { Module } from "@nestjs/common";
import { LoggerModule } from "../common/logger/logger.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AuditEventsConsumer } from "./audit-events.consumer";

@Module({
  imports: [LoggerModule, RealtimeModule],
  providers: [AuditEventsConsumer]
})
export class AuditModule {}
