import { Injectable } from "@nestjs/common";
import type { RequestPriority } from "@guestos/shared";

@Injectable()
export class ReplyGuardService {
  createGuestReply(priority: RequestPriority, servicePointLabel: string) {
    if (priority === "urgent") {
      return `I have alerted the team that ${servicePointLabel} needs urgent support. Please stay where you are if it is safe to do so.`;
    }

    return `Of course. I have notified the team for ${servicePointLabel}.`;
  }
}
