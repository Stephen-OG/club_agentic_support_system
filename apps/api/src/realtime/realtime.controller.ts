import { Controller, ForbiddenException, Headers, NotFoundException, Param, Sse, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { map, Observable } from "rxjs";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/auth-context.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { PrismaService } from "../database/prisma.service";
import { VenueAccessService } from "../venues/access.service";
import { DomainEvent, DomainEventsService } from "./domain-events.service";

type SseMessage = {
  type: string;
  data: DomainEvent;
};

function toSseMessage(event: DomainEvent): SseMessage {
  return {
    type: event.type,
    data: event
  };
}

@ApiTags("realtime")
@Controller()
export class RealtimeController {
  constructor(
    private readonly events: DomainEventsService,
    private readonly prisma: PrismaService,
    private readonly venueAccess: VenueAccessService
  ) {}

  @Sse("venues/:venueId/events")
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: "Streams venue request and message events" })
  async streamVenueEvents(@CurrentAuth() auth: AuthContext, @Param("venueId") venueId: string): Promise<Observable<SseMessage>> {
    const venue = await this.prisma.venue.findFirst({
      where: { id: venueId },
      select: { id: true, workspaceId: true }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanReadVenue(auth, { workspaceId: venue.workspaceId, venueId: venue.id });

    return this.events.streamForVenue(venueId).pipe(map(toSseMessage));
  }

  @Sse("public/qr/:token/conversations/:conversationId/events")
  @ApiOkResponse({ description: "Streams guest-visible conversation events" })
  async streamGuestConversationEvents(
    @Param("token") token: string,
    @Param("conversationId") conversationId: string,
    @Headers("x-guest-session") sessionId?: string
  ): Promise<Observable<SseMessage>> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        servicePoint: {
          qrToken: token,
          isActive: true
        }
      },
      select: {
        id: true,
        guestSessionId: true
      }
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    if (conversation.guestSessionId && (!sessionId || sessionId !== conversation.guestSessionId)) {
      throw new ForbiddenException("You are not allowed to stream this conversation");
    }

    return this.events.streamForConversation(conversationId).pipe(map(toSseMessage));
  }
}
