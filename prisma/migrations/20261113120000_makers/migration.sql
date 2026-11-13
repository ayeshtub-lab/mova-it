-- «🏪 عندي مشروع»: makers (approved by hand) and their «🏪» moment. Additive only: a new enum, a new
-- table, and one new notification kind.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'MAKER_APPROVED';

CREATE TYPE "MakerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "Maker" (
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "placeId" TEXT,
    "whatsapp" TEXT,
    "pageUrl" TEXT,
    "about" TEXT,
    "status" "MakerStatus" NOT NULL DEFAULT 'PENDING',
    "momentId" TEXT,
    "contactTaps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Maker_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "Maker_momentId_key" ON "Maker"("momentId");
CREATE INDEX "Maker_status_createdAt_idx" ON "Maker"("status", "createdAt");

ALTER TABLE "Maker" ADD CONSTRAINT "Maker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Maker" ADD CONSTRAINT "Maker_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
