import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DomainEventConsumerService } from "../realtime/domain-event-consumers.service";

@Injectable()
export class NotificationEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationEventsConsumer.name);

  constructor(private readonly consumers: DomainEventConsumerService) {}

  onModuleInit() {
    this.consumers.registerLane("notifications", async (event) => {
      this.logger.debug(`Notification lane received ${event.type}`);
    });
  }
}
