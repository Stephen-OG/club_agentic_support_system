import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DomainEventConsumerService } from "../realtime/domain-event-consumers.service";

@Injectable()
export class AuditEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(AuditEventsConsumer.name);

  constructor(private readonly consumers: DomainEventConsumerService) {}

  onModuleInit() {
    this.consumers.registerLane("audit", async (event) => {
      this.logger.debug(`Audit lane received ${event.type}`);
    });
  }
}
