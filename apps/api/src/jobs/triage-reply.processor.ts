import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { SenderType } from "@prisma/client";
import type { RequestPriority } from "@guestos/shared";
import { PrismaService } from "../database/prisma.service";
import { AiTriageService } from "../triage/ai-triage.service";
import { PriorityClassifierService } from "../triage/priority-classifier.service";
import { encryptMessageCreateData } from "../security/message-crypto";

export type TriageReplyJobData = {
  conversationId: string;
  venueId: string;
  servicePointId: string;
  guestMessageBody: string;
  qrToken: string;
  source: string; // "public_qr" | "public_venue_qr"
  venueSlug?: string;
  quickAction?: string | null;
  locationLabel?: string | null;
  isFollowup?: boolean;
  deterministicPriority?: RequestPriority;
};

@Injectable()
@Processor("triage-reply")
export class TriageReplyProcessor extends WorkerHost {
  private readonly logger = new Logger(TriageReplyProcessor.name);

  constructor(
    private readonly aiTriage: AiTriageService,
    private readonly prisma: PrismaService,
    private readonly priorityClassifier: PriorityClassifierService
  ) {
    super();
  }

  async process(job: Job<TriageReplyJobData>): Promise<void> {
    const {
      conversationId,
      venueId,
      servicePointId,
      guestMessageBody,
      qrToken,
      source,
      venueSlug,
      quickAction,
      locationLabel,
      isFollowup,
      deterministicPriority
    } = job.data;

    try {
      // 1. Run AI triage (the time-consuming part)
      const priority: RequestPriority = deterministicPriority ?? this.priorityClassifier.classifyOrDefault(guestMessageBody);
      const hasActiveRequest = isFollowup ?? await this.hasExistingActiveRequest(conversationId);

      const triage = await this.aiTriage.triage({
        deterministicPriority: priority,
        message: quickAction
          ? `Quick action: ${quickAction}\n${guestMessageBody}`
          : guestMessageBody,
        servicePointLabel: locationLabel ?? servicePointId,
        isFollowup: hasActiveRequest
      });

      // 2. Find and update the support request with triage metadata
      const request = await this.prisma.supportRequest.findFirst({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, category: true }
      });

      if (request) {
        // Update the support request with AI triage results if currently using placeholder values
        await this.prisma.supportRequest.update({
          where: { id: request.id },
          data: {
            title: request.title === "Guest support request" ? triage.title : undefined,
            category: request.category === "general" ? triage.category : undefined,
            summary: triage.summary,
            agentConfidence: (triage as any).confidence,
            agentSuggestedAction: (triage as any).suggestedAction,
            agentPolicyVersion: "v1-semi-autonomous"
          }
        });
      }

      // 3. Persist the assistant reply message
      await this.prisma.message.create({
        data: encryptMessageCreateData({
          venueId,
          servicePointId,
          conversationId,
          requestId: request?.id ?? null,
          sender: SenderType.ASSISTANT,
          body: triage.assistantReply,
          metadata: {
            source,
            venueSlug: venueSlug || null,
            quickAction: quickAction || null,
            triage: {
              category: triage.category,
              needsStaff: triage.needsStaff,
              priority: triage.priority,
              summary: triage.summary,
              title: triage.title,
              confidence: triage.confidence,
              suggestedAction: triage.suggestedAction,
              guestLocationLabel: triage.guestLocationLabel
            }
          }
        })
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate triage reply for conversation ${conversationId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );

      // Write a fallback message so the guest doesn't wait indefinitely
      try {
        await this.prisma.message.create({
          data: encryptMessageCreateData({
            venueId,
            servicePointId,
            conversationId,
            requestId: null,
            sender: SenderType.ASSISTANT,
            body: "The team has been notified of your message.",
            metadata: {
              source,
              venueSlug: venueSlug || null,
              quickAction: quickAction || null,
              fallback: true
            }
          })
        });
      } catch {
        this.logger.error(`Failed to write fallback reply for conversation ${conversationId}`);
      }
    }
  }

  private async hasExistingActiveRequest(conversationId: string): Promise<boolean> {
    const request = await this.prisma.supportRequest.findFirst({
      where: {
        conversationId,
        status: { in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "ESCALATED"] }
      },
      select: { id: true }
    });

    return request !== null;
  }
}
