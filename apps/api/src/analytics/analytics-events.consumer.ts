import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DomainEventConsumerService } from "../realtime/domain-event-consumers.service";

@Injectable()
export class AnalyticsEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsEventsConsumer.name);
  private registered = false;

  constructor(private readonly consumers: DomainEventConsumerService) {}

  onModuleInit() {
    if (this.registered) return;
    this.registered = true;
    this.consumers.registerLane("analytics", async (event) => {
      this.logger.debug(`Analytics lane received ${event.type}`);
      // TODO: Send to analytics pipeline (PostHog, Mixpanel, etc.)
    });
  }
}
