import { getPrimaryMembership, getPrimaryRole } from "./auth/role-policy";
import type { CommandUser } from "./auth/types";

export type DashboardExperienceMode = "owner" | "admin" | "manager";

export type DashboardExperience = {
  mode: DashboardExperienceMode;
  eyebrow: string;
  title: string;
  scopeLabel: string;
  scopeVenueIds: string[] | null;
  showLaunchChecklist: boolean;
  actionHeading: string;
  actionEmptyCopy: string;
  volumeTitle: string;
  kpiLabels: {
    health: string;
    risk: string;
    speed: string;
    satisfaction: string;
  };
  panels: {
    adminControls: boolean;
    aiTriageQuality: boolean;
    servicePointHotspots: boolean;
    staffWorkload: boolean;
    venuePerformance: boolean;
  };
};

export function getDashboardExperience(user: CommandUser): DashboardExperience {
  const role = getPrimaryRole(user);
  const managerVenueIds = Array.from(new Set(user.memberships.filter((membership) => membership.role === "manager" && membership.venueId).map((membership) => membership.venueId as string)));
  const managerVenueNames = user.memberships
    .filter((membership) => membership.role === "manager" && membership.venue)
    .map((membership) => membership.venue?.name)
    .filter((name): name is string => Boolean(name));

  if (role === "manager") {
    return {
      mode: "manager",
      eyebrow: "Manager intelligence",
      title: "Venue Dashboard",
      scopeLabel: managerVenueNames.join(", ") || getPrimaryMembership(user)?.venue?.name || "Assigned venue",
      scopeVenueIds: managerVenueIds,
      showLaunchChecklist: false,
      actionHeading: "Venue Action Required",
      actionEmptyCopy: "This venue is steady. No urgent manager actions detected from current request data.",
      volumeTitle: "Venue Demand Heatmap",
      kpiLabels: {
        health: "Venue health",
        risk: "Venue response risk",
        speed: "Venue acknowledgement",
        satisfaction: "Venue satisfaction"
      },
      panels: {
        adminControls: false,
        aiTriageQuality: false,
        servicePointHotspots: true,
        staffWorkload: true,
        venuePerformance: false
      }
    };
  }

  if (role === "owner") {
    return {
      mode: "owner",
      eyebrow: "Owner intelligence",
      title: "Organization Dashboard",
      scopeLabel: getPrimaryMembership(user)?.organization.name || "Organization",
      scopeVenueIds: null,
      showLaunchChecklist: true,
      actionHeading: "Business Action Required",
      actionEmptyCopy: "Your organization is steady. No urgent owner actions detected from current request data.",
      volumeTitle: "Organization Demand Heatmap",
      kpiLabels: {
        health: "Organization health",
        risk: "Portfolio response risk",
        speed: "Organization acknowledgement",
        satisfaction: "Guest satisfaction"
      },
      panels: {
        adminControls: false,
        aiTriageQuality: false,
        servicePointHotspots: true,
        staffWorkload: true,
        venuePerformance: true
      }
    };
  }

  return {
    mode: "admin",
    eyebrow: "Admin intelligence",
    title: "Operations Dashboard",
    scopeLabel: "All managed venues",
    scopeVenueIds: null,
    showLaunchChecklist: false,
    actionHeading: "Admin Action Required",
    actionEmptyCopy: "Everything looks steady. No urgent admin interventions detected from current request data.",
    volumeTitle: "Request Volume Heatmap",
    kpiLabels: {
      health: "Operational health",
      risk: "Response risk forecast",
      speed: "Avg acknowledgement",
      satisfaction: "Guest satisfaction"
    },
      panels: {
        adminControls: true,
        aiTriageQuality: false,
        servicePointHotspots: true,
        staffWorkload: true,
        venuePerformance: true
      }
  };
}
