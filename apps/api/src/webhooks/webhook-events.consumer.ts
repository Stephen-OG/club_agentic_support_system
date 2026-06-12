import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DomainEventConsumerService } from "../realtime/domain-event-consumers.service";

@Injectable()
export class WebhookEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(WebhookEventsConsumer.name);
  private registered = false;

  constructor(private readonly consumers: DomainEventConsumerService) {}

  onModuleInit() {
    if (this.registered) return;
    this.registered = true;
    this.consumers.registerLane("webhooks", async (event) => {
      this.logger.debug(`Webhook lane received ${event.type}`);
      // TODO: Dispatch to registered webhook URLs
    });
  }
}
