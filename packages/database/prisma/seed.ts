import { PrismaClient, StaffRole } from "@prisma/client";

const prisma = new PrismaClient();

const workspaceId = "00000000-0000-0000-0000-000000000001";
const venueId = "00000000-0000-0000-0000-000000000101";
const mainFloorId = "00000000-0000-0000-0000-000000000201";
const venueSupportServicePointId = "00000000-0000-0000-0000-000000000300";

type SeedStaff = readonly [id: string, email: string, displayName: string, role: StaffRole, authUserId?: string];

async function main() {
  await prisma.workspace.upsert({
    create: {
      id: workspaceId,
      name: "Demo Workspace",
      slug: "demo"
    },
    update: {
      name: "Demo Workspace"
    },
    where: {
      id: workspaceId
    }
  });

  await prisma.venue.upsert({
    create: {
      id: venueId,
      name: "Demo Venue",
      slug: "demo-venue",
      workspaceId
    },
    update: {
      name: "Demo Venue"
    },
    where: {
      id: venueId
    }
  });

  await prisma.venueLocation.upsert({
    create: {
      id: mainFloorId,
      name: "Main Floor",
      venueId,
      zone: "Main Floor"
    },
    update: {
      zone: "Main Floor"
    },
    where: {
      id: mainFloorId
    }
  });

  const servicePoints = [
    ["00000000-0000-0000-0000-000000000301", "Table 1", "demo-table-1"],
    ["00000000-0000-0000-0000-000000000302", "Table 2", "demo-table-2"],
    ["00000000-0000-0000-0000-000000000303", "Table 3", "demo-table-3"],
    ["00000000-0000-0000-0000-000000000304", "Table 4", "demo-table-4"]
  ] as const;


  await prisma.servicePoint.upsert({
    create: {
      id: venueSupportServicePointId,
      label: "Venue support",
      locationId: mainFloorId,
      qrToken: "demo-venue-support",
      venueId
    },
    update: {
      isActive: true,
      label: "Venue support",
      locationId: mainFloorId
    },
    where: {
      id: venueSupportServicePointId
    }
  });

  for (const [id, label, qrToken] of servicePoints) {
    await prisma.servicePoint.upsert({
      create: {
        id,
        label,
        locationId: mainFloorId,
        qrToken,
        venueId
      },
      update: {
        isActive: true,
        label,
        locationId: mainFloorId
      },
      where: {
        id
      }
    });
  }

  const staff: readonly SeedStaff[] = [
    ["00000000-0000-0000-0000-000000000401", "owner@demo.local", "Olivia Owner", StaffRole.OWNER],
    ["00000000-0000-0000-0000-000000000402", "maya.manager@demo.local", "Maya Manager", StaffRole.MANAGER],
    ["00000000-0000-0000-0000-000000000403", "alex.admin@demo.local", "Alex Admin", StaffRole.ADMIN],
    ["00000000-0000-0000-0000-000000000404", "sam.staff@demo.local", "Sam Staff", StaffRole.STAFF],
    ["00000000-0000-0000-0000-000000000405", "riley.runner@demo.local", "Riley Runner", StaffRole.STAFF],
    ["00000000-0000-0000-0000-000000000406", "casey.security@demo.local", "Casey Security", StaffRole.SECURITY]
  ];

  for (const [id, email, displayName, role, authUserId] of staff) {
    await prisma.staffProfile.upsert({
      create: {
        id,
        authUserId,
        displayName,
        email
      },
      update: {
        authUserId,
        displayName,
        email
      },
      where: {
        id
      }
    });

    await prisma.staffMembership.upsert({
      create: {
        id: id.replace("0004", "0005"),
        role,
        staffProfileId: id,
        venueId,
        workspaceId
      },
      update: {
        isActive: true,
        role
      },
      where: {
        id: id.replace("0004", "0005")
      }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
