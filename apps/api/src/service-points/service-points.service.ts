import { Injectable } from "@nestjs/common";
import { AiTriageService } from "../triage/ai-triage.service";
import { PriorityClassifierService } from "../triage/priority-classifier.service";
import type { PublicGuestMessageDto } from "./dto/public-guest-message.dto";

@Injectable()
export class ServicePointsService {
  constructor(
    private readonly aiTriage: AiTriageService,
    private readonly priorityClassifier: PriorityClassifierService
  ) {}

  createGuestMessage(token: string, input: PublicGuestMessageDto) {
    const priority = this.priorityClassifier.classifyOrDefault(input.message);
    const servicePointLabel = token;
    const triage = this.aiTriage.createFallback({
      deterministicPriority: priority,
      message: input.message,
      servicePointLabel
    });

    return {
      event: priority === "urgent" ? "request.escalated" : "request.created",
      priority,
      qrToken: token,
      status: priority === "urgent" ? "escalated" : "new",
      triage
    };
  }
}
