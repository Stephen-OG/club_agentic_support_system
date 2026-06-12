import { randomBytes } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { RequestPriority as PrismaRequestPriority, RequestStatus, SenderType } from "@prisma/client";
import type { RequestPriority } from "@madupe/shared";
import type { AiTriageOutput } from "@madupe/shared";
import type { AuthContext } from "../auth/auth-context";
import { RedisCacheService } from "../common/cache/redis-cache.service";
import { PrismaService } from "../database/prisma.service";
import { AiTriageService } from "../triage/ai-triage.service";
import { PriorityClassifierService } from "../triage/priority-classifier.service";
import { VenueAccessService } from "../venues/access.service";
import { decryptMessageBody, decryptMessageRecords, encryptMessageCreateData } from "../security/message-crypto";
import type { TriageReplyJobData } from "../jobs/triage-reply.processor";
import { DomainEventsService, type DomainEventType } from "../realtime/domain-events.service";
import { determineAssignmentRoute, type AssignmentRoute } from "../requests/assignment-routing.service";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import type { CreateVenueLocationDto } from "./dto/create-venue-location.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import type { PublicGuestMessageDto } from "./dto/public-guest-message.dto";
import type { PublicVenueMessageDto } from "./dto/public-venue-message.dto";
import { classifyOpenRequestGuestMessage } from "./guest-followup-intent";
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
const triageLocalCacheTtlMs = 60_000;

