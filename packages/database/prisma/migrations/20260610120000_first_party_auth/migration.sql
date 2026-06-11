CREATE TABLE "AuthUser" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMP(3),
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuthUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "authUserId" UUID NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "tokenVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "AuthEmailTokenType" AS ENUM ('email_verification', 'password_reset', 'staff_invitation');

CREATE TABLE "AuthEmailToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "authUserId" UUID NOT NULL,
  "type" "AuthEmailTokenType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthEmailToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthUser_email_key" ON "AuthUser"("email");
CREATE INDEX "AuthUser_email_idx" ON "AuthUser"("email");
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");
CREATE INDEX "AuthSession_authUserId_expiresAt_idx" ON "AuthSession"("authUserId", "expiresAt");
CREATE INDEX "AuthSession_revokedAt_idx" ON "AuthSession"("revokedAt");
CREATE UNIQUE INDEX "AuthEmailToken_tokenHash_key" ON "AuthEmailToken"("tokenHash");
CREATE INDEX "AuthEmailToken_authUserId_type_expiresAt_idx" ON "AuthEmailToken"("authUserId", "type", "expiresAt");
CREATE INDEX "AuthEmailToken_usedAt_idx" ON "AuthEmailToken"("usedAt");

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_authUserId_fkey"
  FOREIGN KEY ("authUserId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthEmailToken"
  ADD CONSTRAINT "AuthEmailToken_authUserId_fkey"
  FOREIGN KEY ("authUserId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF to_regclass('public."StaffProfile"') IS NOT NULL THEN
    INSERT INTO "AuthUser" (
      "id",
      "email",
      "passwordHash",
      "displayName",
      "emailVerifiedAt",
      "mustChangePassword",
      "tokenVersion",
      "createdAt",
      "updatedAt"
    )
    SELECT
      "authUserId"::uuid,
      COALESCE("email", CONCAT("id"::text, '@migration.invalid')),
      'disabled$legacy-provider-password-not-imported',
      "displayName",
      CURRENT_TIMESTAMP,
      true,
      1,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "StaffProfile"
    WHERE "authUserId" IS NOT NULL
    ON CONFLICT ("id") DO NOTHING;

    ALTER TABLE "StaffProfile"
      ALTER COLUMN "authUserId" TYPE UUID USING "authUserId"::uuid;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'StaffProfile_authUserId_fkey'
    ) THEN
      ALTER TABLE "StaffProfile"
        ADD CONSTRAINT "StaffProfile_authUserId_fkey"
        FOREIGN KEY ("authUserId") REFERENCES "AuthUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
