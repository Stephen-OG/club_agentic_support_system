import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { RequestPriority as PrismaRequestPriority, RequestStatus, SenderType } from "@prisma/client";
import type { RequestPriority } from "@guestos/shared";
import type { AuthContext } from "../auth/auth-context";
import { PrismaService } from "../database/prisma.service";
import { AiTriageService } from "../triage/ai-triage.service";
import { PriorityClassifierService } from "../triage/priority-classifier.service";
import { VenueAccessService } from "../venues/access.service";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import type { PublicGuestMessageDto } from "./dto/public-guest-message.dto";

const prismaPriorityBySharedPriority: Record<RequestPriority, PrismaRequestPriority> = {
  low: PrismaRequestPriority.LOW,
  normal: PrismaRequestPriority.NORMAL,
  high: PrismaRequestPriority.HIGH,
  urgent: PrismaRequestPriority.URGENT
};

@Injectable()
export class ServicePointsService {
  constructor(
    private readonly aiTriage: AiTriageService,
    private readonly priorityClassifier: PriorityClassifierService,
    private readonly prisma: PrismaService,
    private readonly venueAccess: VenueAccessService
  ) {}

  createQrToken(label: string) {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "service_point";
    return `sp_${slug}_${randomBytes(12).toString("hex")}`;
  }

  async createVenue(auth: AuthContext, input: CreateVenueDto) {
    this.venueAccess.assertCanManageWorkspace(auth, auth.workspaceId);
    const name = input.name.trim();

    return this.prisma.venue.create({
      data: {
        workspaceId: auth.workspaceId,
        name,
        slug: input.slug,
        timezone: input.timezone || "Europe/London"
      }
    });
  }

  async createServicePoint(auth: AuthContext, venueId: string, input: CreateServicePointDto) {
    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        workspaceId: auth.workspaceId
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanManageVenue(auth, { workspaceId: venue.workspaceId, venueId });
    const label = input.label.trim();

    if (input.locationId) {
      const location = await this.prisma.venueLocation.findFirst({
        where: {
          id: input.locationId,
          venueId
        }
      });

      if (!location) {
        throw new BadRequestException("Location does not belong to this venue");
      }
    }

    return this.prisma.servicePoint.create({
      data: {
        venueId,
        locationId: input.locationId || null,
        label,
        qrToken: this.createQrToken(label)
      }
    });
  }

  async createGuestMessage(token: string, input: PublicGuestMessageDto) {
    const servicePoint = await this.prisma.servicePoint.findFirst({
      where: {
        qrToken: token,
        isActive: true
      }
    });

    if (!servicePoint) {
      throw new NotFoundException("Service point not found");
    }

    return this.prisma.$transaction(async (tx) => {
      const conversation = input.conversationId
        ? await tx.conversation.findFirst({
            where: {
              id: input.conversationId,
              servicePointId: servicePoint.id,
              venueId: servicePoint.venueId
            }
          })
        : await tx.conversation.create({
            data: {
              guestSessionId: input.sessionId || null,
              servicePointId: servicePoint.id,
              venueId: servicePoint.venueId
            }
          });

      if (!conversation) {
        throw new NotFoundException("Service point not found");
      }

      const deterministicPriority = this.priorityClassifier.classifyOrDefault(input.message);
      const prismaPriority = prismaPriorityBySharedPriority[deterministicPriority];
      const triage = this.aiTriage.createFallback({
        deterministicPriority,
        message: input.message,
        servicePointLabel: servicePoint.label
      });
      const status = deterministicPriority === "urgent" ? RequestStatus.ESCALATED : RequestStatus.NEW;
      const eventType = deterministicPriority === "urgent" ? "request.escalated" : "request.created";
      const supportRequest = await tx.supportRequest.create({
        data: {
          venueId: servicePoint.venueId,
          servicePointId: servicePoint.id,
          conversationId: conversation.id,
          title: triage.title,
          category: triage.category,
          summary: triage.summary || input.message,
          priority: prismaPriority,
          deterministicPriority: prismaPriority,
          status
        }
      });

      await tx.message.create({
        data: {
          venueId: servicePoint.venueId,
          servicePointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.GUEST,
          body: input.message,
          metadata: {
            source: "public_qr",
            qrToken: token
          }
        }
      });

      await tx.message.create({
        data: {
          venueId: servicePoint.venueId,
          servicePointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.ASSISTANT,
          body: triage.assistantReply,
          metadata: {
            source: "public_qr",
            triage: {
              category: triage.category,
              needsStaff: triage.needsStaff,
              priority: triage.priority,
              summary: triage.summary,
              title: triage.title
            }
          }
        }
      });

      await tx.requestEvent.create({
        data: {
          venueId: servicePoint.venueId,
          requestId: supportRequest.id,
          type: eventType,
          toStatus: status,
          metadata: {
            source: "public_qr",
            qrToken: token
          }
        }
      });

      const messages = await tx.message.findMany({
        where: {
          conversationId: conversation.id
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      return {
        conversationId: conversation.id,
        messages,
        request: supportRequest,
        servicePoint
      };
    });
  }
}
