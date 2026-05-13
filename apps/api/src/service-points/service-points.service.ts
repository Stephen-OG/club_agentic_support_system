import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context";
import { PrismaService } from "../database/prisma.service";
import { AiTriageService } from "../triage/ai-triage.service";
import { PriorityClassifierService } from "../triage/priority-classifier.service";
import { VenueAccessService } from "../venues/access.service";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import type { PublicGuestMessageDto } from "./dto/public-guest-message.dto";

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
    return this.prisma.venue.create({
      data: {
        workspaceId: auth.workspaceId,
        name: input.name.trim(),
        slug: input.slug,
        timezone: input.timezone || "Europe/London"
      }
    });
  }

  async createServicePoint(auth: AuthContext, venueId: string, input: CreateServicePointDto) {
    const venue = await this.prisma.venue.findUniqueOrThrow({ where: { id: venueId } });
    this.venueAccess.assertCanManageVenue(auth, { workspaceId: venue.workspaceId, venueId });

    return this.prisma.servicePoint.create({
      data: {
        venueId,
        locationId: input.locationId || null,
        label: input.label.trim(),
        qrToken: this.createQrToken(input.label)
      }
    });
  }

  createGuestMessage(token: string, input: PublicGuestMessageDto) {
    const priority = this.priorityClassifier.classifyOrDefault(input.message);
    const servicePointLabel = token;
    const triage = this.aiTriage.createFallback({
      deterministicPriority: priority,
      message: input.message,
      servicePointLabel
    });

    return {
      event: priority === "urgent" ? "request.escalated" : "request.created",
      priority,
      qrToken: token,
      status: priority === "urgent" ? "escalated" : "new",
      triage
    };
  }
}