const publicConversationMessageSelect = {
  id: true,
  venueId: true,
  qrPointId: true,
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

function assignmentSuggestedAction(route: AssignmentRoute) {
  return `Route to ${route.queue} queue: ${route.reason}.`;
}

@Injectable()
export class ServicePointsService {
  private readonly pendingCacheFills = new Map<string, Promise<any>>();
  private readonly triageLocalCache = new Map<string, { result: AiTriageOutput; expiresAt: number }>();

  constructor(
    private readonly aiTriage: AiTriageService,
    private readonly cache: RedisCacheService,
    @InjectQueue("triage-reply") private readonly triageReplyQueue: Queue<TriageReplyJobData>,
    private readonly priorityClassifier: PriorityClassifierService,
    private readonly prisma: PrismaService,
    private readonly venueAccess: VenueAccessService,
    @Optional() private readonly events?: DomainEventsService
  ) {}

  createQrToken(label: string) {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "service_point";
    return `sp_${slug}_${randomBytes(12).toString("hex")}`;
  }

  private venueSupportQrToken(venueSlug: string) {
    return `venue_support_${venueSlug}`;
  }

  private async findOrCreateVenueSupportQrPoint(venue: { id: string; slug: string }) {
    return this.prisma.qrPoint.upsert({
      where: {
        venueId_label: {
          venueId: venue.id,
          label: "Venue support"
        }
      },
      create: {
        venueId: venue.id,
        label: "Venue support",
        qrToken: this.venueSupportQrToken(venue.slug)
      },
      update: {}
    });
  }

  async getVenueIntake(venueSlug: string) {
    const cacheKey = `venue:intake:${venueSlug}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const inFlight = this.pendingCacheFills.get(cacheKey);
    if (inFlight) return inFlight;

    const promise = this.fetchVenueIntake(venueSlug, cacheKey);
    this.pendingCacheFills.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.pendingCacheFills.delete(cacheKey);
    }
  }

  private async fetchVenueIntake(venueSlug: string, cacheKey: string) {
    const venue = await this.prisma.venue.findFirst({
      where: { slug: venueSlug },
      include: {
        hours: {
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
      openingHours: venue.hours,
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

    const inFlight = this.pendingCacheFills.get(cacheKey);
    if (inFlight) return inFlight;

    const promise = this.fetchQrPointIntake(token, cacheKey);
    this.pendingCacheFills.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.pendingCacheFills.delete(cacheKey);
    }
  }

  private async fetchQrPointIntake(token: string, cacheKey: string) {
    const qrPoint = await this.prisma.qrPoint.findFirst({
      where: {
        isActive: true,
        qrToken: token
      },
      include: {
        venue: {
          include: {
            hours: {
              orderBy: {
                dayOfWeek: "asc"
              }
            }
          }
        }
      }
    });

    if (!qrPoint) {
      throw new NotFoundException("QR point not found");
    }

    const result = {
      chatAvailability: this.publicChatAvailability((qrPoint as any).venue),
      servicePoint: qrPoint,
      venue: this.publicVenueSummary((qrPoint as any).venue)
    };

    await this.cache.set(cacheKey, result, 30);
    return result;
  }

  async createVenue(auth: AuthContext, input: CreateVenueDto) {
    this.venueAccess.assertCanManageOrganization(auth, auth.organizationId);
    const name = input.name.trim();

    return this.prisma.venue.create({
      data: {
        hours: {
          create: defaultVenueOpeningHours()
        },
        organizationId: auth.organizationId,
        name,
        slug: input.slug,
        timezone: input.timezone || "Europe/London"
      }
    });
  }

  async listVenues(auth: AuthContext) {
    const canReadOrganization = auth.role === "admin" || auth.role === "owner";
    const where = canReadOrganization
      ? {
          organizationId: auth.organizationId
        }
      : {
          organizationId: auth.organizationId,
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
        hours: {
          orderBy: {
            dayOfWeek: "asc"
          }
        },
        qrPoints: {
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
        organizationId: auth.organizationId
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanManageVenue(auth, { organizationId: venue.organizationId, venueId });
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

    const qrPoint = await this.prisma.qrPoint.create({
      data: {
        venueId,
        locationId: input.locationId || null,
        label,
        qrToken: this.createQrToken(label)
      }
    });

    await this.invalidatePublicIntakeCaches(venue, qrPoint);
    return qrPoint;
  }

  async createVenueLocation(auth: AuthContext, venueId: string, input: CreateVenueLocationDto) {
    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        organizationId: auth.organizationId
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanManageVenue(auth, { organizationId: venue.organizationId, venueId });

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

  async updateServicePoint(auth: AuthContext, venueId: string, qrPointId: string, input: UpdateServicePointDto) {
    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        organizationId: auth.organizationId
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanManageVenue(auth, { organizationId: venue.organizationId, venueId });

    const qrPoint = await this.prisma.qrPoint.findFirst({
      where: {
        id: qrPointId,
        venueId
      }
    });

    if (!qrPoint) {
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

    const updatedQrPoint = await this.prisma.qrPoint.update({
      where: { id: qrPointId },
      data
    });

    await this.invalidatePublicIntakeCaches(venue, qrPoint);
    await this.invalidatePublicIntakeCaches(venue, updatedQrPoint);
    return updatedQrPoint;
  }

  async deleteServicePoint(auth: AuthContext, venueId: string, qrPointId: string) {
    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        organizationId: auth.organizationId
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanManageVenue(auth, { organizationId: venue.organizationId, venueId });

    const qrPoint = await this.prisma.qrPoint.findFirst({
      where: {
        id: qrPointId,
        venueId
      }
    });

    if (!qrPoint) {
      throw new NotFoundException("QR point not found");
    }

    const archivedQrPoint = await this.prisma.qrPoint.update({
      where: { id: qrPointId },
      data: { isActive: false }
    });

    await this.invalidatePublicIntakeCaches(venue, qrPoint);
    return archivedQrPoint;
  }

  async updateVenueOpeningHours(auth: AuthContext, venueId: string, input: UpdateVenueOpeningHoursDto) {
    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        organizationId: auth.organizationId
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    this.venueAccess.assertCanManageVenue(auth, { organizationId: venue.organizationId, venueId });

    const dayNumbers = new Set(input.openingHours.map((hours) => hours.dayOfWeek));
    if (input.openingHours.length !== 7 || dayNumbers.size !== 7) {
      throw new BadRequestException("Opening hours must include one entry for each day of the week");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.venueHours.deleteMany({
        where: {
          venueId
        }
      });

      await tx.venueHours.createMany({
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
        hours: {
          orderBy: {
            dayOfWeek: "asc"
          }
        },
        qrPoints: {
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
    if (this.isOperationsInformationRequest(normalized)) {
      return null;
    }

    const isInformationalQuestion =
      /\b(wifi|wi-fi|password|opening hours|hours|close|closing|open|dress code|age limit|parking|where is|where are|toilet|restroom|bathroom)\b/i.test(
        normalized
      ) &&
      !/\b(need|bring|send|help|issue|problem|spill|broken|blocked|clogged|dirty|mess|clean|paper|soap|missing|wrong|waiting|allerg|medical|injur|fight|security|harass|fire|smoke|emergency)\b/i.test(
        normalized
      );

    if (!isInformationalQuestion) {
      return null;
    }

    return `I can help with service requests at ${venueName}. For venue info, please check with the team nearby.`;
  }

  private isOperationsInformationRequest(message: string) {
    return /\b(menu|food menu|drink menu|wine list|cocktail list|prices?|price list|available|availability|vegan|vegetarian|gluten[-\s]?free|halal|kosher|allergen|allergens|dietary)\b/i.test(
      message
    );
  }

  private requestDraftForGuestMessage(message: string) {
    if (this.isOperationsInformationRequest(message)) {
      return {
        category: "menu",
        title: "Menu request",
        summary: message
      };
    }

    return {
      category: "general",
      title: "Guest support request",
      summary: message
    };
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

  private courtesyFollowupReply() {
    return "You're welcome. The team has your request and will keep you updated here.";
  }

  private openRequestConversationReply() {
    return "I am keeping this with your open request. If you need anything else, send it here and the team will see it.";
  }

  private assertGuestSessionCanAccessConversation(
    conversation: { guestSessionId?: string | null } | null | undefined,
    sessionId: string | null | undefined
  ) {
    if (conversation?.guestSessionId && sessionId !== conversation.guestSessionId) {
      throw new ForbiddenException("You are not allowed to use this conversation");
    }
  }

  private requestAcknowledgementReply(priority: RequestPriority, locationLabel: string | null | undefined) {
    if (priority === "urgent") {
      return locationLabel
        ? `I have alerted the team that ${locationLabel} needs urgent support. Please stay where you are if it is safe to do so.`
        : "I have alerted the team that you need urgent support. Please stay where you are if it is safe to do so.";
    }

    return locationLabel ? `Of course, I have let the team know for ${locationLabel}.` : "Of course, I have let the team know.";
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

  private publicServicePoint<T extends Record<string, any>>(sp: T): Omit<T, "qrToken"> {
    const { qrToken: _, ...rest } = sp;
    return rest;
  }

  private publicChatAvailability(
    venue: { timezone: string; hours?: VenueOpeningHourWindow[] | null } | null | undefined
  ) {
    return getVenueChatAvailability({
      openingHours: venue?.hours ?? [],
      timezone: venue?.timezone || "Europe/London"
    });
  }

  private assertVenueChatIsOpen(venue: { timezone: string; hours?: VenueOpeningHourWindow[] | null }) {
    const availability = this.publicChatAvailability(venue);

    if (!availability.isOpen) {
      throw new BadRequestException("Venue support chat is closed outside opening hours");
    }
  }

  private triageCacheKey(input: { deterministicPriority: string; message: string; servicePointLabel: string; isFollowup?: boolean }) {
    const normalizedMessage = input.message
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 100);

    return `triage:${input.deterministicPriority}:${input.servicePointLabel}:${normalizedMessage}`;
  }

  private async triageGuestMessage(input: Parameters<AiTriageService["triage"]>[0]) {
    if (!input.isFollowup) {
      const cacheKey = this.triageCacheKey(input);
      const cached = this.triageLocalCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.result;
      }
      const result = await this.aiTriage.triage(input);
      this.triageLocalCache.set(cacheKey, { result, expiresAt: Date.now() + triageLocalCacheTtlMs });
      return result;
    }

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
    servicePoint: any,
    venue: { id: string; name: string; slug: string } | null | undefined,
    options?: { request?: unknown; replyPending?: boolean }
  ) {
    return {
      conversationId,
      messages,
      replyPending: options?.replyPending ?? false,
      request: options?.request ?? null,
      servicePoint: this.publicServicePoint(servicePoint),
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
    const newestGuestIndex = messages.findIndex((message) => message.sender === SenderType.GUEST);
    if (newestGuestIndex === -1) {
      return false;
    }

    const newerMessages = messages.slice(0, newestGuestIndex);
    return !newerMessages.some((message) => message.sender === SenderType.ASSISTANT || message.sender === SenderType.STAFF);
  }

  private async enqueueTriageReply(data: TriageReplyJobData, options?: { timeoutMs?: number }) {
    if (!options?.timeoutMs) {
      await this.triageReplyQueue.add("triage-reply", data);
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.triageReplyQueue.add("triage-reply", data),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Timed out while enqueueing triage reply")), options.timeoutMs);
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  /**
   * Fallback synchronous triage when BullMQ/Redis is unavailable.
   * Runs AI triage inline and persists the assistant reply message.
   */
  private async retrySynchronousTriage(
    conversationId: string,
    qrPoint: { id: string; label?: string | null; venueId: string },
    deterministicPriority: RequestPriority,
    guestMessageBody: string,
    tokenOrSlug: string,
    source: string,
    options?: { skipAssistantReply?: boolean }
  ) {
    if (options?.skipAssistantReply) {
      return;
    }

    try {
      const triage = await this.triageGuestMessage({
        deterministicPriority,
        message: guestMessageBody,
        servicePointLabel: qrPoint.label || "your location",
        isFollowup: false
      });

      const request = await this.prisma.supportRequest.findFirst({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      });

      await this.prisma.message.create({
        data: encryptMessageCreateData({
          venueId: qrPoint.venueId,
          qrPointId: qrPoint.id,
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
          venueId: qrPoint.venueId,
          qrPointId: qrPoint.id,
          conversationId,
          requestId: null,
          sender: SenderType.ASSISTANT,
          body: "I have let the team know about your message.",
          metadata: { source, fallback: true }
        })
      });
    }
  }

  async createGuestMessage(token: string, input: PublicGuestMessageDto) {
    const qrPoint = await this.prisma.qrPoint.findFirst({
      where: {
        qrToken: token,
        isActive: true
      },
      include: {
        venue: {
          include: {
            hours: {
              orderBy: {
                dayOfWeek: "asc"
              }
            }
          }
        }
      }
    });

    if (!qrPoint) {
      throw new NotFoundException("QR point not found");
    }

    this.assertVenueChatIsOpen((qrPoint as any).venue);
    const venue = (qrPoint as any).venue;

    const existingConversation = input.conversationId
      ? await this.prisma.conversation.findFirst({
          where: {
            id: input.conversationId,
            qrPointId: qrPoint.id,
            venueId: qrPoint.venueId
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

    this.assertGuestSessionCanAccessConversation(existingConversation, input.sessionId);

    const latestPreflightRequest = Array.isArray((existingConversation as any)?.requests) ? (existingConversation as any).requests[0] : null;
    const hasOpenPreflightRequest = latestPreflightRequest ? this.isActiveRequestStatus(latestPreflightRequest.status) : false;
    const openRequestIntent = hasOpenPreflightRequest ? classifyOpenRequestGuestMessage(input.message) : null;
    const nonRequestReply = !hasOpenPreflightRequest
      ? this.nonRequestReply(input.message, venue?.name || qrPoint.label)
      : null;
    const shouldHandleGreeting = this.isGreetingMessage(input.message) && !hasOpenPreflightRequest;

    // --- Synchronous path: non-request messages (greetings, info questions) ---
    if (nonRequestReply && !hasOpenPreflightRequest) {
      const assistantReply = shouldHandleGreeting ? this.greetingReply(qrPoint.label) : nonRequestReply;

      const result = await this.prisma.$transaction(async (tx) => {
        const conversation =
          existingConversation ??
          (await tx.conversation.create({
            data: {
              guestSessionId: input.sessionId || null,
              qrPointId: qrPoint.id,
              venueId: qrPoint.venueId
            }
          }));

        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: qrPoint.venueId,
            qrPointId: qrPoint.id,
            conversationId: conversation.id,
            sender: SenderType.GUEST,
            body: input.message,
            metadata: { source: "public_qr", qrToken: token }
          })
        });

        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: qrPoint.venueId,
            qrPointId: qrPoint.id,
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

        return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), qrPoint, venue, {
          replyPending: false
        });
      });

      return result;
    }

    if (hasOpenPreflightRequest && openRequestIntent === "courtesy" && existingConversation && latestPreflightRequest) {
      const result = await this.prisma.$transaction(async (tx) => {
        const conversation = existingConversation;

        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: qrPoint.venueId,
            qrPointId: qrPoint.id,
            conversationId: conversation.id,
            requestId: null,
            sender: SenderType.GUEST,
            body: input.message,
            metadata: { source: "public_qr", qrToken: token, intent: "courtesy" }
          })
        });

        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: qrPoint.venueId,
            qrPointId: qrPoint.id,
            conversationId: conversation.id,
            requestId: null,
            sender: SenderType.ASSISTANT,
            body: this.courtesyFollowupReply(),
            metadata: { source: "public_qr", intent: "courtesy_reply" }
          })
        });

        const messages = await tx.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" }
        });

        return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), qrPoint, venue, {
          replyPending: false,
          request: latestPreflightRequest
        });
      });

      return result;
    }

    if (hasOpenPreflightRequest && openRequestIntent === "conversation" && existingConversation && latestPreflightRequest) {
      const result = await this.prisma.$transaction(async (tx) => {
        const conversation = existingConversation;
        const assistantReply = this.nonRequestReply(input.message, venue?.name || qrPoint.label) ?? this.openRequestConversationReply();

        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: qrPoint.venueId,
            qrPointId: qrPoint.id,
            conversationId: conversation.id,
            requestId: null,
            sender: SenderType.GUEST,
            body: input.message,
            metadata: { source: "public_qr", qrToken: token, intent: "conversation" }
          })
        });

        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: qrPoint.venueId,
            qrPointId: qrPoint.id,
            conversationId: conversation.id,
            requestId: null,
            sender: SenderType.ASSISTANT,
            body: assistantReply,
            metadata: { source: "public_qr", intent: "conversation_reply" }
          })
        });

        const messages = await tx.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" }
        });

        return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), qrPoint, venue, {
          replyPending: false,
          request: latestPreflightRequest
        });
      });

      return result;
    }

    // --- Async path: needs AI triage — save guest message + support request, enqueue job ---
    const deterministicPriority = this.priorityClassifier.classifyOrDefault(input.message);
    const prismaPriority = prismaPriorityBySharedPriority[deterministicPriority];
    const requestDraft = this.requestDraftForGuestMessage(input.message);
    const assignmentRoute = determineAssignmentRoute({
      category: requestDraft.category,
      message: input.message,
      priority: deterministicPriority
    });

    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const conversation =
        existingConversation ??
        (await tx.conversation.create({
          data: {
            guestSessionId: input.sessionId || null,
            qrPointId: qrPoint.id,
            venueId: qrPoint.venueId
          }
        }));

      const status = RequestStatus.NEW;

      const supportRequest = await tx.supportRequest.create({
        data: {
          venueId: qrPoint.venueId,
          qrPointId: qrPoint.id,
          conversationId: conversation.id,
          title: requestDraft.title,
          category: requestDraft.category,
          summary: requestDraft.summary,
          priority: prismaPriority,
          deterministicPriority: prismaPriority,
          status,
          agentSuggestedAction: assignmentSuggestedAction(assignmentRoute),
          agentPolicyVersion: "v1-backend-routing"
        }
      });

      // Save the guest message
      await tx.message.create({
        data: encryptMessageCreateData({
          venueId: qrPoint.venueId,
          qrPointId: qrPoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.GUEST,
          body: input.message,
          metadata: { source: "public_qr", qrToken: token }
        })
      });

      await tx.message.create({
        data: encryptMessageCreateData({
          venueId: qrPoint.venueId,
          qrPointId: qrPoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.ASSISTANT,
          body: this.requestAcknowledgementReply(deterministicPriority, qrPoint.label),
          metadata: { source: "public_qr", qrToken: token, intent: "request_acknowledgement" }
        })
      });

      await tx.requestEvent.create({
        data: {
          venueId: qrPoint.venueId,
          requestId: supportRequest.id,
          type: "request.created",
          toStatus: supportRequest.status,
          metadata: { source: "public_qr", qrToken: token, assignmentRouting: assignmentRoute }
        }
      });

      const messages = await tx.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" }
      });

      const response = this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), qrPoint, venue, {
        replyPending: false,
        request: supportRequest
      });

      return {
        messageId: this.latestMessageId(messages, SenderType.GUEST, supportRequest.id),
        realtimeEventType: "request.created" as DomainEventType,
        response
      };
    });

    this.publishRequestEvent(transactionResult.realtimeEventType, transactionResult.response.request as any);
    this.publishMessageEvent(transactionResult.response.request as any, transactionResult.messageId);

    const result = transactionResult.response;

    try {
      await this.enqueueTriageReply({
        conversationId: result.conversationId,
        venueId: qrPoint.venueId,
        qrPointId: qrPoint.id,
        qrPointLabel: qrPoint.label,
        guestMessageBody: input.message,
        qrToken: token,
        source: "public_qr",
        isFollowup: false,
        skipAssistantReply: true,
        deterministicPriority
      } satisfies TriageReplyJobData, { timeoutMs: 750 });
    } catch {
      await this.retrySynchronousTriage(result.conversationId, qrPoint, deterministicPriority, input.message, token, "public_qr", {
        skipAssistantReply: true
      });
    }

    return result;
  }

  async createVenueGuestMessage(venueSlug: string, input: PublicVenueMessageDto) {
    const venue = await this.prisma.venue.findFirst({
      where: { slug: venueSlug },
      include: {
        hours: {
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
    const qrPoint = await this.findOrCreateVenueSupportQrPoint(venue);

    const existingConversation = input.conversationId
      ? await this.prisma.conversation.findFirst({
          where: {
            id: input.conversationId,
            qrPointId: qrPoint.id,
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

    this.assertGuestSessionCanAccessConversation(existingConversation, input.sessionId);

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
              qrPointId: qrPoint.id,
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
            qrPointId: qrPoint.id,
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
            qrPointId: qrPoint.id,
            venueId: venue.id
          })
        });

        const messages = await tx.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" }
        });

        return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), qrPoint, venue, {
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
    const canRouteWithoutLocation = this.isOperationsInformationRequest(input.message);
    const needsLocation = !hasOpenRequest && !locationLabel && !pendingGuestMessage && !canRouteWithoutLocation;

    if (needsLocation) {
      const result = await this.prisma.$transaction(async (tx) => {
        const conversation =
          existingConversation ??
          (await tx.conversation.create({
            data: {
              guestLocationLabel: null,
              guestLocationSource: null,
              guestSessionId: input.sessionId || null,
              qrPointId: qrPoint.id,
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
            qrPointId: qrPoint.id,
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
            qrPointId: qrPoint.id,
            venueId: venue.id
          })
        });

        const messages = await tx.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" }
        });

        return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), qrPoint, venue, {
          replyPending: false
        });
      });

      return result;
    }

    const openVenueRequestIntent = hasOpenRequest ? classifyOpenRequestGuestMessage(input.message) : null;
    if (hasOpenRequest && (openVenueRequestIntent === "courtesy" || openVenueRequestIntent === "conversation") && existingConversation && latestPreflightRequest) {
      const result = await this.prisma.$transaction(async (tx) => {
        const conversation = existingConversation;
        const assistantReply =
          openVenueRequestIntent === "courtesy"
            ? this.courtesyFollowupReply()
            : this.nonRequestReply(input.message, venue.name) ?? this.openRequestConversationReply();

        await tx.message.create({
          data: encryptMessageCreateData({
            body: input.message,
            conversationId: conversation.id,
            metadata: {
              locationLabel,
              quickAction: input.quickAction || null,
              source: "public_venue_qr",
              venueSlug,
              intent: openVenueRequestIntent
            },
            requestId: null,
            sender: SenderType.GUEST,
            qrPointId: qrPoint.id,
            venueId: venue.id
          })
        });

        await tx.message.create({
          data: encryptMessageCreateData({
            body: assistantReply,
            conversationId: conversation.id,
            metadata: {
              source: "public_venue_qr",
              intent: `${openVenueRequestIntent}_reply`
            },
            requestId: null,
            sender: SenderType.ASSISTANT,
            qrPointId: qrPoint.id,
            venueId: venue.id
          })
        });

        const messages = await tx.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" }
        });

        return this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), qrPoint, venue, {
          replyPending: false,
          request: latestPreflightRequest
        });
      });

      return result;
    }

    // --- Async path: save guest message + support request, enqueue AI job ---
    const deterministicPriority = this.priorityClassifier.classifyOrDefault(input.message);
    const prismaPriority = prismaPriorityBySharedPriority[deterministicPriority];
    const requestDraft = this.requestDraftForGuestMessage(input.message);
    const assignmentRoute = determineAssignmentRoute({
      category: requestDraft.category,
      message: input.message,
      priority: deterministicPriority
    });

    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const conversation =
        existingConversation ??
        (await tx.conversation.create({
          data: {
            guestLocationLabel: locationLabel,
            guestLocationSource: locationLabel ? "guest" : null,
            guestSessionId: input.sessionId || null,
            qrPointId: qrPoint.id,
            venueId: venue.id
          }
        }));

      const isUrgentFollowup = Boolean(hasOpenRequest && deterministicPriority === "urgent");
      const status = RequestStatus.NEW;
      
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
            qrPointId: qrPoint.id,
            conversationId: conversation.id,
            guestLocationLabel: locationLabel,
            guestLocationSource: locationLabel ? "guest" : null,
            title: requestDraft.title,
            category: requestDraft.category,
            summary: requestDraft.summary,
            priority: prismaPriority,
            deterministicPriority: prismaPriority,
            status,
            agentSuggestedAction: assignmentSuggestedAction(assignmentRoute),
            agentPolicyVersion: "v1-backend-routing"
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
            assignmentRouting: assignmentRoute,
            source: "public_venue_qr",
            venueSlug
          },
          requestId: supportRequest.id,
          sender: SenderType.GUEST,
          qrPointId: qrPoint.id,
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

      return {
        eventType: hasOpenRequest ? "request.updated" : "request.created",
        messageId: this.latestMessageId(messages, SenderType.GUEST, supportRequest.id),
        response: this.buildCommonResponse(conversation.id, decryptMessageRecords(messages), qrPoint, venue, {
          replyPending: true,
          request: supportRequest
        })
      };
    });

    this.publishRequestEvent(transactionResult.eventType as DomainEventType, transactionResult.response.request as any);
    this.publishMessageEvent(transactionResult.response.request as any, transactionResult.messageId);
    const result = transactionResult.response;

    try {
      await this.enqueueTriageReply({
        conversationId: result.conversationId,
        venueId: venue.id,
        qrPointId: qrPoint.id,
        qrPointLabel: qrPoint.label,
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
        qrPoint,
        deterministicPriority,
        input.message,
        venueSlug,
        "public_venue_qr"
      );
    }

    return result;
  }

  async getGuestConversation(token: string, conversationId: string, sessionId?: string) {
    const qrPoint = await this.prisma.qrPoint.findFirst({
      where: {
        qrToken: token,
        isActive: true
      },
      include: {
        venue: {
          include: {
            hours: {
              orderBy: {
                dayOfWeek: "asc"
              }
            }
          }
        }
      }
    });

    if (!qrPoint) {
      throw new NotFoundException("QR point not found");
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        qrPointId: qrPoint.id,
        venueId: qrPoint.venueId
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
            qrPoint: true
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
      servicePoint: this.publicServicePoint(qrPoint),
      chatAvailability: this.publicChatAvailability((qrPoint as any).venue),
      ...(this.publicVenueSummary((qrPoint as any).venue) ? { venue: this.publicVenueSummary((qrPoint as any).venue) } : {})
    };
  }


  async getVenueGuestConversation(venueSlug: string, conversationId: string, sessionId?: string) {
    const venue = await this.prisma.venue.findFirst({
      where: { slug: venueSlug },
      include: {
        hours: {
          orderBy: {
            dayOfWeek: "asc"
          }
        }
      }
    });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    const qrPoint = await this.findOrCreateVenueSupportQrPoint(venue);
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        qrPointId: qrPoint.id,
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
            qrPoint: true
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
      servicePoint: this.publicServicePoint(qrPoint),
      chatAvailability: this.publicChatAvailability(venue),
      venue: this.publicVenueSummary(venue)
    };
  }

  private latestMessageId(messages: Array<{ id?: string; sender?: unknown; requestId?: string | null }>, sender: SenderType, requestId?: string | null) {
    return [...messages].reverse().find((message) => message.sender === sender && (!requestId || message.requestId === requestId))?.id;
  }

  private publishRequestEvent(type: DomainEventType, request: { id: string; venueId: string; conversationId: string } | null | undefined) {
    if (!request) {
      return;
    }

    this.events?.publish({
      type,
      venueId: request.venueId,
      requestId: request.id,
      conversationId: request.conversationId,
      occurredAt: new Date().toISOString()
    });
  }

  private publishMessageEvent(
    request: { id: string; venueId: string; conversationId: string } | null | undefined,
    messageId?: string
  ) {
    if (!request || !messageId) {
      return;
    }

    this.events?.publish({
      type: "message.created",
      venueId: request.venueId,
      requestId: request.id,
      conversationId: request.conversationId,
      messageId,
      occurredAt: new Date().toISOString()
    });
  }
}
