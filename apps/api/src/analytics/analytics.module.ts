import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { AnalyticsEventsConsumer } from "./analytics-events.consumer";

@Module({
  imports: [RealtimeModule],
  providers: [AnalyticsEventsConsumer]
})
export class AnalyticsModule {}
