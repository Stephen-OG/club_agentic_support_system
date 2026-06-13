ALTER TABLE "AuthEmailToken"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedAt" TIMESTAMP(3);

CREATE INDEX "AuthEmailToken_lockedAt_idx" ON "AuthEmailToken"("lockedAt");
