import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { WebhookEventsConsumer } from "./webhook-events.consumer";

@Module({
  imports: [RealtimeModule],
  providers: [WebhookEventsConsumer]
})
export class WebhooksModule {}
