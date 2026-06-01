import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { RequestStatus as PrismaRequestStatus, SenderType } from "@prisma/client";
import {
  canTransitionRequest,
  getNextGuestActionStatus,
  normalizeSatisfactionRating,
  type RequestActor,
  type RequestStatus
} from "@guestos/shared";
import type { AuthContext } from "../auth/auth-context";
import { PrismaService } from "../database/prisma.service";
import { VenueAccessService } from "../venues/access.service";
import type { GuestRequestActionDto } from "./dto/guest-request-action.dto";
import type { UpdateRequestStatusDto } from "./dto/update-request-status.dto";
import { decryptMessageRecord, encryptMessageCreateData } from "../security/message-crypto";

const prismaStatusBySharedStatus: Record<RequestStatus, PrismaRequestStatus> = {
  new: PrismaRequestStatus.NEW,
  acknowledged: PrismaRequestStatus.ACKNOWLEDGED,
  assigned: PrismaRequestStatus.ASSIGNED,
  declined: PrismaRequestStatus.DECLINED,
  in_progress: PrismaRequestStatus.IN_PROGRESS,
  completed: PrismaRequestStatus.COMPLETED,
  resolved: PrismaRequestStatus.RESOLVED,
  cancelled: PrismaRequestStatus.CANCELLED,
  escalated: PrismaRequestStatus.ESCALATED
};

const sharedStatusByPrismaStatus: Record<PrismaRequestStatus, RequestStatus> = {
  [PrismaRequestStatus.NEW]: "new",
  [PrismaRequestStatus.ACKNOWLEDGED]: "acknowledged",
  [PrismaRequestStatus.ASSIGNED]: "assigned",
  [PrismaRequestStatus.DECLINED]: "declined",
  [PrismaRequestStatus.IN_PROGRESS]: "in_progress",
  [PrismaRequestStatus.COMPLETED]: "completed",
  [PrismaRequestStatus.RESOLVED]: "resolved",
  [PrismaRequestStatus.CANCELLED]: "cancelled",
  [PrismaRequestStatus.ESCALATED]: "escalated"
};

const terminalConversationStatuses = new Set<RequestStatus>(["resolved", "cancelled"]);

type GuestActionInput = GuestRequestActionDto & {
  requestId: string;
};

function latestSatisfactionRating(messages: Array<{ metadata: unknown; createdAt: Date | string }>) {
  for (const message of messages) {
    const metadata = message.metadata as { satisfactionRating?: unknown } | null;
    const rating = normalizeSatisfactionRating(metadata?.satisfactionRating);
    if (rating) {
      return rating;
    }
  }

  return null;
}

function recentMessages(messages: Array<{ id: string; sender: SenderType; body: string; createdAt: Date | string }>) {
  return [...messages]
    .reverse()
    .map(decryptMessageRecord)
    .map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      createdAt: message.createdAt
    }));
}

