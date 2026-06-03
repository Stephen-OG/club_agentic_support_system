import { ForbiddenException, Injectable } from "@nestjs/common";
import { StaffRole } from "@prisma/client";
import type { AuthContext } from "../auth/auth-context";
import { PrismaService } from "../database/prisma.service";

export type OnboardingStepId = "workspace" | "venue" | "opening_hours" | "qr_points" | "team" | "test_request";
export type OnboardingActionView = "account" | "venues" | "team" | "operations";

export type OnboardingStep = {
  id: OnboardingStepId;
  label: string;
  detail: string;
  complete: boolean;
  actionLabel: string;
  actionView: OnboardingActionView;
};

export type OnboardingStatus = {
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
  steps: OnboardingStep[];
};

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(auth: AuthContext): Promise<OnboardingStatus> {
    if (auth.role !== "owner" && auth.role !== "admin") {
      throw new ForbiddenException("Only workspace owners and admins can view onboarding status");
    }

    const [
      venueCount,
      venueWithOpeningHoursCount,
      servicePointCount,
      teamMembershipCount,
      operationalMembershipCount,
      requestCount
    ] = await Promise.all([
      this.prisma.venue.count({ where: { workspaceId: auth.workspaceId } }),
      this.prisma.venue.count({
        where: {
          workspaceId: auth.workspaceId,
          openingHours: {
            some: {}
          }
        }
      }),
      this.prisma.servicePoint.count({
        where: {
          isActive: true,
          venue: {
            workspaceId: auth.workspaceId
          }
        }
      }),
      this.prisma.staffMembership.count({
        where: {
          workspaceId: auth.workspaceId,
          isActive: true
        }
      }),
      this.prisma.staffMembership.count({
        where: {
          workspaceId: auth.workspaceId,
          isActive: true,
          role: {
            in: [StaffRole.MANAGER, StaffRole.STAFF, StaffRole.SECURITY]
          }
        }
      }),
      this.prisma.supportRequest.count({
        where: {
          venue: {
            workspaceId: auth.workspaceId
          }
        }
      })
    ]);

    const steps: OnboardingStep[] = [
      {
        id: "workspace",
        label: "Workspace created",
        detail: "Your workspace profile is active.",
        complete: Boolean(auth.workspaceId),
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
