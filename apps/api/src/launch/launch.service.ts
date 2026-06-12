import { ForbiddenException, Injectable } from "@nestjs/common";
import { StaffRole } from "@prisma/client";
import type { AuthContext } from "../auth/auth-context";
import { PrismaService } from "../database/prisma.service";

export type LaunchStepId = "organization" | "venue" | "opening_hours" | "qr_points" | "team" | "test_request";
export type LaunchActionView = "account" | "venues" | "team" | "operations";

export type LaunchStep = {
  id: LaunchStepId;
  label: string;
  detail: string;
  complete: boolean;
  actionLabel: string;
  actionView: LaunchActionView;
};

export type LaunchStatus = {
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
  steps: LaunchStep[];
};

@Injectable()
export class LaunchService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(auth: AuthContext): Promise<LaunchStatus> {
    if (auth.role !== "owner" && auth.role !== "admin") {
      throw new ForbiddenException("Only organization owners and admins can view launch status");
    }

    const [
      venueCount,
      venueWithOpeningHoursCount,
      servicePointCount,
      teamMembershipCount,
      operationalMembershipCount,
      requestCount
    ] = await Promise.all([
      this.prisma.venue.count({ where: { organizationId: auth.organizationId } }),
      this.prisma.venue.count({
        where: {
          organizationId: auth.organizationId,
          hours: {
            some: { dayOfWeek: { gte: 0 } }
          }
        }
      }),
      this.prisma.qrPoint.count({
        where: {
          isActive: true,
          venue: {
            organizationId: auth.organizationId
          }
        }
      }),
      this.prisma.teamRole.count({
        where: {
          organizationId: auth.organizationId,
          isActive: true
        }
      }),
      this.prisma.teamRole.count({
        where: {
          organizationId: auth.organizationId,
          isActive: true,
          role: {
            in: [StaffRole.MANAGER, StaffRole.STAFF, StaffRole.SECURITY]
          }
        }
      }),
      this.prisma.supportRequest.count({
        where: {
          venue: {
            organizationId: auth.organizationId
          }
        }
      })
    ]);

    const steps: LaunchStep[] = [
      {
        id: "organization",
        label: "Organization created",
        detail: "Your organization profile is active.",
        complete: Boolean(auth.organizationId),
        actionLabel: "Review settings",
        actionView: "account"
      },
      {
        id: "venue",
        label: "Create your first venue",
        detail: venueCount ? `${venueCount} venue${venueCount === 1 ? "" : "s"} configured.` : "Add the first venue guests will use.",
        complete: venueCount > 0,
        actionLabel: "Open venues",
        actionView: "venues"
      },
      {
        id: "opening_hours",
        label: "Confirm opening hours",
        detail: venueWithOpeningHoursCount ? "At least one venue has opening hours." : "Set hours so guest chat availability is accurate.",
        complete: venueWithOpeningHoursCount > 0,
        actionLabel: "Set hours",
        actionView: "account"
      },
      {
        id: "qr_points",
        label: "Generate guest QR points",
        detail: servicePointCount ? `${servicePointCount} active QR point${servicePointCount === 1 ? "" : "s"} ready.` : "Create venue or service-point QR codes.",
        complete: servicePointCount > 0,
        actionLabel: "Manage QR points",
        actionView: "venues"
      },
      {
        id: "team",
        label: "Invite your operations team",
        detail:
          teamMembershipCount > 1 && operationalMembershipCount > 0
            ? "At least one operational teammate is active."
            : "Add a manager, staff, or security user before launch.",
        complete: teamMembershipCount > 1 && operationalMembershipCount > 0,
        actionLabel: "Invite team",
        actionView: "team"
      },
      {
        id: "test_request",
        label: "Run a test guest request",
        detail: requestCount ? "A request has reached the operations workflow." : "Send one QR request and confirm it appears in operations.",
        complete: requestCount > 0,
        actionLabel: "Open operations",
        actionView: "operations"
      }
    ];

    const completedCount = steps.filter((step) => step.complete).length;

    return {
      isComplete: completedCount === steps.length,
      completedCount,
      totalCount: steps.length,
      steps
    };
  }
}