function guestVisibleStatusMessage(status: RequestStatus) {
  const messages: Partial<Record<RequestStatus, string>> = {
    acknowledged: "The team has acknowledged your request and will help from here.",
    assigned: "A team member has been assigned to your request.",
    declined: "That team member could not take it, so we are sending it back for another teammate to pick up.",
    in_progress: "The team is working on this now.",
    completed: "The team marked this complete. How did it go?",
    resolved: "Thank you for confirming. We have closed this request.",
    cancelled: "No problem, this request is cancelled. Send another message if you need anything else.",
    escalated: "We have escalated this so the right team can respond quickly."
  };

  return messages[status];
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venueAccess: VenueAccessService
  ) {}

  async listForVenue(auth: AuthContext, venueId: string) {
    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        workspaceId: auth.workspaceId
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanReadVenue(auth, { workspaceId: venue.workspaceId, venueId });

    const requests = await this.prisma.supportRequest.findMany({
      where: {
        venueId
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        },
        servicePoint: {
          select: {
            id: true,
            label: true
          }
        },
        messages: {
          select: {
            id: true,
            sender: true,
            body: true,
            metadata: true,
            createdAt: true
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 2
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return requests.map((request) => ({
      ...request,
      satisfactionRating: latestSatisfactionRating(request.messages),
      recentMessages: recentMessages(request.messages)
    }));
  }

  async updateStatus(auth: AuthContext, requestId: string, input: UpdateRequestStatusDto) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id: requestId },
      include: { venue: true }
    });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    this.venueAccess.assertCanOperateVenue(auth, { workspaceId: request.venue.workspaceId, venueId: request.venueId });

    const fromStatus = sharedStatusByPrismaStatus[request.status];
    const toStatus = input.status;
    const actor = this.actorFromAuth(auth);

    if (!canTransitionRequest(fromStatus, toStatus, actor)) {
      throw new ConflictException(`Cannot transition request from ${fromStatus} to ${toStatus}`);
    }

    const prismaToStatus = prismaStatusBySharedStatus[toStatus];
    const updateData = {
      status: prismaToStatus,
      ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
      ...(toStatus === "acknowledged" ? { acknowledgedAt: new Date() } : {}),
      ...(toStatus === "completed" ? { completedAt: new Date() } : {}),
      ...(toStatus === "resolved" ? { resolvedAt: new Date() } : {}),
      ...(toStatus === "in_progress" ? { resolvedAt: null } : {})
    };

    return this.prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.supportRequest.update({
        where: { id: requestId },
        data: updateData,
        include: {
          assignedTo: true,
          servicePoint: true
        }
      });

      await this.closeConversationIfTerminal(tx, request.conversationId, toStatus);

      await tx.requestEvent.create({
        data: {
          venueId: request.venueId,
          requestId,
          actorStaffId: auth.staffProfileId,
          type: "request.status_changed",
          fromStatus: request.status,
          toStatus: prismaToStatus,
          metadata: input.assignedToId ? { assignedToId: input.assignedToId } : {}
        }
      });

      const guestMessage = guestVisibleStatusMessage(toStatus);
      if (guestMessage) {
        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: request.venueId,
            servicePointId: request.servicePointId,
            conversationId: request.conversationId,
            requestId: request.id,
            sender: SenderType.SYSTEM,
            body: guestMessage,
            metadata: {
              source: "request_status",
              status: toStatus
            }
          })
        });
      }

      return updatedRequest;
    });
  }

  async applyGuestAction(input: GuestActionInput) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id: input.requestId },
      include: { conversation: true }
    });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    if (request.conversation.guestSessionId) {
      if (!input.sessionId || input.sessionId !== request.conversation.guestSessionId) {
        throw new ForbiddenException("You are not allowed to act on this request");
      }
    }

    if (input.action === "confirm_resolved" && !this.isValidRating(input.rating)) {
      throw new BadRequestException("A satisfaction rating from 1 to 5 is required");
    }

    let nextStatus: RequestStatus;

    try {
      nextStatus = getNextGuestActionStatus(sharedStatusByPrismaStatus[request.status], input.action);
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : "Guest action is not allowed");
    }

    const prismaToStatus = prismaStatusBySharedStatus[nextStatus];
    const metadata = this.isValidRating(input.rating) ? { satisfactionRating: input.rating } : {};

    return this.prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.supportRequest.update({
        where: { id: input.requestId },
        data: {
          status: prismaToStatus,
          ...(nextStatus === "resolved" ? { resolvedAt: new Date() } : {}),
          ...(nextStatus === "in_progress" ? { resolvedAt: null } : {})
        }
      });

      await this.closeConversationIfTerminal(tx, request.conversationId, nextStatus);

      const message = await tx.message.create({
        data: encryptMessageCreateData({
          venueId: request.venueId,
          servicePointId: request.servicePointId,
          conversationId: request.conversationId,
          requestId: request.id,
          sender: SenderType.SYSTEM,
          body: this.guestActionMessage(input.action, input.rating),
          metadata: { ...metadata }
        })
      });

      await tx.requestEvent.create({
        data: {
          venueId: request.venueId,
          requestId: request.id,
          type: this.guestActionEventType(input.action),
          fromStatus: request.status,
          toStatus: prismaToStatus,
          metadata: { ...metadata }
        }
      });

      return {
        request: updatedRequest,
        message: decryptMessageRecord(message)
      };
    });
  }

  private actorFromAuth(auth: AuthContext): RequestActor {
    if (auth.role === "admin") {
      return "admin";
    }

    if (auth.role === "owner" || auth.role === "manager") {
      return "manager";
    }

    return "staff";
  }

  private isValidRating(rating: unknown): rating is number {
    return normalizeSatisfactionRating(rating) !== null;
  }

  private async closeConversationIfTerminal(
    tx: { conversation: { update: (args: { where: { id: string }; data: { status: string; closedAt: Date } }) => Promise<unknown> } },
    conversationId: string,
    status: RequestStatus
  ) {
    if (!terminalConversationStatuses.has(status)) {
      return;
    }

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        status: "closed",
        closedAt: new Date()
      }
    });
  }

  private guestActionMessage(action: GuestActionInput["action"], rating?: number) {
    if (action === "confirm_resolved") {
      return `Thanks for confirming this was resolved. Rating: ${rating}/5.`;
    }

    if (action === "not_satisfied") {
      return "Thanks for letting us know. The team will keep working on this.";
    }

    return "The guest cancelled this request.";
  }

  private guestActionEventType(action: GuestActionInput["action"]) {
    if (action === "confirm_resolved") {
      return "request.resolved_by_guest";
    }

    if (action === "not_satisfied") {
      return "request.reopened_by_guest";
    }

    return "request.cancelled_by_guest";
  }
}
