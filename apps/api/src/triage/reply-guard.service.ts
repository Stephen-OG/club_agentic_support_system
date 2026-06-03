import { Injectable } from "@nestjs/common";
import type { RequestPriority } from "@guestos/shared";

@Injectable()
export class ReplyGuardService {
  createGuestReply(priority: RequestPriority, servicePointLabel: string, isFollowup = false) {
    const location = this.guestMeaningfulLocation(servicePointLabel);

    if (priority === "urgent") {
      return location
        ? `I have alerted the team that ${location} needs urgent support. Please stay where you are if it is safe to do so.`
        : "I have alerted the team that you need urgent support. Please stay where you are if it is safe to do so.";
    }

    if (isFollowup) {
      return "Got it, I added that to your open request so the team has the full picture.";
    }

    return location ? `Of course, I have let the team know for ${location}.` : "Of course, I have let the team know.";
  }

  private guestMeaningfulLocation(label: string) {
    const trimmed = label.trim();

    if (!trimmed || this.looksInternalIdentifier(trimmed)) {
      return null;
    }

    return trimmed;
  }

  private looksInternalIdentifier(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) || /^sp_[a-z0-9_]+_[a-f0-9]{16,}$/i.test(value);
  }
}
