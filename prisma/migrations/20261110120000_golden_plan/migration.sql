-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'MILESTONE';
ALTER TYPE "NotificationKind" ADD VALUE 'WEEKLY_WINNER';
ALTER TYPE "NotificationKind" ADD VALUE 'PIN_LIVE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyGolden" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Angle" ADD COLUMN     "dhash" TEXT;

-- CreateTable
CREATE TABLE "PointEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "ref" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomePin" (
    "id" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomePin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyWinner" (
    "week" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "pinId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyWinner_pkey" PRIMARY KEY ("week")
);

-- CreateTable
CREATE TABLE "WeeklyMission" (
    "week" TEXT NOT NULL,
    "topics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyMission_pkey" PRIMARY KEY ("week")
);

-- CreateIndex
CREATE INDEX "PointEntry_userId_createdAt_idx" ON "PointEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PointEntry_createdAt_idx" ON "PointEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointEntry_userId_kind_ref_key" ON "PointEntry"("userId", "kind", "ref");

-- CreateIndex
CREATE INDEX "HomePin_startsAt_endsAt_idx" ON "HomePin"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "HomePin_userId_idx" ON "HomePin"("userId");

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomePin" ADD CONSTRAINT "HomePin_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomePin" ADD CONSTRAINT "HomePin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyWinner" ADD CONSTRAINT "WeeklyWinner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

