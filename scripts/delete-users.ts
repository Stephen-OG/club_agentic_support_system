import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const emails = ["ogunderostephen@icloud.com", "maxwellororho@gmail.com"];

async function deleteUser(email: string) {
  const authUser = await prisma.authUser.findUnique({ where: { email } });
  if (!authUser) {
    console.log(`[SKIP] No AuthUser found for email: ${email}`);
    return;
  }

  console.log(`[FOUND] AuthUser: id=${authUser.id}, email=${authUser.email}`);

  const staffProfile = await prisma.staffProfile.findUnique({
    where: { authUserId: authUser.id },
  });

  if (staffProfile) {
    console.log(
      `  StaffProfile: id=${staffProfile.id}, displayName=${staffProfile.displayName}, email=${staffProfile.email ?? "(no email on profile)"}`
    );

    const membershipCount = await prisma.staffMembership.count({
      where: { staffProfileId: staffProfile.id },
    });
    console.log(`  Memberships to delete: ${membershipCount}`);

    await prisma.staffProfile.delete({ where: { id: staffProfile.id } });
    console.log(`  [DELETED] StaffProfile ${staffProfile.id}`);
  } else {
    console.log(`  No StaffProfile found for this AuthUser`);
  }

  await prisma.authUser.delete({ where: { id: authUser.id } });
  console.log(`[DELETED] AuthUser ${authUser.id}`);
}

async function main() {
  console.log("=== Delete users script ===\n");
  for (const email of emails) {
    try {
      await deleteUser(email);
    } catch (err) {
      console.error(`[ERROR] Failed to process ${email}:`, err);
    }
    console.log("");
  }
  await prisma.$disconnect();
  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
