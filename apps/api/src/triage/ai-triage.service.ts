import { Injectable } from "@nestjs/common";
import { AiTriageSchema, type AiTriageOutput, type RequestPriority } from "@guestos/shared";
import { ReplyGuardService } from "./reply-guard.service";

@Injectable()
export class AiTriageService {
  constructor(private readonly replyGuard: ReplyGuardService) {}

  createFallback(input: {
    deterministicPriority: RequestPriority;
    message: string;
    servicePointLabel: string;
  }): AiTriageOutput {
    return AiTriageSchema.parse({
      assistantReply: this.replyGuard.createGuestReply(input.deterministicPriority, input.servicePointLabel),
      category: this.categoryFromMessage(input.message),
      needsStaff: true,
      priority: input.deterministicPriority,
      summary: input.message,
      title: this.titleFromPriority(input.deterministicPriority)
    });
  }

  private categoryFromMessage(message: string) {
    if (/\b(allerg|medical|injur|fight|security|harass|fire|smoke|emergency)\b/i.test(message)) {
      return "safety";
    }

    if (/\b(spill|mess|leak|bathroom|restroom)\b/i.test(message)) {
      return "facilities";
    }

    if (/\b(bill|pay|payment|refund|overcharged)\b/i.test(message)) {
      return "payment";
    }

    return "general";
  }

  private titleFromPriority(priority: RequestPriority) {
    if (priority === "urgent") {
      return "Urgent guest support";
    }

    if (priority === "high") {
      return "High priority guest request";
    }

    return "Guest support request";
  }
}
