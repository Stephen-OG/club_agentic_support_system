import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { RequestStatus as PrismaRequestStatus, SenderType } from "@prisma/client";
import {
  canTransitionRequest,
  createGuestStatusMessage,
  getNextGuestActionStatus,
  normalizeSatisfactionRating,
  type RequestActor,
  type RequestStatus
} from "@madupe/shared";
import type { AuthContext } from "../auth/auth-context";
import { PrismaService } from "../database/prisma.service";
import { VenueAccessService } from "../venues/access.service";
import type { GuestRequestActionDto } from "./dto/guest-request-action.dto";
import type { ListVenueRequestsDto } from "./dto/list-venue-requests.dto";
import type { UpdateRequestStatusDto } from "./dto/update-request-status.dto";
import { decryptMessageRecord, encryptMessageCreateData } from "../security/message-crypto";
import { DomainEventsService } from "../realtime/domain-events.service";

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
const venueRequestListLimit = 100;
const defaultPagedVenueRequestLimit = 50;
const maxVenueRequestListLimit = 100;
const activeRequestStatuses = [
  PrismaRequestStatus.NEW,
  PrismaRequestStatus.ACKNOWLEDGED,
  PrismaRequestStatus.ASSIGNED,
  PrismaRequestStatus.IN_PROGRESS,
  PrismaRequestStatus.ESCALATED
];
const terminalRequestStatuses = [
  PrismaRequestStatus.DECLINED,
  PrismaRequestStatus.COMPLETED,
  PrismaRequestStatus.RESOLVED,
  PrismaRequestStatus.CANCELLED
];

type GuestActionInput = GuestRequestActionDto & {
  requestId: string;
};

type VenueRequestListOptions = ListVenueRequestsDto;
type VenueRequestListPageOptions = VenueRequestListOptions & { page: true };
type VenueRequestListPage<T> = {
  items: T[];
  nextCursor: string | null;
};

