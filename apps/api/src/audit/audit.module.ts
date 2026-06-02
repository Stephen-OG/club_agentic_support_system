import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { AuditEventsConsumer } from "./audit-events.consumer";

@Module({
  imports: [RealtimeModule],
  providers: [AuditEventsConsumer]
})
export class AuditModule {}
