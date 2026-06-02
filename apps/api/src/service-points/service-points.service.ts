import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { RequestPriority as PrismaRequestPriority, RequestStatus, SenderType } from "@prisma/client";
import type { RequestPriority } from "@guestos/shared";
import type { AuthContext } from "../auth/auth-context";
import { RedisCacheService } from "../common/cache/redis-cache.service";
import { PrismaService } from "../database/prisma.service";
import { AiTriageService } from "../triage/ai-triage.service";
import { PriorityClassifierService } from "../triage/priority-classifier.service";
import { VenueAccessService } from "../venues/access.service";
import { decryptMessageBody, decryptMessageRecords, encryptMessageCreateData } from "../security/message-crypto";
import type { TriageReplyJobData } from "../jobs/triage-reply.processor";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import type { CreateVenueLocationDto } from "./dto/create-venue-location.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import type { PublicGuestMessageDto } from "./dto/public-guest-message.dto";
import type { PublicVenueMessageDto } from "./dto/public-venue-message.dto";
import type { UpdateServicePointDto } from "./dto/update-service-point.dto";
import type { UpdateVenueOpeningHoursDto } from "./dto/update-venue-opening-hours.dto";
import { getVenueChatAvailability, type VenueOpeningHourWindow } from "./venue-hours";

const prismaPriorityBySharedPriority: Record<RequestPriority, PrismaRequestPriority> = {
  low: PrismaRequestPriority.LOW,
  normal: PrismaRequestPriority.NORMAL,
  high: PrismaRequestPriority.HIGH,
  urgent: PrismaRequestPriority.URGENT
};

const publicConversationMessageLimit = 50;
const defaultPublicGuestSessionTtlMinutes = 12 * 60;
const publicConversationMessageSelect = {
  id: true,
  venueId: true,
  servicePointId: true,
  conversationId: true,
  requestId: true,
  sender: true,
  body: true,
  metadata: true,
  createdAt: true
} as const;

type PublicConversationSession = {
  closedAt?: Date | string | null;
  status?: string | null;
  updatedAt?: Date | string | null;
};

function defaultVenueOpeningHours() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    closesAt: "23:00",
    dayOfWeek,
    isClosed: false,
    opensAt: "09:00"
  }));
}

@Injectable()
export class ServicePointsService {
  constructor(
    private readonly aiTriage: AiTriageService,
    private readonly cache: RedisCacheService,
    @InjectQueue("triage-reply") private readonly triageReplyQueue: Queue<TriageReplyJobData>,
    private readonly priorityClassifier: PriorityClassifierService,
    private readonly prisma: PrismaService,
    private readonly venueAccess: VenueAccessService
  ) {}

  createQrToken(label: string) {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "service_point";
    return `sp_${slug}_${randomBytes(12).toString("hex")}`;
  }

  private venueSupportQrToken(venueSlug: string) {
    return `venue_support_${venueSlug}`;
  }

