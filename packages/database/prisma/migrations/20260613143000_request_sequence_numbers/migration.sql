ALTER TABLE "SupportRequest" ADD COLUMN "sequenceNumber" INTEGER;

WITH numbered_requests AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "conversationId" ORDER BY "createdAt" ASC, id ASC) AS sequence_number
  FROM "SupportRequest"
)
UPDATE "SupportRequest"
SET "sequenceNumber" = numbered_requests.sequence_number
FROM numbered_requests
WHERE "SupportRequest".id = numbered_requests.id;

ALTER TABLE "SupportRequest" ALTER COLUMN "sequenceNumber" SET NOT NULL;
ALTER TABLE "SupportRequest" ALTER COLUMN "sequenceNumber" SET DEFAULT 1;

CREATE UNIQUE INDEX "SupportRequest_conversationId_sequenceNumber_key" ON "SupportRequest"("conversationId", "sequenceNumber");
