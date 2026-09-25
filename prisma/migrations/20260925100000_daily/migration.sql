-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DailyPlan" (
    "day" TEXT NOT NULL,
    "themeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "momentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "DailyVote" (
    "day" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "themeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyVote_pkey" PRIMARY KEY ("day","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_momentId_key" ON "DailyPlan"("momentId");

-- CreateIndex
CREATE INDEX "DailyVote_day_themeKey_idx" ON "DailyVote"("day", "themeKey");

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyVote" ADD CONSTRAINT "DailyVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

