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
    isFollowup?: boolean;
  }): AiTriageOutput {
    return AiTriageSchema.parse({
      assistantReply: this.replyGuard.createGuestReply(
        input.deterministicPriority,
        input.servicePointLabel,
        input.isFollowup
      ),
      category: this.categoryFromMessage(input.message),
      confidence: 0.72,
      guestLocationLabel: this.locationFromMessage(input.message),
      needsStaff: true,
      priority: input.deterministicPriority,
      suggestedAction: input.deterministicPriority === "urgent" ? "escalate" : "reply",
      summary: input.message,
      title: this.titleFromPriority(input.deterministicPriority)
    });
  }

  private locationFromMessage(message: string) {
    const tableMatch = message.match(/\btable\s*([a-z0-9-]+)\b/i);
    if (tableMatch?.[1]) {
      return `Table ${tableMatch[1].toUpperCase()}`;
    }

    if (/\b(bar|main bar)\b/i.test(message)) {
      return "Bar area";
    }

    if (/\b(dance floor|floor)\b/i.test(message)) {
      return "Dance floor";
    }

    if (/\b(vip|booth)\b/i.test(message)) {
      return "VIP area";
    }

    if (/\b(toilet|restroom|bathroom)\b/i.test(message)) {
      return "Toilet/restroom";
    }

    return undefined;
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
