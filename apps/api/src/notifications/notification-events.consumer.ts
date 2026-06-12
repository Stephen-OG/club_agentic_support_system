import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DomainEventConsumerService } from "../realtime/domain-event-consumers.service";

@Injectable()
export class NotificationEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationEventsConsumer.name);
  private registered = false;

  constructor(private readonly consumers: DomainEventConsumerService) {}

  onModuleInit() {
    if (this.registered) return;
    this.registered = true;
    this.consumers.registerLane("notifications", async (event) => {
      this.logger.debug(`Notification lane received ${event.type}`);
      // TODO: Send real notifications (email, SMS, push) based on event type
    });
  }
}
