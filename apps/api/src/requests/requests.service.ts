import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { RequestStatus as PrismaRequestStatus, SenderType } from "@prisma/client";
import {
  canTransitionRequest,
  getNextGuestActionStatus,
  type RequestActor,
  type RequestStatus
} from "@guestos/shared";
import type { AuthContext } from "../auth/auth-context";
import { PrismaService } from "../database/prisma.service";
import { VenueAccessService } from "../venues/access.service";
import type { GuestRequestActionDto } from "./dto/guest-request-action.dto";
import type { UpdateRequestStatusDto } from "./dto/update-request-status.dto";

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

type GuestActionInput = GuestRequestActionDto & {
  requestId: string;
};

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

    return this.prisma.supportRequest.findMany({
      where: {
        venueId
      },
      include: {
        assignedTo: true,
        servicePoint: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
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

      return updatedRequest;
    });
  }

  async applyGuestAction(input: GuestActionInput) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id: input.requestId }
    });

    if (!request) {
      throw new NotFoundException("Request not found");
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

      const message = await tx.message.create({
        data: {
          venueId: request.venueId,
          servicePointId: request.servicePointId,
          conversationId: request.conversationId,
          requestId: request.id,
          sender: SenderType.SYSTEM,
          body: this.guestActionMessage(input.action, input.rating),
          metadata: { ...metadata }
        }
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
        message
      };
    });
  }

  private actorFromAuth(auth: AuthContext): RequestActor {
    if (auth.role === "owner" || auth.role === "admin") {
      return "admin";
    }

    if (auth.role === "manager") {
      return "manager";
    }

    return "staff";
  }

  private isValidRating(rating: unknown): rating is number {
    return Number.isInteger(rating) && typeof rating === "number" && rating >= 1 && rating <= 5;
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
