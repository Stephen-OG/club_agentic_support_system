import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { VenuesModule } from "../venues/venues.module";
import { DomainEventsService } from "./domain-events.service";
import { DOMAIN_EVENT_CONSUMER_ADAPTER, DomainEventConsumerService } from "./domain-event-consumers.service";
import { RealtimeController } from "./realtime.controller";
import { createRedisDomainEventConsumerAdapter } from "./redis-domain-event-consumer.adapter";
import { RedisDomainEventBusService } from "./redis-domain-event-bus.service";

@Module({
  controllers: [RealtimeController],
  exports: [DomainEventConsumerService, DomainEventsService],
  imports: [AuthModule, DatabaseModule, VenuesModule],
  providers: [
    DomainEventConsumerService,
    DomainEventsService,
    RedisDomainEventBusService,
    {
      provide: DOMAIN_EVENT_CONSUMER_ADAPTER,
      useFactory: () => createRedisDomainEventConsumerAdapter(process.env.REDIS_URL)
    }
  ]
})
export class RealtimeModule {}
