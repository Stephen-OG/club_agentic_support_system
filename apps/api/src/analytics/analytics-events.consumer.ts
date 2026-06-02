import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DomainEventConsumerService } from "../realtime/domain-event-consumers.service";

@Injectable()
export class AnalyticsEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsEventsConsumer.name);

  constructor(private readonly consumers: DomainEventConsumerService) {}

  onModuleInit() {
    this.consumers.registerLane("analytics", async (event) => {
      this.logger.debug(`Analytics lane received ${event.type}`);
    });
  }
}
