import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { RequestPriority as PrismaRequestPriority, RequestStatus, SenderType } from "@prisma/client";
import type { RequestPriority } from "@guestos/shared";
import type { AuthContext } from "../auth/auth-context";
import { PrismaService } from "../database/prisma.service";
import { AiTriageService } from "../triage/ai-triage.service";
import { PriorityClassifierService } from "../triage/priority-classifier.service";
import { VenueAccessService } from "../venues/access.service";
import { decryptMessageBody, decryptMessageRecords, encryptMessageCreateData } from "../security/message-crypto";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import type { PublicGuestMessageDto } from "./dto/public-guest-message.dto";
import type { PublicVenueMessageDto } from "./dto/public-venue-message.dto";
import type { UpdateVenueOpeningHoursDto } from "./dto/update-venue-opening-hours.dto";
import { getVenueChatAvailability, type VenueOpeningHourWindow } from "./venue-hours";

const prismaPriorityBySharedPriority: Record<RequestPriority, PrismaRequestPriority> = {
  low: PrismaRequestPriority.LOW,
  normal: PrismaRequestPriority.NORMAL,
  high: PrismaRequestPriority.HIGH,
  urgent: PrismaRequestPriority.URGENT
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

    return {
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
  }

  async getServicePointIntake(token: string) {
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

    return {
      chatAvailability: this.publicChatAvailability((servicePoint as any).venue),
      servicePoint,
      venue: this.publicVenueSummary((servicePoint as any).venue)
    };
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
    const canReadWorkspace = auth.role === "admin";
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

    return this.prisma.servicePoint.create({
      data: {
        venueId,
        locationId: input.locationId || null,
        label,
        qrToken: this.createQrToken(label)
      }
    });
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
          orderBy: {
            label: "asc"
          }
        }
      }
    });
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

  private async triageGuestMessage(input: Parameters<AiTriageService["createFallback"]>[0]) {
    const aiTriage = this.aiTriage as AiTriageService & {
      triage?: (nextInput: Parameters<AiTriageService["createFallback"]>[0]) => Promise<ReturnType<AiTriageService["createFallback"]>>;
    };

    return aiTriage.triage ? aiTriage.triage(input) : this.aiTriage.createFallback(input);
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
      ? this.nonRequestReply(input.message, (servicePoint as any).venue?.name || servicePoint.label)
      : null;
    const shouldHandleGreeting = this.isGreetingMessage(input.message) && !hasOpenPreflightRequest;
    const deterministicPriority = nonRequestReply ? null : this.priorityClassifier.classifyOrDefault(input.message);
    const prismaPriority = deterministicPriority ? prismaPriorityBySharedPriority[deterministicPriority] : null;
    const hasExistingRequest = hasOpenPreflightRequest && latestPreflightRequest;
    const triage = nonRequestReply
      ? null
      : await this.triageGuestMessage({
          deterministicPriority: deterministicPriority!,
          message: input.message,
          servicePointLabel: servicePoint.label,
          isFollowup: Boolean(hasExistingRequest)
        });

    return this.prisma.$transaction(async (tx) => {
      const conversation =
        existingConversation ??
        (await tx.conversation.create({
          data: {
            guestSessionId: input.sessionId || null,
            servicePointId: servicePoint.id,
            venueId: servicePoint.venueId
          }
        }));

      if (!conversation) {
        throw new NotFoundException("Service point not found");
      }

      const latestRequest = latestPreflightRequest;
      if (nonRequestReply || triage?.needsStaff === false) {
        const assistantReply = nonRequestReply ?? triage!.assistantReply;
        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            sender: SenderType.GUEST,
            body: input.message,
            metadata: {
              source: "public_qr",
              qrToken: token
            }
          })
        });

        await tx.message.create({
          data: encryptMessageCreateData({
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            sender: SenderType.ASSISTANT,
            body: shouldHandleGreeting ? this.greetingReply(servicePoint.label) : assistantReply,
            metadata: {
              source: "public_qr",
              intent: "non_request",
              ...(triage
                ? {
                    triage: {
                      category: triage.category,
                      needsStaff: triage.needsStaff,
                      priority: triage.priority,
                      summary: triage.summary,
                      title: triage.title
                    }
                  }
                : {})
            }
          })
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
          messages: decryptMessageRecords(messages),
          request: latestRequest ?? null,
          servicePoint,
          chatAvailability: this.publicChatAvailability((servicePoint as any).venue),
          ...(this.publicVenueSummary((servicePoint as any).venue) ? { venue: this.publicVenueSummary((servicePoint as any).venue) } : {})
        };
      }

      // If this is a follow-up with an urgent priority, escalate the existing request
      const isUrgentFollowup = Boolean(hasExistingRequest && deterministicPriority === "urgent");
      const status = deterministicPriority === "urgent" ? RequestStatus.ESCALATED : RequestStatus.NEW;
      
      let supportRequest;
      if (hasExistingRequest) {
        supportRequest = latestRequest;
        // Update existing request status if escalated by urgent follow-up
        if (isUrgentFollowup) {
          supportRequest = await tx.supportRequest.update({
            where: { id: latestRequest.id },
            data: { status: RequestStatus.ESCALATED }
          });
        }
      } else {
        supportRequest = await tx.supportRequest.create({
            data: {
              venueId: servicePoint.venueId,
              servicePointId: servicePoint.id,
              conversationId: conversation.id,
              title: triage!.title,
              category: triage!.category,
              summary: triage!.summary || input.message,
              priority: prismaPriority!,
              deterministicPriority: prismaPriority!,
              status
            }
          });
      }
      const eventType = isUrgentFollowup ? "request.escalated" : hasExistingRequest ? "request.updated" : "request.created";

      await tx.message.create({
        data: encryptMessageCreateData({
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
        })
      });

      await tx.message.create({
        data: encryptMessageCreateData({
          venueId: servicePoint.venueId,
          servicePointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.ASSISTANT,
          body: triage!.assistantReply,
          metadata: {
            source: "public_qr",
            triage: {
              category: triage!.category,
              needsStaff: triage!.needsStaff,
              priority: triage!.priority,
              summary: triage!.summary,
              title: triage!.title
            }
          }
        })
      });

      await tx.requestEvent.create({
        data: {
          venueId: servicePoint.venueId,
          requestId: supportRequest.id,
          type: eventType,
          toStatus: supportRequest.status,
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
        messages: decryptMessageRecords(messages),
        request: supportRequest,
        servicePoint,
        chatAvailability: this.publicChatAvailability((servicePoint as any).venue),
        ...(this.publicVenueSummary((servicePoint as any).venue) ? { venue: this.publicVenueSummary((servicePoint as any).venue) } : {})
      };
    });
  }

  async createVenueGuestMessage(venueSlug: string, input: PublicVenueMessageDto) {
    const venue = await this.prisma.venue.findFirst({
      where: {
        slug: venueSlug
      },
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

    const latestPreflightRequest = Array.isArray((existingConversation as any)?.requests) ? (existingConversation as any).requests[0] : null;
    const hasOpenRequest = latestPreflightRequest ? this.isActiveRequestStatus(latestPreflightRequest.status) : false;
    const nonRequestReply = !hasOpenRequest && !input.quickAction ? this.nonRequestReply(input.message, venue.name) : null;
    const deterministicPriority = nonRequestReply ? null : this.priorityClassifier.classifyOrDefault(input.message);
    const initialTriage = nonRequestReply
      ? null
      : await this.triageGuestMessage({
          deterministicPriority: deterministicPriority!,
          message: `${input.quickAction ? `Quick action: ${input.quickAction}\n` : ""}${input.message}`,
          servicePointLabel: input.locationLabel || servicePoint.label,
          isFollowup: Boolean(hasOpenRequest)
        });
    const locationLabel = input.locationLabel?.trim() || initialTriage?.guestLocationLabel || null;
    const locationSource = input.locationLabel ? "guest" : initialTriage?.guestLocationLabel ? "agent" : null;
    const pendingGuestMessage = Array.isArray((existingConversation as any)?.messages)
      ? (existingConversation as any).messages.find((message: any) => message.sender === SenderType.GUEST && !message.requestId)
      : null;
    const triageMessage = !hasOpenRequest && locationLabel && pendingGuestMessage ? decryptMessageBody(pendingGuestMessage.body) : input.message;
    const triage =
      nonRequestReply
        ? null
        : triageMessage === input.message
        ? initialTriage
        : await this.triageGuestMessage({
            deterministicPriority: deterministicPriority!,
            message: `${triageMessage}\nGuest location: ${locationLabel}`,
            servicePointLabel: locationLabel ?? servicePoint.label,
            isFollowup: false
          });
    const prismaPriority = deterministicPriority ? prismaPriorityBySharedPriority[deterministicPriority] : null;

    return this.prisma.$transaction(async (tx) => {
      const conversation =
        existingConversation ??
        (await tx.conversation.create({
            data: {
              guestLocationLabel: input.locationLabel || null,
              guestLocationSource: input.locationLabel ? "guest" : null,
              guestSessionId: input.sessionId || null,
              servicePointId: servicePoint.id,
              venueId: venue.id
            }
          }));

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      const latestRequest = latestPreflightRequest;

      if (!hasOpenRequest && (nonRequestReply || triage?.needsStaff === false)) {
        const assistantReply = nonRequestReply ?? triage!.assistantReply;
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
            body: assistantReply,
            conversationId: conversation.id,
            metadata: {
              source: "public_venue_qr",
              intent: "non_request",
              ...(triage ? { triage } : {})
            },
            requestId: null,
            sender: SenderType.ASSISTANT,
            servicePointId: servicePoint.id,
            venueId: venue.id
          })
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
          messages: decryptMessageRecords(messages),
          request: latestRequest ?? null,
          servicePoint,
          chatAvailability: this.publicChatAvailability(venue),
          venue: this.publicVenueSummary(venue)
        };
      }

      if (!hasOpenRequest && initialTriage!.needsStaff !== false && !locationLabel) {
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
          where: {
            conversationId: conversation.id
          },
          orderBy: {
            createdAt: "asc"
          }
        });

        return {
          conversationId: conversation.id,
          messages: decryptMessageRecords(messages),
          request: latestRequest ?? null,
          servicePoint,
          chatAvailability: this.publicChatAvailability(venue),
          venue: this.publicVenueSummary(venue)
        };
      }

      // If this is a follow-up with an urgent priority, escalate the existing request
      const isUrgentFollowup = Boolean(hasOpenRequest && deterministicPriority === "urgent");
      const status = deterministicPriority === "urgent" ? RequestStatus.ESCALATED : RequestStatus.NEW;
      
      let supportRequest;
      if (hasOpenRequest) {
        supportRequest = latestRequest;
        // Update existing request status if escalated by urgent follow-up
        if (isUrgentFollowup) {
          supportRequest = await tx.supportRequest.update({
            where: { id: latestRequest.id },
            data: { status: RequestStatus.ESCALATED }
          });
        }
      } else {
        supportRequest = await tx.supportRequest.create({
            data: {
              agentConfidence: triage!.confidence,
              agentPolicyVersion: "v1-semi-autonomous",
              agentSuggestedAction: triage!.suggestedAction,
              category: triage!.category,
              conversationId: conversation.id,
              deterministicPriority: prismaPriority!,
              guestLocationLabel: locationLabel,
              guestLocationSource: locationSource,
              priority: prismaPriority!,
              servicePointId: servicePoint.id,
              status,
              summary: triage!.summary || input.message,
              title: triage!.title,
              venueId: venue.id
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

      await tx.message.create({
        data: encryptMessageCreateData({
          body: triage!.assistantReply,
          conversationId: conversation.id,
          metadata: {
            source: "public_venue_qr",
            triage: triage!
          },
          requestId: supportRequest.id,
          sender: SenderType.ASSISTANT,
          servicePointId: servicePoint.id,
          venueId: venue.id
        })
      });

      await tx.requestEvent.create({
        data: {
          metadata: {
            agentPolicyVersion: "v1-semi-autonomous",
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
        where: {
          conversationId: conversation.id
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      return {
        conversationId: conversation.id,
        messages: decryptMessageRecords(messages),
        request: supportRequest,
        servicePoint,
        chatAvailability: this.publicChatAvailability(venue),
        venue: this.publicVenueSummary(venue)
      };
    });
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
          orderBy: {
            createdAt: "asc"
          }
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

    return {
      conversationId: conversation.id,
      messages: decryptMessageRecords(conversation.messages),
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
          orderBy: {
            createdAt: "asc"
          }
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

    return {
      conversationId: conversation.id,
      messages: decryptMessageRecords(conversation.messages),
      request: conversation.requests[0] ?? null,
      servicePoint,
      chatAvailability: this.publicChatAvailability(venue),
      venue: this.publicVenueSummary(venue)
    };
  }
}