function latestSatisfactionRating(messages: Array<{ metadata: unknown; createdAt: Date | string }>) {
  for (const message of messages) {
    const metadata = message.metadata as { satisfactionRating?: unknown } | null;
    try {
      const rating = normalizeSatisfactionRating(metadata?.satisfactionRating);
      if (rating) {
        return rating;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function recentMessages(messages: Array<{ id: string; sender: SenderType; body: string; createdAt: Date | string }>) {
  return [...messages]
    .reverse()
    .filter((message) => message.sender === SenderType.GUEST)
    .map((message) => {
      try {
        return decryptMessageRecord(message);
      } catch {
        return { ...message, body: "[Decryption error]" };
      }
    })
    .map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      createdAt: message.createdAt
    }));
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venueAccess: VenueAccessService,
    @Optional() private readonly events?: DomainEventsService
  ) {}

  async listForVenue(auth: AuthContext, venueId: string): Promise<any[]>;
  async listForVenue(auth: AuthContext, venueId: string, options: VenueRequestListPageOptions): Promise<VenueRequestListPage<any>>;
  async listForVenue(auth: AuthContext, venueId: string, options?: VenueRequestListOptions): Promise<any[] | VenueRequestListPage<any>>;
  async listForVenue(auth: AuthContext, venueId: string, options: VenueRequestListOptions = {}) {
    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        organizationId: auth.organizationId
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanReadVenue(auth, { organizationId: venue.organizationId, venueId });

    const limit = this.resolveVenueRequestLimit(options);
    const requests = await this.prisma.supportRequest.findMany({
      where: this.venueRequestWhere(venueId, options),
      include: {
        assignedTo: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        },
        qrPoint: {
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
          take: 20
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: options.page ? limit + 1 : limit
    });

    const hasNextPage = options.page && requests.length > limit;
    const visibleRequests = hasNextPage ? requests.slice(0, limit) : requests;
    const items = visibleRequests.map((request) => ({
      ...request,
      satisfactionRating: latestSatisfactionRating(request.messages),
      recentMessages: recentMessages(request.messages)
    }));

    if (!options.page) {
      return items;
    }

    return {
      items,
      nextCursor: hasNextPage ? this.requestCursor(items.at(-1)?.createdAt) : null
    };
  }

  private resolveVenueRequestLimit(options: VenueRequestListOptions) {
    const fallback = options.page ? defaultPagedVenueRequestLimit : venueRequestListLimit;
    const limit = Number.isInteger(options.limit) && options.limit ? options.limit : fallback;

    return Math.min(Math.max(limit, 1), maxVenueRequestListLimit);
  }

  private venueRequestWhere(venueId: string, options: VenueRequestListOptions) {
    const where: {
      venueId: string;
      createdAt?: { lt: Date };
      status?: PrismaRequestStatus | { in: PrismaRequestStatus[] };
    } = { venueId };

    if (options.cursor) {
      where.createdAt = { lt: new Date(options.cursor) };
    }

    if (options.status) {
      where.status = prismaStatusBySharedStatus[options.status];
      return where;
    }

    if (options.statusGroup === "active") {
      where.status = { in: activeRequestStatuses };
    }

    if (options.statusGroup === "terminal") {
      where.status = { in: terminalRequestStatuses };
    }

    return where;
  }

  private requestCursor(value: Date | string | undefined) {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : value;
  }

  async updateStatus(auth: AuthContext, requestId: string, input: UpdateRequestStatusDto) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id: requestId },
      include: { venue: true }
    });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    this.venueAccess.assertCanOperateVenue(auth, { organizationId: request.venue.organizationId, venueId: request.venueId });

    if (request.venue.organizationId !== auth.organizationId) {
      throw new NotFoundException("Request not found");
    }

    const toStatus = input.status;
    const actor = this.actorFromAuth(auth);

    const result = await this.prisma.$transaction(async (tx) => {
      const fromStatus = sharedStatusByPrismaStatus[request.status];

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

      const { count } = await tx.supportRequest.updateMany({
        where: { id: requestId, status: request.status },
        data: updateData
      });

      if (count === 0) {
        throw new ConflictException("Request status was changed by another request");
      }

      const updatedRequest = await tx.supportRequest.findUnique({
        where: { id: requestId },
        include: {
          assignedTo: true,
          qrPoint: true
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

      const guestMessage = createGuestStatusMessage(toStatus);
      let createdMessage: { id: string } | null = null;
      if (guestMessage) {
        createdMessage = await tx.message.create({
          data: encryptMessageCreateData({
            venueId: request.venueId,
            qrPointId: request.qrPointId,
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

      return { message: createdMessage, request: updatedRequest };
    });

    if (result.request) {
      this.publishRequestUpdated(result.request);
      this.publishMessageCreated(result.request, result.message);
    }

    return result.request!
  }

  async applyGuestAction(input: GuestActionInput) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id: input.requestId },
      include: {
        conversation: true,
        venue: { select: { organizationId: true } }
      }
    });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    if (input.action === "confirm_resolved" && !this.isValidRating(input.rating)) {
      throw new BadRequestException("A satisfaction rating from 1 to 5 is required");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.findUnique({
        where: { id: request.conversationId },
        select: { guestSessionId: true }
      });

      if (conv?.guestSessionId) {
        if (!input.sessionId || input.sessionId !== conv.guestSessionId) {
          throw new ForbiddenException("You are not allowed to act on this request");
        }
      }

      const currentRequest = await tx.supportRequest.findUnique({
        where: { id: input.requestId },
        select: { status: true }
      });

      if (!currentRequest) {
        throw new NotFoundException("Request not found");
      }

      let nextStatus: RequestStatus;

      try {
        nextStatus = getNextGuestActionStatus(sharedStatusByPrismaStatus[currentRequest.status], input.action);
      } catch (error) {
        throw new ConflictException(error instanceof Error ? error.message : "Guest action is not allowed");
      }

      const prismaToStatus = prismaStatusBySharedStatus[nextStatus];
      const metadata = this.isValidRating(input.rating) ? { satisfactionRating: input.rating } : {};

      const { count } = await tx.supportRequest.updateMany({
        where: { id: input.requestId, status: currentRequest.status },
        data: {
          status: prismaToStatus,
          ...(nextStatus === "resolved" ? { resolvedAt: new Date() } : {}),
          ...(nextStatus === "in_progress" ? { resolvedAt: null } : {})
        }
      });

      if (count === 0) {
        throw new ConflictException("Request status was changed by another request");
      }

      const updatedRequest = await tx.supportRequest.findUnique({
        where: { id: input.requestId }
      });

      await this.closeConversationIfTerminal(tx, request.conversationId, nextStatus);

      const message = await tx.message.create({
        data: encryptMessageCreateData({
          venueId: request.venueId,
          qrPointId: request.qrPointId,
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
        request: updatedRequest!,
        message: decryptMessageRecord(message)
      };
    });

    this.publishRequestUpdated(result.request);
    this.publishMessageCreated(result.request, result.message);

    return result;
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
    try {
      return normalizeSatisfactionRating(rating) !== null;
    } catch {
      return false;
    }
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
      return "Thanks for letting us know. I have reopened this for the team, and they will keep working on it.";
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

  private publishRequestUpdated(request: { venueId: string; id: string; conversationId: string }) {
    this.events?.publish({
      type: "request.updated",
      venueId: request.venueId,
      requestId: request.id,
      conversationId: request.conversationId,
      occurredAt: new Date().toISOString()
    });
  }

  private publishMessageCreated(
    request: { venueId: string; id: string; conversationId: string },
    message: { id: string } | null | undefined
  ) {
    if (!message) {
      return;
    }

    this.events?.publish({
      type: "message.created",
      venueId: request.venueId,
      requestId: request.id,
      conversationId: request.conversationId,
      messageId: message.id,
      occurredAt: new Date().toISOString()
    });
  }
}
