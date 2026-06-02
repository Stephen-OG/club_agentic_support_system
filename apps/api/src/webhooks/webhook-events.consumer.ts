import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DomainEventConsumerService } from "../realtime/domain-event-consumers.service";

@Injectable()
export class WebhookEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(WebhookEventsConsumer.name);

  constructor(private readonly consumers: DomainEventConsumerService) {}

  onModuleInit() {
    this.consumers.registerLane("webhooks", async (event) => {
      this.logger.debug(`Webhook lane received ${event.type}`);
    });
  }
}
