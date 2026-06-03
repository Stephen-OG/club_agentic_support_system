import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Job } from "bullmq";
import { SenderType } from "@prisma/client";
import type { RequestPriority } from "@guestos/shared";
import { PrismaService } from "../database/prisma.service";
import { AiTriageService } from "../triage/ai-triage.service";
import { PriorityClassifierService } from "../triage/priority-classifier.service";
import { encryptMessageCreateData } from "../security/message-crypto";
import { DomainEventsService } from "../realtime/domain-events.service";

export type TriageReplyJobData = {
  conversationId: string;
  venueId: string;
  servicePointId: string;
  guestMessageBody: string;
  qrToken: string;
  source: string; // "public_qr" | "public_venue_qr"
  servicePointLabel?: string;
  venueSlug?: string;
  quickAction?: string | null;
  locationLabel?: string | null;
  isFollowup?: boolean;
  skipAssistantReply?: boolean;
  deterministicPriority?: RequestPriority;
};

@Injectable()
@Processor("triage-reply")
export class TriageReplyProcessor extends WorkerHost {
  private readonly logger = new Logger(TriageReplyProcessor.name);

  constructor(
    private readonly aiTriage: AiTriageService,
    private readonly prisma: PrismaService,
    private readonly priorityClassifier: PriorityClassifierService,
    @Optional() private readonly events?: DomainEventsService
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
      servicePointLabel,
      venueSlug,
      quickAction,
      locationLabel,
      isFollowup,
      skipAssistantReply,
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
        servicePointLabel: locationLabel ?? servicePointLabel ?? "your location",
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
        this.publishRequestUpdated(venueId, conversationId, request.id);
      }

      if (skipAssistantReply) {
        return;
      }

      // 3. Persist the assistant reply message
      const message = await this.prisma.message.create({
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
      this.publishMessageCreated(venueId, conversationId, request?.id ?? null, message.id);
    } catch (error) {
      this.logger.error(
        `Failed to generate triage reply for conversation ${conversationId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );

      // Write a fallback message so the guest doesn't wait indefinitely
      try {
        const message = await this.prisma.message.create({
          data: encryptMessageCreateData({
            venueId,
            servicePointId,
            conversationId,
            requestId: null,
            sender: SenderType.ASSISTANT,
            body: "I have let the team know about your message.",
            metadata: {
              source,
              venueSlug: venueSlug || null,
              quickAction: quickAction || null,
              fallback: true
            }
          })
        });
        this.publishMessageCreated(venueId, conversationId, null, message.id);
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

  private publishRequestUpdated(venueId: string, conversationId: string, requestId: string) {
    this.events?.publish({
      type: "request.updated",
      venueId,
      conversationId,
      requestId,
      occurredAt: new Date().toISOString()
    });
  }

  private publishMessageCreated(venueId: string, conversationId: string, requestId: string | null, messageId: string) {
    this.events?.publish({
      type: "message.created",
      venueId,
      conversationId,
      ...(requestId ? { requestId } : {}),
      messageId,
      occurredAt: new Date().toISOString()
    });
  }
}