  private async findOrCreateVenueSupportServicePoint(venue: { id: string; slug: string }) {
    const existing = await this.prisma.servicePoint.findFirst({
      where: {
        venueId: venue.id,
        label: "Venue support"
      }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.servicePoint.create({
      data: {
        venueId: venue.id,
        label: "Venue support",
        qrToken: this.venueSupportQrToken(venue.slug)
      }
    });
  }

  async getVenueIntake(venueSlug: string) {
    const cacheKey = `venue:intake:${venueSlug}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const venue = await this.prisma.venue.findFirst({
      where: { slug: venueSlug },
      include: {
        openingHours: {
          orderBy: {
            dayOfWeek: "asc"
          }
        }
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    const result = {
      chatAvailability: this.publicChatAvailability(venue),
      openingHours: venue.openingHours,
      venue,
      quickActions: [
        "drink",
        "missing_order",
        "long_wait",
        "spill",
        "dirty_area",
        "lost_property",
        "payment",
        "restroom",
        "accessibility",
        "vip",
        "safety",
        "medical",
        "general"
      ]
    };

    await this.cache.set(cacheKey, result, 30);
    return result;
  }

  async getServicePointIntake(token: string) {
    const cacheKey = `sp:intake:${token}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const servicePoint = await this.prisma.servicePoint.findFirst({
      where: {
        isActive: true,
        qrToken: token
      },
      include: {
        venue: {
          include: {
            openingHours: {
              orderBy: {
                dayOfWeek: "asc"
              }
            }
          }
        }
      }
    });

    if (!servicePoint) {
      throw new NotFoundException("Service point not found");
    }

    const result = {
      chatAvailability: this.publicChatAvailability((servicePoint as any).venue),
      servicePoint,
      venue: this.publicVenueSummary((servicePoint as any).venue)
    };

    await this.cache.set(cacheKey, result, 30);
    return result;
  }

  async createVenue(auth: AuthContext, input: CreateVenueDto) {
    this.venueAccess.assertCanManageWorkspace(auth, auth.workspaceId);
    const name = input.name.trim();

    return this.prisma.venue.create({
      data: {
        openingHours: {
          create: defaultVenueOpeningHours()
        },
        workspaceId: auth.workspaceId,
        name,
        slug: input.slug,
        timezone: input.timezone || "Europe/London"
      }
    });
  }

  async listVenues(auth: AuthContext) {
    const canReadWorkspace = auth.role === "admin" || auth.role === "owner";
    const where = canReadWorkspace
      ? {
          workspaceId: auth.workspaceId
        }
      : {
          workspaceId: auth.workspaceId,
          id: auth.venueId ?? "00000000-0000-0000-0000-000000000000"
        };

    return this.prisma.venue.findMany({
      where,
      include: {
        locations: {
          orderBy: {
            name: "asc"
          }
        },
        openingHours: {
          orderBy: {
            dayOfWeek: "asc"
          }
        },
        servicePoints: {
          where: {
            isActive: true
          },
          orderBy: {
            label: "asc"
          }
        }
      },
      orderBy: {
        name: "asc"
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

    const servicePoint = await this.prisma.servicePoint.create({
      data: {
        venueId,
        locationId: input.locationId || null,
        label,
        qrToken: this.createQrToken(label)
      }
    });

    await this.invalidatePublicIntakeCaches(venue, servicePoint);
    return servicePoint;
  }

  async createVenueLocation(auth: AuthContext, venueId: string, input: CreateVenueLocationDto) {
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

    const location = await this.prisma.venueLocation.create({
      data: {
        venueId,
        name: input.name.trim(),
        zone: input.zone?.trim() || null
      }
    });

    await this.invalidatePublicIntakeCaches(venue);
    return location;
  }

  async updateServicePoint(auth: AuthContext, venueId: string, servicePointId: string, input: UpdateServicePointDto) {
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

    const servicePoint = await this.prisma.servicePoint.findFirst({
      where: {
        id: servicePointId,
        venueId
      }
    });

    if (!servicePoint) {
      throw new NotFoundException("QR point not found");
    }

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

    const data: { label?: string; locationId?: string | null } = {};
    if (input.label !== undefined) {
      data.label = input.label.trim();
    }
    if (Object.prototype.hasOwnProperty.call(input, "locationId")) {
      data.locationId = input.locationId || null;
    }

    const updatedServicePoint = await this.prisma.servicePoint.update({
      where: { id: servicePointId },
      data
    });

    await this.invalidatePublicIntakeCaches(venue, servicePoint);
    await this.invalidatePublicIntakeCaches(venue, updatedServicePoint);
    return updatedServicePoint;
  }

  async deleteServicePoint(auth: AuthContext, venueId: string, servicePointId: string) {
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

    const servicePoint = await this.prisma.servicePoint.findFirst({
      where: {
        id: servicePointId,
        venueId
      }
    });

    if (!servicePoint) {
      throw new NotFoundException("QR point not found");
    }

    const archivedServicePoint = await this.prisma.servicePoint.update({
      where: { id: servicePointId },
      data: { isActive: false }
    });

    await this.invalidatePublicIntakeCaches(venue, servicePoint);
    return archivedServicePoint;
  }

  async updateVenueOpeningHours(auth: AuthContext, venueId: string, input: UpdateVenueOpeningHoursDto) {
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

    const dayNumbers = new Set(input.openingHours.map((hours) => hours.dayOfWeek));
    if (input.openingHours.length !== 7 || dayNumbers.size !== 7) {
      throw new BadRequestException("Opening hours must include one entry for each day of the week");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.venueOpeningHour.deleteMany({
        where: {
          venueId
        }
      });

      await tx.venueOpeningHour.createMany({
        data: input.openingHours
          .slice()
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
          .map((hours) => ({
            closesAt: hours.closesAt,
            dayOfWeek: hours.dayOfWeek,
            isClosed: hours.isClosed,
            opensAt: hours.opensAt,
            venueId
          }))
      });
    });

    await this.invalidatePublicIntakeCaches(venue);

    return this.prisma.venue.findFirstOrThrow({
      where: {
        id: venueId
      },
      include: {
        locations: {
          orderBy: {
            name: "asc"
          }
        },
        openingHours: {
          orderBy: {
            dayOfWeek: "asc"
          }
        },
        servicePoints: {
          where: {
            isActive: true
          },
          orderBy: {
            label: "asc"
          }
        }
      }
    });
  }

  private async invalidatePublicIntakeCaches(venue?: { slug?: string | null }, servicePoint?: { qrToken?: string | null }) {
    if (venue?.slug) {
      await this.cache.del(`venue:intake:${venue.slug}`);
    }

    if (servicePoint?.qrToken) {
      await this.cache.del(`sp:intake:${servicePoint.qrToken}`);
    } else {
      await this.cache.delPattern("sp:intake:*");
    }
  }

  private isGreetingMessage(message: string) {
    const normalized = message.trim().toLowerCase();
    return /^(hi|hello|hey|hiya|howdy|greetings|yo|good morning|good afternoon|good evening)(\s+(there|everyone|team))?[.!]?$/i.test(normalized);
  }

  private informationalReply(message: string, venueName: string) {
    const normalized = message.trim().toLowerCase();
    const isInformationalQuestion =
      /\b(wifi|wi-fi|password|opening hours|hours|close|closing|open|menu|dress code|age limit|parking|where is|where are|toilet|restroom|bathroom)\b/i.test(
        normalized
      ) &&
      !/\b(need|bring|send|help|spill|broken|missing|wrong|waiting|allerg|medical|injur|fight|security|harass|fire|smoke|emergency)\b/i.test(
        normalized
      );

    if (!isInformationalQuestion) {
      return null;
    }

    return `I can help with service requests at ${venueName}. For venue info, please check with the team nearby.`;
  }

  private nonRequestReply(message: string, venueName: string) {
    if (this.isGreetingMessage(message)) {
      return `Hello. I am Lily for ${venueName}. Ask me for help when you need the team.`;
    }

    return this.informationalReply(message, venueName);
  }

  private greetingReply(servicePointLabel: string) {
    return `Hello. If you'd like help at ${servicePointLabel}, just send your request and the team will respond.`;
  }

  private locationPrompt(venueName: string) {
    return `Where are you in ${venueName}? Please send a table number, bar area, VIP booth, or nearby landmark so the team can find you.`;
  }

  private isActiveRequestStatus(status: string | null | undefined) {
    const normalized = status?.toLowerCase();
    return normalized !== "completed" && normalized !== "resolved" && normalized !== "cancelled";
  }

  private publicVenueSummary(venue: { id: string; name: string; slug: string } | null | undefined) {
    return venue ? { id: venue.id, name: venue.name, slug: venue.slug } : null;
  }

  private publicChatAvailability(
    venue: { timezone: string; openingHours?: VenueOpeningHourWindow[] | null } | null | undefined
  ) {
    return getVenueChatAvailability({
      openingHours: venue?.openingHours ?? [],
      timezone: venue?.timezone || "Europe/London"
    });
  }

  private assertVenueChatIsOpen(venue: { timezone: string; openingHours?: VenueOpeningHourWindow[] | null }) {
    const availability = this.publicChatAvailability(venue);

    if (!availability.isOpen) {
      throw new BadRequestException("Venue support chat is closed outside opening hours");
    }
  }

  private async triageGuestMessage(input: Parameters<AiTriageService["triage"]>[0]) {
    return this.aiTriage.triage(input);
  }

  private publicConversationMessages<T extends { body?: unknown }>(messages: T[]) {
    return decryptMessageRecords([...messages].reverse());
  }

  private publicGuestSessionTtlMs() {
    const configured = Number(process.env.PUBLIC_GUEST_SESSION_TTL_MINUTES);
    const minutes =
      Number.isFinite(configured) && configured > 0 ? configured : defaultPublicGuestSessionTtlMinutes;

    return minutes * 60 * 1000;
  }

  private isPublicConversationClosedOrExpired(conversation: PublicConversationSession) {
    if (conversation.closedAt || conversation.status === "closed") {
      return true;
    }

    if (!conversation.updatedAt) {
      return false;
    }

    return Date.now() - new Date(conversation.updatedAt).getTime() > this.publicGuestSessionTtlMs();
  }

  private triageMetadata(triage: { category: string; needsStaff: boolean; priority: string; summary?: string | null; title: string }) {
    return {
      category: triage.category,
      needsStaff: triage.needsStaff,
      priority: triage.priority,
      summary: triage.summary,
      title: triage.title
    };
  }

  /**
   * Build a common response envelope for public conversation state.
   */
  private buildCommonResponse(
    conversationId: string,
    messages: Array<unknown>,
    servicePoint: unknown,
    venue: { id: string; name: string; slug: string } | null | undefined,
    options?: { request?: unknown; replyPending?: boolean }
  ) {
    return {
      conversationId,
      messages,
      replyPending: options?.replyPending ?? false,
      request: options?.request ?? null,
      servicePoint,
      chatAvailability: this.publicChatAvailability((venue as any)),
      ...(this.publicVenueSummary(venue) ? { venue: this.publicVenueSummary(venue) } : {})
    };
  }

  /**
   * Check if the last message in a conversation is a GUEST message that
   * hasn't yet received an ASSISTANT reply. This means the AI triage job
   * is still running.
   */
  private requiresAsyncReply(messages: Array<{ sender: string }>): boolean {
    if (messages.length < 2) return false;
    // The messages are returned in descending order (newest first)
    const newest = messages[0];
    if (!newest || newest.sender !== "GUEST") return false;
    // Check the second most recent — if it's not an ASSISTANT reply, a reply is pending
    const second = messages[1];
    return second?.sender !== "ASSISTANT";
  }

  /**
   * Fallback synchronous triage when BullMQ/Redis is unavailable.
   * Runs AI triage inline and persists the assistant reply message.
   */
  private async retrySynchronousTriage(
    conversationId: string,
    servicePoint: { id: string; venueId: string },
    deterministicPriority: RequestPriority,
    guestMessageBody: string,
    tokenOrSlug: string,
    source: string
  ) {
    try {
      const triage = await this.triageGuestMessage({
        deterministicPriority,
        message: guestMessageBody,
        servicePointLabel: servicePoint.id,
        isFollowup: false
      });

      const request = await this.prisma.supportRequest.findFirst({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      });

      await this.prisma.message.create({
        data: encryptMessageCreateData({
          venueId: servicePoint.venueId,
          servicePointId: servicePoint.id,
          conversationId,
          requestId: request?.id ?? null,
          sender: SenderType.ASSISTANT,
          body: triage.assistantReply,
          metadata: {
            source,
            fallback: true,
            triage: {
              category: triage.category,
              needsStaff: triage.needsStaff,
              priority: triage.priority,
              summary: triage.summary,
              title: triage.title
            }
          }
        })
      });
    } catch {
      // If fallback also fails, write a simple reply so the guest doesn't hang
      await this.prisma.message.create({
        data: encryptMessageCreateData({
          venueId: servicePoint.venueId,
          servicePointId: servicePoint.id,
          conversationId,
          requestId: null,
          sender: SenderType.ASSISTANT,
          body: "The team has been notified of your message.",
          metadata: { source, fallback: true }
        })
      });
    }
  }

  async createGuestMessage(token: string, input: PublicGuestMessageDto) {
    const servicePoint = await this.prisma.servicePoint.findFirst({
      where: {
        qrToken: token,
        isActive: true
      },
      include: {
        venue: {
          include: {
            openingHours: {
              orderBy: {
                dayOfWeek: "asc"
              }
            }
          }
        }
      }
    });

    if (!servicePoint) {
      throw new NotFoundException("Service point not found");
    }

    this.assertVenueChatIsOpen((servicePoint as any).venue);
    const venue = (servicePoint as any).venue;

    const existingConversation = input.conversationId
      ? await this.prisma.conversation.findFirst({
          where: {
            id: input.conversationId,
            servicePointId: servicePoint.id,
            venueId: servicePoint.venueId
          },
          include: {
            requests: {
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            }
          }
        })
      : null;

    if (input.conversationId && !existingConversation) {
      throw new NotFoundException("Service point not found");
    }

    const latestPreflightRequest = Array.isArray((existingConversation as any)?.requests) ? (existingConversation as any).requests[0] : null;
    const hasOpenPreflightRequest = latestPreflightRequest ? this.isActiveRequestStatus(latestPreflightRequest.status) : false;
    const nonRequestReply = !hasOpenPreflightRequest
      ? this.nonRequestReply(input.message, venue?.name || servicePoint.label)
      : null;
    const shouldHandleGreeting = this.isGreetingMessage(input.message) && !hasOpenPreflightRequest;

    // --- Synchronous path: non-request messages (greetings, info questions) ---
    if (nonRequestReply && !hasOpenPreflightRequest) {
      const assistantReply = shouldHandleGreeting ? this.greetingReply(servicePoint.label) : nonRequestReply;

      const result = await this.prisma.$transaction(async (tx) => {
        const conversation =
          existingConversation ??
          (await tx.conversation.create({
            data: {
              guestSessionId: input.sessionId || null,
              servicePointId: servicePoint.id,
              venueId: servicePoint.venueId
            }
          }));

        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            sender: SenderType.GUEST,
            body: input.message,
            metadata: { source: "public_qr", qrToken: token }
          })
        });

        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            sender: SenderType.ASSISTANT,
            body: assistantReply,
            metadata: { source: "public_qr", intent: "non_request" }
          })
        });

