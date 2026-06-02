import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { NotificationEventsConsumer } from "./notification-events.consumer";

@Module({
  imports: [RealtimeModule],
  providers: [NotificationEventsConsumer]
})
export class NotificationsModule {}
