import { Controller, ForbiddenException, Headers, NotFoundException, Param, Sse, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { from, interval, map, merge, Observable } from "rxjs";
import { filter, switchMap, timeout } from "rxjs/operators";
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
      select: { id: true, organizationId: true }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanReadVenue(auth, { organizationId: venue.organizationId, venueId: venue.id });

    return this.events.streamForVenue(venueId).pipe(timeout(30 * 60 * 1000), map(toSseMessage));
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
        qrPoint: {
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

    const healthCheck = interval(30000).pipe(
      switchMap(() => from(this.prisma.conversation.findFirst({
        where: { id: conversationId },
        select: { guestSessionId: true, status: true }
      }))),
      map((c) => {
        if (!c || c.status === 'closed' || (c.guestSessionId && c.guestSessionId !== sessionId)) {
          throw new NotFoundException("Conversation is no longer accessible");
        }
        return null;
      }),
      filter((v): v is never => v !== null)
    );

    return merge(healthCheck, this.events.streamForConversation(conversationId)).pipe(timeout(30 * 60 * 1000), map(toSseMessage));
  }
}