        const messages = await tx.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" }
        });

        return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), servicePoint, venue, {
          replyPending: false
        });
      });

      return result;
    }

    // --- Async path: needs AI triage — save guest message + support request, enqueue job ---
    const deterministicPriority = this.priorityClassifier.classifyOrDefault(input.message);
    const prismaPriority = prismaPriorityBySharedPriority[deterministicPriority];
    const hasExistingRequest = hasOpenPreflightRequest && latestPreflightRequest;

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation =
        existingConversation ??
        (await tx.conversation.create({
          data: {
            guestSessionId: input.sessionId || null,
            servicePointId: servicePoint.id,
            venueId: servicePoint.venueId
          }
        }));

      // Create or update support request
      const isUrgentFollowup = Boolean(hasExistingRequest && deterministicPriority === "urgent");
      const status = deterministicPriority === "urgent" ? RequestStatus.ESCALATED : RequestStatus.NEW;
      
      let supportRequest;
      if (hasExistingRequest) {
        supportRequest = latestPreflightRequest;
        if (isUrgentFollowup) {
          supportRequest = await tx.supportRequest.update({
            where: { id: latestPreflightRequest.id },
            data: { status: RequestStatus.ESCALATED }
          });
        }
      } else {
        supportRequest = await tx.supportRequest.create({
          data: {
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            title: "Guest support request",
            category: "general",
            summary: input.message,
            priority: prismaPriority,
            deterministicPriority: prismaPriority,
            status
          }
        });
      }

      const eventType = isUrgentFollowup ? "request.escalated" : hasExistingRequest ? "request.updated" : "request.created";

      // Save the guest message
      await tx.message.create({
        data: encryptMessageCreateData({
          venueId: servicePoint.venueId,
          servicePointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.GUEST,
          body: input.message,
          metadata: { source: "public_qr", qrToken: token }
        })
      });

      await tx.requestEvent.create({
        data: {
          venueId: servicePoint.venueId,
          requestId: supportRequest.id,
          type: eventType,
          toStatus: supportRequest.status,
          metadata: { source: "public_qr", qrToken: token }
        }
      });

      const messages = await tx.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" }
      });

      return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), servicePoint, venue, {
        replyPending: true,
        request: supportRequest
      });
    });

    try {
      await this.triageReplyQueue.add("triage-reply", {
        conversationId: result.conversationId,
        venueId: servicePoint.venueId,
        servicePointId: servicePoint.id,
        guestMessageBody: input.message,
        qrToken: token,
        source: "public_qr",
        isFollowup: hasExistingRequest,
        deterministicPriority
      } satisfies TriageReplyJobData);
    } catch {
      await this.retrySynchronousTriage(result.conversationId, servicePoint, deterministicPriority, input.message, token, "public_qr");
    }

    return result;
  }

  async createVenueGuestMessage(venueSlug: string, input: PublicVenueMessageDto) {
    const venue = await this.prisma.venue.findFirst({
      where: { slug: venueSlug },
      include: {
        openingHours: {
          orderBy: {
            dayOfWeek: "asc"
          }
        }
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.assertVenueChatIsOpen(venue);
    const servicePoint = await this.findOrCreateVenueSupportServicePoint(venue);

    const existingConversation = input.conversationId
      ? await this.prisma.conversation.findFirst({
          where: {
            id: input.conversationId,
            servicePointId: servicePoint.id,
            venueId: venue.id
          },
          include: {
            messages: {
              orderBy: {
                createdAt: "desc"
              },
              take: 2
            },
            requests: {
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            }
          }
        })
      : null;

    if (input.conversationId && !existingConversation) {
      throw new NotFoundException("Conversation not found");
    }

    const latestPreflightRequest = Array.isArray((existingConversation as any)?.requests)
      ? (existingConversation as any).requests[0]
      : null;
    const hasOpenRequest = latestPreflightRequest ? this.isActiveRequestStatus(latestPreflightRequest.status) : false;
    const nonRequestReply = !hasOpenRequest && !input.quickAction ? this.nonRequestReply(input.message, venue.name) : null;
    const locationLabel = input.locationLabel?.trim() || null;

    // --- Synchronous path: handle location-less first message for venue chat ---
    if (nonRequestReply && !hasOpenRequest) {
      const result = await this.prisma.$transaction(async (tx) => {
        const conversation =
          existingConversation ??
          (await tx.conversation.create({
            data: {
              guestLocationLabel: locationLabel,
              guestLocationSource: locationLabel ? "guest" : null,
              guestSessionId: input.sessionId || null,
              servicePointId: servicePoint.id,
              venueId: venue.id
            }
          }));

        await tx.message.create({
          data: encryptMessageCreateData({
            body: input.message,
            conversationId: conversation.id,
            metadata: {
              quickAction: input.quickAction || null,
              source: "public_venue_qr",
              venueSlug
            },
            requestId: null,
            sender: SenderType.GUEST,
            servicePointId: servicePoint.id,
            venueId: venue.id
          })
        });

        await tx.message.create({
          data: encryptMessageCreateData({
            body: nonRequestReply,
            conversationId: conversation.id,
            metadata: {
              source: "public_venue_qr",
              intent: "non_request"
            },
            requestId: null,
            sender: SenderType.ASSISTANT,
            servicePointId: servicePoint.id,
            venueId: venue.id
          })
        });

        const messages = await tx.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" }
        });

        return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), servicePoint, venue, {
          replyPending: false
        });
      });

      return result;
    }

    // --- Location collection path ---
    const pendingGuestMessage = Array.isArray((existingConversation as any)?.messages)
      ? (existingConversation as any).messages.find(
          (m: any) => m.sender === SenderType.GUEST && !m.requestId
        )
      : null;
    const needsLocation = !hasOpenRequest && !locationLabel && !pendingGuestMessage;

    if (needsLocation) {
      const result = await this.prisma.$transaction(async (tx) => {
        const conversation =
          existingConversation ??
          (await tx.conversation.create({
            data: {
              guestLocationLabel: null,
              guestLocationSource: null,
              guestSessionId: input.sessionId || null,
              servicePointId: servicePoint.id,
              venueId: venue.id
            }
          }));

        await tx.message.create({
          data: encryptMessageCreateData({
            body: input.message,
            conversationId: conversation.id,
            metadata: {
              quickAction: input.quickAction || null,
              source: "public_venue_qr",
              venueSlug
            },
            requestId: null,
            sender: SenderType.GUEST,
            servicePointId: servicePoint.id,
            venueId: venue.id
          })
        });

        await tx.message.create({
          data: encryptMessageCreateData({
            body: this.locationPrompt(venue.name),
            conversationId: conversation.id,
            metadata: {
              source: "public_venue_qr",
              intent: "collect_location"
            },
            requestId: null,
            sender: SenderType.ASSISTANT,
            servicePointId: servicePoint.id,
            venueId: venue.id
          })
        });

        const messages = await tx.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" }
        });

        return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), servicePoint, venue, {
          replyPending: false
        });
      });

      return result;
    }

    // --- Async path: save guest message + support request, enqueue AI job ---
    const deterministicPriority = this.priorityClassifier.classifyOrDefault(input.message);
    const prismaPriority = prismaPriorityBySharedPriority[deterministicPriority];

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation =
        existingConversation ??
        (await tx.conversation.create({
          data: {
            guestLocationLabel: locationLabel,
            guestLocationSource: locationLabel ? "guest" : null,
            guestSessionId: input.sessionId || null,
            servicePointId: servicePoint.id,
            venueId: venue.id
          }
        }));

      const isUrgentFollowup = Boolean(hasOpenRequest && deterministicPriority === "urgent");
      const status = deterministicPriority === "urgent" ? RequestStatus.ESCALATED : RequestStatus.NEW;
      
      let supportRequest;
      if (hasOpenRequest) {
        supportRequest = latestPreflightRequest;
        if (isUrgentFollowup) {
          supportRequest = await tx.supportRequest.update({
            where: { id: latestPreflightRequest.id },
            data: { status: RequestStatus.ESCALATED }
          });
        }
      } else {
        supportRequest = await tx.supportRequest.create({
          data: {
            venueId: venue.id,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            guestLocationLabel: locationLabel,
            guestLocationSource: locationLabel ? "guest" : null,
            title: "Guest support request",
            category: "general",
            summary: input.message,
            priority: prismaPriority,
            deterministicPriority: prismaPriority,
            status
          }
        });
      }

      const eventType = isUrgentFollowup ? "request.escalated" : hasOpenRequest ? "request.updated" : "request.created";

      await tx.message.create({
        data: encryptMessageCreateData({
          body: input.message,
          conversationId: conversation.id,
          metadata: {
            locationLabel,
            quickAction: input.quickAction || null,
            source: "public_venue_qr",
            venueSlug
          },
          requestId: supportRequest.id,
          sender: SenderType.GUEST,
          servicePointId: servicePoint.id,
          venueId: venue.id
        })
      });

      await tx.requestEvent.create({
        data: {
          metadata: {
            locationLabel,
            quickAction: input.quickAction || null,
            source: "public_venue_qr",
            venueSlug
          },
          requestId: supportRequest.id,
          toStatus: supportRequest.status,
          type: eventType,
          venueId: venue.id
        }
      });

      const messages = await tx.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" }
      });

      return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), servicePoint, venue, {
        replyPending: true,
        request: supportRequest
      });
    });

    try {
      await this.triageReplyQueue.add("triage-reply", {
        conversationId: result.conversationId,
        venueId: venue.id,
        servicePointId: servicePoint.id,
        guestMessageBody: input.message,
        qrToken: "",
        source: "public_venue_qr",
        venueSlug,
        quickAction: input.quickAction || null,
        locationLabel,
        isFollowup: hasOpenRequest,
        deterministicPriority
      } satisfies TriageReplyJobData);
    } catch {
      await this.retrySynchronousTriage(
        result.conversationId,
        servicePoint,
        deterministicPriority,
        input.message,
        venueSlug,
        "public_venue_qr"
      );
    }

    return result;
  }

  async getGuestConversation(token: string, conversationId: string, sessionId?: string) {
    const servicePoint = await this.prisma.servicePoint.findFirst({
      where: {
        qrToken: token,
        isActive: true
      },
      include: {
        venue: {
          include: {
            openingHours: {
              orderBy: {
                dayOfWeek: "asc"
              }
            }
          }
        }
      }
    });

    if (!servicePoint) {
      throw new NotFoundException("Service point not found");
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        servicePointId: servicePoint.id,
        venueId: servicePoint.venueId
      },
      include: {
        messages: {
          select: publicConversationMessageSelect,
          orderBy: {
            createdAt: "desc"
          },
          take: publicConversationMessageLimit
        },
        requests: {
          include: {
            assignedTo: true,
            servicePoint: true
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    if (conversation.guestSessionId && sessionId !== conversation.guestSessionId) {
      throw new NotFoundException("Conversation not found");
    }

    if (this.isPublicConversationClosedOrExpired(conversation)) {
      throw new NotFoundException("Conversation not found");
    }

    return {
      conversationId: conversation.id,
      messages: this.publicConversationMessages(conversation.messages),
      replyPending: this.requiresAsyncReply(conversation.messages),
      request: conversation.requests[0] ?? null,
      servicePoint,
      chatAvailability: this.publicChatAvailability((servicePoint as any).venue),
      ...(this.publicVenueSummary((servicePoint as any).venue) ? { venue: this.publicVenueSummary((servicePoint as any).venue) } : {})
    };
  }


  async getVenueGuestConversation(venueSlug: string, conversationId: string, sessionId?: string) {
    const venue = await this.prisma.venue.findFirst({
      where: { slug: venueSlug },
      include: {
        openingHours: {
          orderBy: {
            dayOfWeek: "asc"
          }
        }
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    const servicePoint = await this.findOrCreateVenueSupportServicePoint(venue);
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        servicePointId: servicePoint.id,
        venueId: venue.id
      },
      include: {
        messages: {
          select: publicConversationMessageSelect,
          orderBy: {
            createdAt: "desc"
          },
          take: publicConversationMessageLimit
        },
        requests: {
          include: {
            assignedTo: true,
            servicePoint: true
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    if (conversation.guestSessionId && sessionId !== conversation.guestSessionId) {
      throw new NotFoundException("Conversation not found");
    }

    if (this.isPublicConversationClosedOrExpired(conversation)) {
      throw new NotFoundException("Conversation not found");
    }

    return {
      conversationId: conversation.id,
      messages: this.publicConversationMessages(conversation.messages),
      replyPending: this.requiresAsyncReply(conversation.messages),
      request: conversation.requests[0] ?? null,
      servicePoint,
      chatAvailability: this.publicChatAvailability(venue),
      venue: this.publicVenueSummary(venue)
    };
  }
}
